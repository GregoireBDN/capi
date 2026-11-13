import '#/load-env'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { asc, eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '#/database/schema'
import {
  accountsTable,
  budgetsTable,
  categoriesTable,
  type InsertTransaction,
  transactionsTable,
} from '#/database/schema'
import { BudgetsService } from './budgets.service'

/**
 * Integration checks against the migrated test database. Each test runs in a
 * transaction that is rolled back, starting without budgets or transactions.
 * Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000'

describe.skipIf(!process.env.DATABASE_URL)('BudgetsService (database)', () => {
  let client: postgres.Sql
  let db: Db

  beforeAll(() => {
    client = postgres(process.env.DATABASE_URL!, { max: 1 })
    db = drizzle(client, { schema })
  })

  afterAll(async () => {
    await client.end()
  })

  interface Fixture {
    tx: Tx
    service: BudgetsService
    checking: string
    savings: string
    groceries: string
    rent: string
    leisure: string
    salary: string
    livret: string
  }

  async function withFixture(fn: (f: Fixture) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        await tx.delete(budgetsTable)
        await tx.delete(transactionsTable)
        const [checking, savings] = await tx
          .insert(accountsTable)
          .values([
            { name: 'Test checking', type: 'checking' },
            { name: 'Test savings', type: 'savings' },
          ])
          .returning()
        const categories = await tx
          .insert(categoriesTable)
          .values([
            {
              slug: 'test_groceries',
              name: 'Test courses',
              kind: 'expense',
              color: '#d97706',
            },
            { slug: 'test_rent', name: 'Test loyer', kind: 'expense' },
            { slug: 'test_leisure', name: 'Test loisirs', kind: 'expense' },
            { slug: 'test_salary', name: 'Test salaire', kind: 'income' },
            { slug: 'test_livret', name: 'Test livret', kind: 'transfer' },
          ])
          .returning()
        const bySlug = new Map(categories.map((c) => [c.slug, c.id]))
        // The service only reads `db`; the transaction stands in for it, and
        // its own transactions become savepoints.
        await fn({
          tx,
          service: new BudgetsService({ db: tx } as never),
          checking: checking.id,
          savings: savings.id,
          groceries: bySlug.get('test_groceries')!,
          rent: bySlug.get('test_rent')!,
          leisure: bySlug.get('test_leisure')!,
          salary: bySlug.get('test_salary')!,
          livret: bySlug.get('test_livret')!,
        })
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
  }

  let hash = 0
  function transaction(
    accountId: string,
    overrides: Partial<InsertTransaction> = {},
  ): InsertTransaction {
    hash++
    return {
      accountId,
      bookingDate: '2026-10-15',
      amountCents: -1_000,
      rawLabel: 'PAIEMENT CB FAKEMART TESTVILLE',
      kind: 'expense',
      dedupeHash: `budget-test-hash-${hash}`,
      ...overrides,
    }
  }

  async function insert(tx: Tx, rows: InsertTransaction[]) {
    await tx.insert(transactionsTable).values(rows)
  }

  async function storedRows(tx: Tx, categoryId: string) {
    return tx
      .select({
        effectiveFrom: budgetsTable.effectiveFrom,
        monthlyTargetCents: budgetsTable.monthlyTargetCents,
        note: budgetsTable.note,
      })
      .from(budgetsTable)
      .where(eq(budgetsTable.categoryId, categoryId))
      .orderBy(asc(budgetsTable.effectiveFrom))
  }

  describe('month', () => {
    it('defaults to the month the data stops in while the current one has none', async () => {
      await withFixture(async ({ tx, service, checking, groceries }) => {
        await insert(tx, [
          transaction(checking, {
            categoryId: groceries,
            bookingDate: '2026-10-28',
            amountCents: -3_000,
          }),
        ])
        const now = new Date('2026-11-02T08:00:00Z')

        const shown = await service.month(undefined, undefined, now)
        expect(shown.month).toBe('2026-10')
        expect(shown.period).toMatchObject({
          month: '2026-10',
          dataUntil: '2026-10-28',
          status: 'partial',
          throughDay: 28,
        })

        const november = await service.month('2026-11', undefined, now)
        expect(november.month).toBe('2026-11')
        expect(november.period.status).toBe('empty')
      })
    })

    it('compares the target with the expenses of the category, refunds deducted', async () => {
      await withFixture(async ({ tx, service, checking, groceries }) => {
        await service.upsert(groceries, '2026-10', {
          monthlyTargetCents: 40_000,
        })
        await insert(tx, [
          transaction(checking, {
            categoryId: groceries,
            amountCents: -25_000,
          }),
          transaction(checking, { categoryId: groceries, amountCents: -9_000 }),
          // Refund filed in the category: reduces the spending.
          transaction(checking, { categoryId: groceries, amountCents: 2_000 }),
        ])

        const result = await service.month('2026-10')

        expect(result.month).toBe('2026-10')
        expect(result.items).toEqual([
          expect.objectContaining({
            categoryId: groceries,
            slug: 'test_groceries',
            name: 'Test courses',
            color: '#d97706',
            targetCents: 40_000,
            effectiveFrom: '2026-10',
            spentCents: 32_000,
            spentExcludingOneOffsCents: 32_000,
            remainingCents: 8_000,
            percentUsed: 80,
            status: 'warning',
          }),
        ])
      })
    })

    it('never counts transfers, income or other months', async () => {
      await withFixture(
        async ({
          tx,
          service,
          checking,
          savings,
          groceries,
          livret,
          salary,
        }) => {
          await service.upsert(groceries, '2026-01', {
            monthlyTargetCents: 10_000,
          })
          await insert(tx, [
            transaction(checking, {
              categoryId: groceries,
              amountCents: -3_000,
            }),
            // A move to the user's own savings, even filed in the category.
            transaction(checking, {
              categoryId: groceries,
              kind: 'transfer',
              amountCents: -50_000,
            }),
            transaction(savings, {
              categoryId: livret,
              kind: 'transfer',
              amountCents: 50_000,
            }),
            // Income filed in an expense category is not a refund.
            transaction(checking, {
              categoryId: groceries,
              kind: 'income',
              amountCents: 7_000,
            }),
            transaction(checking, { categoryId: salary, kind: 'income' }),
            // Month boundaries: the last day before and the first day after.
            transaction(checking, {
              categoryId: groceries,
              bookingDate: '2026-09-30',
              amountCents: -99_000,
            }),
            transaction(checking, {
              categoryId: groceries,
              bookingDate: '2026-11-01',
              amountCents: -99_000,
            }),
            transaction(checking, {
              categoryId: groceries,
              bookingDate: '2026-10-01',
              amountCents: -500,
            }),
            transaction(checking, {
              categoryId: groceries,
              bookingDate: '2026-10-31',
              amountCents: -500,
            }),
          ])

          const { items, totals, unbudgeted } = await service.month('2026-10')

          expect(items[0].spentCents).toBe(4_000)
          expect(totals.spentCents).toBe(4_000)
          expect(unbudgeted.totalCents).toBe(0)
          expect(unbudgeted.top).toEqual([])
        },
      )
    })

    it('reports the spending without one-offs', async () => {
      await withFixture(async ({ tx, service, checking, leisure }) => {
        await service.upsert(leisure, '2026-10', { monthlyTargetCents: 10_000 })
        await insert(tx, [
          transaction(checking, { categoryId: leisure, amountCents: -4_000 }),
          transaction(checking, {
            categoryId: leisure,
            amountCents: -30_000,
            isOneOff: true,
          }),
        ])

        const { items, totals } = await service.month('2026-10')

        expect(items[0]).toMatchObject({
          spentCents: 34_000,
          spentExcludingOneOffsCents: 4_000,
          remainingCents: -24_000,
          percentUsed: 340,
          status: 'over',
        })
        expect(totals.spentExcludingOneOffsCents).toBe(4_000)
      })
    })

    it('applies the status thresholds at 80 % and 100 %', async () => {
      await withFixture(
        async ({ tx, service, checking, groceries, rent, leisure }) => {
          for (const categoryId of [groceries, rent, leisure]) {
            await service.upsert(categoryId, '2026-10', {
              monthlyTargetCents: 10_000,
            })
          }
          await insert(tx, [
            transaction(checking, {
              categoryId: groceries,
              amountCents: -7_999,
            }),
            transaction(checking, { categoryId: rent, amountCents: -10_000 }),
            transaction(checking, {
              categoryId: leisure,
              amountCents: -10_001,
            }),
          ])

          const { items, totals } = await service.month('2026-10')
          const status = Object.fromEntries(
            items.map((item) => [item.slug, item.status]),
          )

          expect(status).toEqual({
            test_groceries: 'ok',
            test_rent: 'warning',
            test_leisure: 'over',
          })
          // Highest share used first.
          expect(items.map((item) => item.slug)).toEqual([
            'test_leisure',
            'test_rent',
            'test_groceries',
          ])
          expect(totals).toMatchObject({
            targetCents: 30_000,
            spentCents: 28_000,
            remainingCents: 2_000,
            budgetCount: 3,
            overCount: 1,
            warningCount: 1,
            status: 'warning',
          })
          // Exactly 80 % is already a warning.
          await insert(tx, [
            transaction(checking, { categoryId: groceries, amountCents: -1 }),
          ])
          const again = await service.month('2026-10')
          expect(
            again.items.find((item) => item.slug === 'test_groceries')?.status,
          ).toBe('warning')
        },
      )
    })

    it('lists the spending outside the budgeted categories', async () => {
      await withFixture(
        async ({ tx, service, checking, groceries, rent, leisure }) => {
          await service.upsert(groceries, '2026-10', {
            monthlyTargetCents: 10_000,
          })
          await insert(tx, [
            transaction(checking, {
              categoryId: groceries,
              amountCents: -1_000,
            }),
            transaction(checking, { categoryId: rent, amountCents: -80_000 }),
            transaction(checking, { categoryId: leisure, amountCents: -2_500 }),
            transaction(checking, { categoryId: null, amountCents: -1_500 }),
          ])

          const { unbudgeted } = await service.month('2026-10')

          expect(unbudgeted.totalCents).toBe(84_000)
          expect(unbudgeted.categoryCount).toBe(3)
          expect(unbudgeted.top).toEqual([
            expect.objectContaining({
              categoryId: rent,
              name: 'Test loyer',
              budgetable: true,
              spentCents: 80_000,
            }),
            expect.objectContaining({ categoryId: leisure, spentCents: 2_500 }),
            {
              categoryId: null,
              slug: null,
              name: null,
              color: null,
              budgetable: false,
              spentCents: 1_500,
            },
          ])
        },
      )
    })

    it('uses the target in effect for the month', async () => {
      await withFixture(async ({ service, groceries }) => {
        await service.upsert(groceries, '2026-03', {
          monthlyTargetCents: 30_000,
        })
        await service.upsert(groceries, '2026-07', {
          monthlyTargetCents: 45_000,
        })

        expect((await service.month('2026-02')).items).toEqual([])
        expect((await service.month('2026-03')).items[0]).toMatchObject({
          targetCents: 30_000,
          effectiveFrom: '2026-03',
        })
        expect((await service.month('2026-06')).items[0].targetCents).toBe(
          30_000,
        )
        expect((await service.month('2026-07')).items[0].targetCents).toBe(
          45_000,
        )
        expect((await service.month('2027-01')).items[0]).toMatchObject({
          targetCents: 45_000,
          effectiveFrom: '2026-07',
        })
      })
    })
  })

  describe('upsert', () => {
    it('replaces the target of the same month and keeps the history', async () => {
      await withFixture(async ({ tx, service, groceries }) => {
        await service.upsert(groceries, '2026-09', {
          monthlyTargetCents: 30_000,
          note: 'Courses de base',
        })
        const updated = await service.upsert(groceries, '2026-11', {
          monthlyTargetCents: 35_000,
        })
        await service.upsert(groceries, '2026-11', {
          monthlyTargetCents: 36_000,
        })

        expect(updated).toMatchObject({
          categoryId: groceries,
          effectiveFrom: '2026-11',
          monthlyTargetCents: 35_000,
          // Omitted: carried over from the target in effect.
          note: 'Courses de base',
        })
        expect(await storedRows(tx, groceries)).toEqual([
          {
            effectiveFrom: '2026-09-01',
            monthlyTargetCents: 30_000,
            note: 'Courses de base',
          },
          {
            effectiveFrom: '2026-11-01',
            monthlyTargetCents: 36_000,
            note: 'Courses de base',
          },
        ])
        await service.upsert(groceries, '2026-11', {
          monthlyTargetCents: 36_000,
          note: null,
        })
        expect((await storedRows(tx, groceries))[1].note).toBeNull()
      })
    })

    it('only accepts existing expense categories', async () => {
      await withFixture(async ({ service, salary, livret }) => {
        for (const categoryId of [salary, livret]) {
          await expect(
            service.upsert(categoryId, '2026-11', { monthlyTargetCents: 100 }),
          ).rejects.toBeInstanceOf(BadRequestException)
        }
        await expect(
          service.upsert(UNKNOWN_ID, '2026-11', { monthlyTargetCents: 100 }),
        ).rejects.toBeInstanceOf(NotFoundException)
      })
    })

    it('refuses a target that is not positive (database check)', async () => {
      await withFixture(async ({ service, groceries }) => {
        await expect(
          service.upsert(groceries, '2026-11', { monthlyTargetCents: 0 }),
        ).rejects.toThrow()
      })
    })
  })

  describe('remove', () => {
    it('ends the budget from the month on and keeps earlier months', async () => {
      await withFixture(async ({ tx, service, groceries }) => {
        await service.upsert(groceries, '2026-06', {
          monthlyTargetCents: 30_000,
        })
        // A change planned after the end: dropped.
        await service.upsert(groceries, '2026-12', {
          monthlyTargetCents: 50_000,
        })

        await service.remove(groceries, '2026-11')

        expect(await storedRows(tx, groceries)).toEqual([
          {
            effectiveFrom: '2026-06-01',
            monthlyTargetCents: 30_000,
            note: null,
          },
          { effectiveFrom: '2026-11-01', monthlyTargetCents: null, note: null },
        ])
        expect((await service.month('2026-10')).items).toHaveLength(1)
        expect((await service.month('2026-11')).items).toEqual([])
        expect((await service.month('2027-01')).items).toEqual([])

        // Idempotent.
        await service.remove(groceries, '2026-11')
        expect(await storedRows(tx, groceries)).toHaveLength(2)

        // Budgeting again from a later month.
        await service.upsert(groceries, '2027-02', {
          monthlyTargetCents: 20_000,
        })
        expect((await service.month('2027-01')).items).toEqual([])
        expect((await service.month('2027-02')).items[0].targetCents).toBe(
          20_000,
        )
      })
    })

    it('deletes a budget that starts in the month without a marker', async () => {
      await withFixture(async ({ tx, service, groceries }) => {
        await service.upsert(groceries, '2026-11', {
          monthlyTargetCents: 30_000,
        })
        await service.remove(groceries, '2026-11')
        expect(await storedRows(tx, groceries)).toEqual([])
      })
    })

    it('answers 404 for a category that never had a budget', async () => {
      await withFixture(async ({ service, rent }) => {
        await expect(service.remove(rent, '2026-11')).rejects.toBeInstanceOf(
          NotFoundException,
        )
      })
    })
  })

  describe('history', () => {
    it('gives target and spending per month for the budgeted categories', async () => {
      await withFixture(async ({ tx, service, checking, groceries, rent }) => {
        await service.upsert(groceries, '2026-09', {
          monthlyTargetCents: 10_000,
        })
        await service.upsert(groceries, '2026-11', {
          monthlyTargetCents: 12_000,
        })
        await insert(tx, [
          transaction(checking, {
            categoryId: groceries,
            bookingDate: '2026-08-10',
            amountCents: -5_000,
          }),
          transaction(checking, {
            categoryId: groceries,
            bookingDate: '2026-09-10',
            amountCents: -11_000,
          }),
          transaction(checking, {
            categoryId: groceries,
            bookingDate: '2026-10-10',
            amountCents: -6_000,
          }),
          transaction(checking, {
            categoryId: groceries,
            bookingDate: '2026-10-11',
            kind: 'transfer',
            amountCents: -60_000,
          }),
          // Not budgeted: left out of the table and the totals.
          transaction(checking, {
            categoryId: rent,
            bookingDate: '2026-10-01',
            amountCents: -80_000,
          }),
        ])

        const history = await service.history('2026-11', 4)

        expect(history.months).toEqual([
          '2026-08',
          '2026-09',
          '2026-10',
          '2026-11',
        ])
        expect(history.categories).toHaveLength(1)
        expect(history.categories[0].months).toEqual([
          {
            month: '2026-08',
            targetCents: null,
            spentCents: 5_000,
            status: null,
          },
          {
            month: '2026-09',
            targetCents: 10_000,
            spentCents: 11_000,
            status: 'over',
          },
          {
            month: '2026-10',
            targetCents: 10_000,
            spentCents: 6_000,
            status: 'ok',
          },
          {
            month: '2026-11',
            targetCents: 12_000,
            spentCents: 0,
            status: 'ok',
          },
        ])
        expect(history.totals).toEqual([
          { month: '2026-08', targetCents: 0, spentCents: 0, status: null },
          {
            month: '2026-09',
            targetCents: 10_000,
            spentCents: 11_000,
            status: 'over',
          },
          {
            month: '2026-10',
            targetCents: 10_000,
            spentCents: 6_000,
            status: 'ok',
          },
          {
            month: '2026-11',
            targetCents: 12_000,
            spentCents: 0,
            status: 'ok',
          },
        ])
      })
    })
  })

  describe('suggest', () => {
    it('averages the full months before, one-offs and transfers excluded', async () => {
      await withFixture(
        async ({ tx, service, checking, groceries, rent, livret, salary }) => {
          await service.upsert(rent, '2026-01', { monthlyTargetCents: 70_000 })
          await insert(tx, [
            // Groceries: 300 + 310 + 325,50 over Aug–Oct → 311,83 → 312 €.
            transaction(checking, {
              categoryId: groceries,
              bookingDate: '2026-08-05',
              amountCents: -30_000,
            }),
            transaction(checking, {
              categoryId: groceries,
              bookingDate: '2026-09-05',
              amountCents: -31_000,
            }),
            transaction(checking, {
              categoryId: groceries,
              bookingDate: '2026-10-31',
              amountCents: -32_550,
            }),
            transaction(checking, {
              categoryId: groceries,
              bookingDate: '2026-10-20',
              amountCents: -90_000,
              isOneOff: true,
            }),
            // Outside the window: July and the current month.
            transaction(checking, {
              categoryId: groceries,
              bookingDate: '2026-07-31',
              amountCents: -500_000,
            }),
            transaction(checking, {
              categoryId: groceries,
              bookingDate: '2026-11-01',
              amountCents: -500_000,
            }),
            // Rent: 750 € each month.
            ...['2026-08-01', '2026-09-01', '2026-10-01'].map((bookingDate) =>
              transaction(checking, {
                categoryId: rent,
                bookingDate,
                amountCents: -75_000,
              }),
            ),
            // Never suggested: transfers and income.
            transaction(checking, {
              categoryId: livret,
              kind: 'transfer',
              bookingDate: '2026-09-02',
              amountCents: -100_000,
            }),
            transaction(checking, {
              categoryId: salary,
              kind: 'income',
              bookingDate: '2026-09-28',
              amountCents: 250_000,
            }),
          ])

          const result = await service.suggest('2026-11', 3)

          expect(result.months).toEqual(['2026-08', '2026-09', '2026-10'])
          expect(result.monthsWithData).toBe(3)
          expect(result.items).toEqual([
            expect.objectContaining({
              categoryId: rent,
              averageCents: 75_000,
              suggestedCents: 75_000,
              currentTargetCents: 70_000,
            }),
            expect.objectContaining({
              categoryId: groceries,
              averageCents: 31_183,
              suggestedCents: 31_200,
              currentTargetCents: null,
            }),
          ])
          // Nothing saved.
          expect(await storedRows(tx, groceries)).toEqual([])
        },
      )
    })

    it('does not dilute a short history with empty months', async () => {
      await withFixture(async ({ tx, service, checking, groceries }) => {
        await insert(tx, [
          transaction(checking, {
            categoryId: groceries,
            bookingDate: '2026-10-05',
            amountCents: -20_049,
          }),
        ])

        const result = await service.suggest('2026-11', 3)

        expect(result.monthsWithData).toBe(1)
        expect(result.items[0]).toMatchObject({
          averageCents: 20_049,
          suggestedCents: 20_000,
        })
        expect((await service.suggest('2026-08', 3)).items).toEqual([])
      })
    })

    it('leaves out archived categories unless they have a target', async () => {
      await withFixture(async ({ tx, service, checking, groceries }) => {
        await insert(tx, [
          transaction(checking, {
            categoryId: groceries,
            bookingDate: '2026-10-05',
            amountCents: -20_049,
          }),
        ])
        await tx
          .update(categoriesTable)
          .set({ archivedAt: new Date('2026-11-01T00:00:00Z') })
          .where(eq(categoriesTable.id, groceries))

        expect((await service.suggest('2026-11', 3)).items).toEqual([])

        await service.upsert(groceries, '2026-10', {
          monthlyTargetCents: 15_000,
        })
        expect((await service.suggest('2026-11', 3)).items).toHaveLength(1)
      })
    })
  })
})
