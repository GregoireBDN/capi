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
  recurringItemsTable,
  transactionSplitsTable,
  transactionsTable,
} from '#/database/schema'
import { BudgetsService } from './budgets.service'
import { bankRows } from '#/transactions/testing/bank-rows'

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
        await tx.delete(recurringItemsTable)
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
    await tx.insert(transactionsTable).values(await bankRows(tx, rows))
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
            // A move to the user's own savings.
            transaction(checking, {
              categoryId: livret,
              kind: 'transfer',
              amountCents: -50_000,
            }),
            transaction(savings, {
              categoryId: livret,
              kind: 'transfer',
              amountCents: 50_000,
            }),
            // Money in filed in an expense category is a refund of it
            // (#368): it nets the category's spending.
            transaction(checking, {
              categoryId: groceries,
              kind: 'income',
              amountCents: 1_000,
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

          expect(items[0].spentCents).toBe(3_000)
          expect(totals.spentCents).toBe(3_000)
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
              icon: null,
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

    it('accepts expense and income categories, never transfers (#315)', async () => {
      await withFixture(async ({ service, salary, livret }) => {
        await expect(
          service.upsert(livret, '2026-11', { monthlyTargetCents: 100 }),
        ).rejects.toBeInstanceOf(BadRequestException)
        // Income has no envelope.
        await expect(
          service.upsert(salary, '2026-11', {
            monthlyTargetCents: 100,
            tracked: true,
          }),
        ).rejects.toBeInstanceOf(BadRequestException)
        await expect(
          service.upsert(salary, '2026-11', { monthlyTargetCents: 210_000 }),
        ).resolves.toMatchObject({
          monthlyTargetCents: 210_000,
          tracked: false,
        })
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
      await withFixture(
        async ({ tx, service, checking, groceries, rent, livret }) => {
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
              categoryId: livret,
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
          // Nothing planned on the income side.
          const noIncome = {
            plannedIncomeCents: 0,
            receivedIncomeCents: 0,
            plannedSavingsCents: null,
          }
          expect(history.income).toEqual([])
          expect(
            history.totals.map((total) => ({
              ...total,
              ...noIncome,
            })),
          ).toEqual(history.totals)
          expect(
            history.totals.map(
              ({ month, targetCents, spentCents, status }) => ({
                month,
                targetCents,
                spentCents,
                status,
              }),
            ),
          ).toEqual([
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
        },
      )
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

    it('leaves a prepaid subscription payment out, names it on the budget (#314)', async () => {
      await withFixture(async ({ tx, service, checking, leisure }) => {
        await service.upsert(leisure, '2026-01', { monthlyTargetCents: 4_500 })
        const [plan] = await tx
          .insert(recurringItemsTable)
          .values({
            accountId: checking,
            merchantKey: 'HEBERGEUR EXEMPLE',
            direction: 'debit',
            name: 'Hébergeur test',
            categoryId: leisure,
            status: 'confirmed',
            isFixedCost: true,
            cadence: 'yearly',
            amountType: 'fixed',
            typicalAmountCents: 18_000,
            confidence: 1,
            lastSeenDate: '2026-09-07',
            termMonths: 24,
          })
          .returning()
        await insert(tx, [
          ...['2026-08-10', '2026-09-10', '2026-10-10'].map((bookingDate) =>
            transaction(checking, {
              categoryId: leisure,
              bookingDate,
              amountCents: -4_000,
            }),
          ),
          transaction(checking, {
            categoryId: leisure,
            bookingDate: '2026-09-07',
            amountCents: -18_000,
            prepaidItemId: plan.id,
          }),
        ])
        // The average spreads nothing: 40 € a month, not 100 €.
        const suggestion = await service.suggest('2026-11', 3)
        expect(suggestion.items).toEqual([
          expect.objectContaining({ categoryId: leisure, averageCents: 4_000 }),
        ])
        // The month it was paid counts it, and says why it is over.
        const september = await service.month('2026-09')
        expect(september.items[0]).toMatchObject({
          spentCents: 22_000,
          spentExcludingOneOffsCents: 4_000,
          status: 'over',
          prepaid: [
            {
              recurringItemId: plan.id,
              name: 'Hébergeur test',
              amountCents: 18_000,
              termMonths: 24,
            },
          ],
        })
        expect((await service.month('2026-10')).items[0].prepaid).toEqual([])
      })
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

  describe('envelopes', () => {
    /** Noon in Paris on Oct 13, 2026 (31 days). */
    const NOW = new Date('2026-10-13T10:00:00Z')

    it('carries the tracked flag over like the note', async () => {
      await withFixture(async ({ service, groceries }) => {
        const first = await service.upsert(groceries, '2026-09', {
          monthlyTargetCents: 30_000,
          tracked: true,
        })
        expect(first.tracked).toBe(true)
        const raised = await service.upsert(groceries, '2026-10', {
          monthlyTargetCents: 31_000,
        })
        expect(raised.tracked).toBe(true)
        const untracked = await service.upsert(groceries, '2026-11', {
          monthlyTargetCents: 31_000,
          tracked: false,
        })
        expect(untracked.tracked).toBe(false)
        const month = await service.month('2026-10')
        expect(month.items[0]).toMatchObject({ tracked: true })
      })
    })

    it('follows the tracked lines of the current Paris month', async () => {
      await withFixture(
        async ({ tx, service, checking, groceries, leisure, rent, livret }) => {
          await service.upsert(groceries, '2026-10', {
            monthlyTargetCents: 31_000,
            tracked: true,
          })
          await service.upsert(leisure, '2026-09', {
            monthlyTargetCents: 6_200,
            tracked: true,
          })
          await service.upsert(rent, '2026-10', {
            monthlyTargetCents: 80_000,
          })
          await insert(tx, [
            // Imported groceries, a refund, one noted by hand.
            transaction(checking, {
              categoryId: groceries,
              amountCents: -12_000,
              bookingDate: '2026-10-02',
            }),
            transaction(checking, {
              categoryId: groceries,
              amountCents: 1_000,
              bookingDate: '2026-10-05',
            }),
            transaction(checking, {
              categoryId: groceries,
              amountCents: -2_500,
              bookingDate: '2026-10-12',
              manual: true,
            }),
            // Last month, and transfers: never counted.
            transaction(checking, {
              categoryId: groceries,
              amountCents: -9_999,
              bookingDate: '2026-09-30',
            }),
            transaction(checking, {
              amountCents: -7_777,
              kind: 'transfer',
            }),
            transaction(checking, {
              categoryId: livret,
              amountCents: -50_000,
              kind: 'transfer',
            }),
            transaction(checking, {
              categoryId: leisure,
              amountCents: -1_000,
              bookingDate: '2026-10-10',
              manual: true,
            }),
          ])

          const result = await service.envelopes(undefined, tx, NOW)
          expect(result).toMatchObject({
            month: '2026-10',
            current: true,
            today: '2026-10-13',
            dayOfMonth: 13,
            daysInMonth: 31,
          })
          // Name order; the untracked rent line is left out.
          expect(result.items).toEqual([
            expect.objectContaining({
              categoryId: groceries,
              targetCents: 31_000,
              spentCents: 13_500,
              manualCents: 2_500,
              remainingCents: 17_500,
              // 310 € × 13 / 31
              paceCents: 13_000,
              aheadOfPace: true,
              status: 'ok',
            }),
            expect.objectContaining({
              categoryId: leisure,
              targetCents: 6_200,
              spentCents: 1_000,
              manualCents: 1_000,
              remainingCents: 5_200,
              paceCents: 2_600,
              aheadOfPace: false,
            }),
          ])
        },
      )
    })

    it('uses Paris for the day: just after midnight is already the next month', async () => {
      await withFixture(async ({ tx, service, groceries }) => {
        await service.upsert(groceries, '2026-11', {
          monthlyTargetCents: 30_000,
          tracked: true,
        })
        const result = await service.envelopes(
          undefined,
          tx,
          new Date('2026-10-31T23:30:00Z'),
        )
        expect(result).toMatchObject({
          month: '2026-11',
          today: '2026-11-01',
          dayOfMonth: 1,
          daysInMonth: 30,
        })
        expect(result.items[0]).toMatchObject({
          spentCents: 0,
          paceCents: 1_000,
          aheadOfPace: false,
        })
      })
    })

    it('shows a past month as over: the whole target as pace, nothing ahead', async () => {
      await withFixture(async ({ tx, service, checking, groceries }) => {
        await service.upsert(groceries, '2026-09', {
          monthlyTargetCents: 30_000,
          tracked: true,
        })
        await insert(tx, [
          transaction(checking, {
            categoryId: groceries,
            amountCents: -12_000,
            bookingDate: '2026-09-03',
          }),
          transaction(checking, {
            categoryId: groceries,
            amountCents: -4_000,
            bookingDate: '2026-09-30',
            manual: true,
          }),
          // The current month: not counted in September.
          transaction(checking, {
            categoryId: groceries,
            amountCents: -9_999,
            bookingDate: '2026-10-01',
          }),
        ])
        const result = await service.envelopes('2026-09', tx, NOW)
        expect(result).toMatchObject({
          month: '2026-09',
          current: false,
          today: '2026-10-13',
          dayOfMonth: 30,
          daysInMonth: 30,
        })
        expect(result.items).toEqual([
          expect.objectContaining({
            categoryId: groceries,
            targetCents: 30_000,
            spentCents: 16_000,
            manualCents: 4_000,
            remainingCents: 14_000,
            paceCents: 30_000,
            aheadOfPace: false,
          }),
        ])
      })
    })

    it('marks the current month as such when asked for by name', async () => {
      await withFixture(async ({ tx, service, groceries }) => {
        await service.upsert(groceries, '2026-10', {
          monthlyTargetCents: 31_000,
          tracked: true,
        })
        const result = await service.envelopes('2026-10', tx, NOW)
        expect(result).toMatchObject({
          month: '2026-10',
          current: true,
          dayOfMonth: 13,
        })
        expect(result.items[0]).toMatchObject({ paceCents: 13_000 })
      })
    })

    it('has nothing for a month without tracked lines nor spending', async () => {
      await withFixture(async ({ tx, service, groceries }) => {
        // Tracked from October on: nothing to follow in August.
        await service.upsert(groceries, '2026-10', {
          monthlyTargetCents: 31_000,
          tracked: true,
        })
        const result = await service.envelopes('2026-08', tx, NOW)
        expect(result).toMatchObject({
          month: '2026-08',
          current: false,
          dayOfMonth: 31,
          daysInMonth: 31,
          items: [],
        })
      })
    })

    it('has not started a future month', async () => {
      await withFixture(async ({ tx, service, groceries }) => {
        await service.upsert(groceries, '2026-10', {
          monthlyTargetCents: 31_000,
          tracked: true,
        })
        const result = await service.envelopes('2026-11', tx, NOW)
        expect(result).toMatchObject({ current: false, dayOfMonth: 0 })
        expect(result.items[0]).toMatchObject({
          paceCents: 0,
          aheadOfPace: false,
        })
      })
    })

    it('is empty when no line is tracked', async () => {
      await withFixture(async ({ tx, service, groceries }) => {
        await service.upsert(groceries, '2026-10', { monthlyTargetCents: 100 })
        expect((await service.envelopes(undefined, tx, NOW)).items).toEqual([])
      })
    })
  })

  describe('planned income (#315)', () => {
    async function otherIncome(tx: Tx) {
      const [row] = await tx
        .insert(categoriesTable)
        .values({ slug: 'test_family', name: 'Test famille', kind: 'income' })
        .returning()
      return row.id
    }

    function credit(
      accountId: string,
      categoryId: string,
      overrides: Partial<typeof recurringItemsTable.$inferInsert> = {},
    ): typeof recurringItemsTable.$inferInsert {
      return {
        accountId,
        merchantKey: `TEST CREDIT ${categoryId}`,
        direction: 'credit',
        name: 'Test employeur',
        categoryId,
        status: 'confirmed',
        isFixedCost: false,
        cadence: 'monthly',
        amountType: 'fixed',
        typicalAmountCents: 210_000,
        confidence: 0.9,
        lastSeenDate: '2026-10-27',
        nextExpectedDate: '2026-11-27',
        ...overrides,
      }
    }

    it('carries a planned income over with its note, apart from the expenses', async () => {
      await withFixture(async ({ service, salary, groceries }) => {
        await service.upsert(salary, '2026-09', {
          monthlyTargetCents: 210_000,
          note: 'estimation, à corriger avec la fiche de paie',
        })
        await service.upsert(groceries, '2026-09', {
          monthlyTargetCents: 40_000,
        })

        const november = await service.month(
          '2026-11',
          undefined,
          new Date('2026-12-15T10:00:00Z'),
        )
        expect(november.items.map((item) => item.categoryId)).toEqual([
          groceries,
        ])
        expect(november.income.items).toEqual([
          expect.objectContaining({
            categoryId: salary,
            plannedCents: 210_000,
            effectiveFrom: '2026-09',
            note: 'estimation, à corriger avec la fiche de paie',
          }),
        ])
        expect(november.plan).toEqual({
          plannedIncomeCents: 210_000,
          budgetedExpensesCents: 40_000,
          toSaveCents: 170_000,
        })
        // A month with only an income line still counts as budgeted.
        expect(await service.hasBudget('2026-12')).toBe(true)
        // The envelopes and the history's expense side stay expenses only.
        const history = await service.history('2026-11', 2)
        expect(history.categories.map((c) => c.categoryId)).toEqual([groceries])
        expect(history.income).toEqual([
          expect.objectContaining({
            categoryId: salary,
            months: [
              { month: '2026-10', plannedCents: 210_000, receivedCents: 0 },
              { month: '2026-11', plannedCents: 210_000, receivedCents: 0 },
            ],
          }),
        ])
        expect(history.totals[1]).toMatchObject({
          targetCents: 40_000,
          plannedIncomeCents: 210_000,
          plannedSavingsCents: 170_000,
        })
      })
    })

    it('reads what came in from income lines only: splits count, transfers and refunds never', async () => {
      await withFixture(
        async ({
          tx,
          service,
          checking,
          savings,
          salary,
          livret,
          groceries,
        }) => {
          const family = await otherIncome(tx)
          await service.upsert(salary, '2026-10', {
            monthlyTargetCents: 210_000,
          })
          await service.upsert(family, '2026-10', {
            monthlyTargetCents: 25_000,
          })
          const [split] = await tx
            .insert(transactionsTable)
            .values(
              await bankRows(
                tx,
                transaction(checking, {
                  bookingDate: '2026-10-27',
                  amountCents: 230_000,
                  kind: 'income',
                  categoryId: salary,
                }),
              ),
            )
            .returning()
          await tx.insert(transactionSplitsTable).values([
            {
              transactionId: split.id,
              categoryId: salary,
              amountCents: 205_000,
              position: 0,
            },
            {
              transactionId: split.id,
              categoryId: family,
              amountCents: 25_000,
              position: 1,
            },
          ])
          await insert(tx, [
            // A move from the owner's savings: never income.
            transaction(checking, {
              bookingDate: '2026-10-10',
              amountCents: 50_000,
              kind: 'transfer',
              categoryId: livret,
            }),
            transaction(savings, {
              bookingDate: '2026-10-10',
              amountCents: -50_000,
              kind: 'transfer',
              categoryId: livret,
            }),
            // A refund filed in an expense category stays there.
            transaction(checking, {
              bookingDate: '2026-10-12',
              amountCents: 3_000,
              categoryId: groceries,
            }),
            // Income outside the plan.
            transaction(checking, {
              bookingDate: '2026-10-31',
              amountCents: 1_500,
              kind: 'income',
            }),
          ])

          const october = await service.month(
            '2026-10',
            undefined,
            new Date('2026-11-15T10:00:00Z'),
          )
          expect(october.period.status).toBe('complete')
          expect(
            october.income.items.map((item) => [
              item.categoryId,
              item.receivedCents,
              item.status,
            ]),
          ).toEqual([
            [salary, 205_000, 'short'],
            [family, 25_000, 'received'],
          ])
          expect(october.income.totals).toEqual({
            plannedCents: 235_000,
            receivedCents: 230_000,
            unplannedCents: 1_500,
            lineCount: 2,
          })
        },
      )
    })

    it('compares a partial month like for like where the day is known', async () => {
      await withFixture(
        async ({ tx, service, checking, salary, groceries }) => {
          const family = await otherIncome(tx)
          const [benefits] = await tx
            .insert(categoriesTable)
            .values({
              slug: 'test_benefits',
              name: 'Test aides',
              kind: 'income',
            })
            .returning()
          for (const [categoryId, cents] of [
            [salary, 210_000],
            [family, 25_000],
            [benefits.id, 35_000],
          ] as const) {
            await service.upsert(categoryId, '2026-11', {
              monthlyTargetCents: cents,
            })
          }
          await tx.insert(recurringItemsTable).values([
            // Salary on the 27th: not due yet on the 9th.
            credit(checking, salary),
            // Benefits on the 5th: due, nothing came in.
            credit(checking, benefits.id, {
              name: 'Test CAF',
              typicalAmountCents: 35_000,
              lastSeenDate: '2026-10-05',
              nextExpectedDate: '2026-11-05',
            }),
          ])
          await insert(tx, [
            transaction(checking, {
              bookingDate: '2026-11-03',
              amountCents: 10_000,
              kind: 'income',
              categoryId: family,
            }),
            transaction(checking, {
              bookingDate: '2026-11-09',
              amountCents: -2_000,
              categoryId: groceries,
            }),
          ])
          const now = new Date('2026-11-19T10:00:00Z')

          const november = await service.month('2026-11', undefined, now)
          expect(november.period).toMatchObject({
            status: 'partial',
            dataUntil: '2026-11-09',
          })
          const line = (id: string) =>
            november.income.items.find((item) => item.categoryId === id)
          expect(line(salary)).toMatchObject({
            receivedCents: 0,
            expectedByNowCents: 0,
            expectedOn: '2026-11-27',
            status: 'pending',
          })
          expect(line(benefits.id)).toMatchObject({
            receivedCents: 0,
            expectedByNowCents: 35_000,
            expectedOn: null,
            status: 'missing',
          })
          // No known date: « reçu à ce jour ».
          expect(line(family)).toMatchObject({
            receivedCents: 10_000,
            expectedByNowCents: null,
            status: 'so_far',
          })

          // An empty month shows the plan without « reçu ».
          const december = await service.month('2026-12', undefined, now)
          expect(december.period.status).toBe('empty')
          expect(december.income.totals.receivedCents).toBeNull()
          expect(
            december.income.items.find((item) => item.categoryId === salary),
          ).toMatchObject({
            receivedCents: null,
            expectedOn: '2026-12-27',
            status: 'pending',
          })
        },
      )
    })

    it('prepares the income from the plan in effect, else the confirmed recurring credits', async () => {
      await withFixture(async ({ tx, service, checking, salary }) => {
        const family = await otherIncome(tx)
        await tx.insert(recurringItemsTable).values([
          credit(checking, salary, { typicalAmountCents: 209_960 }),
          // Quarterly: its monthly equivalent.
          credit(checking, family, {
            merchantKey: 'TEST QUARTERLY',
            name: 'Test famille trimestre',
            cadence: 'quarterly',
            typicalAmountCents: 30_000,
            lastSeenDate: '2026-10-02',
            nextExpectedDate: '2027-01-02',
          }),
          // Suggested and stale series are left out.
          credit(checking, family, {
            merchantKey: 'TEST SUGGESTED',
            status: 'suggested',
          }),
          credit(checking, family, {
            merchantKey: 'TEST STALE',
            lastSeenDate: '2026-05-27',
            nextExpectedDate: '2026-06-27',
          }),
        ])

        const fresh = await service.suggestIncome('2026-12')
        expect(fresh.items).toEqual([
          expect.objectContaining({
            categoryId: salary,
            suggestedCents: 210_000,
            currentPlannedCents: null,
            sources: ['Test employeur'],
          }),
          expect.objectContaining({
            categoryId: family,
            suggestedCents: 10_000,
            sources: ['Test famille trimestre'],
          }),
        ])

        // The plan of the month before wins over the credits.
        await service.upsert(salary, '2026-11', { monthlyTargetCents: 200_000 })
        const carried = await service.suggestIncome('2026-12')
        expect(carried.items[0]).toMatchObject({
          categoryId: salary,
          suggestedCents: 200_000,
          currentPlannedCents: 200_000,
          sources: [],
        })
      })
    })
  })
})
