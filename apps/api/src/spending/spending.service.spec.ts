import '#/load-env'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '#/database/schema'
import {
  accountsTable,
  budgetsTable,
  categoriesTable,
  categorizationRulesTable,
  type InsertRecurringItem,
  type InsertTransaction,
  recurringItemsTable,
  transactionsTable,
} from '#/database/schema'
import { normalizeLabel } from '#/imports/normalize/label'
import { RecurringService } from '#/recurring/recurring.service'
import type { CategorySpendingDto } from './dto/spending.dto'
import { SpendingService } from './spending.service'
import { bankRows } from '#/transactions/testing/bank-rows'

/**
 * Integration checks against the migrated test database (see
 * `vitest.test-database.ts`). Each test starts from an empty transaction table
 * inside a transaction that is rolled back. Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000'

/** 15 November 2026, noon in Paris. */
const NOW = new Date('2026-11-15T11:00:00Z')

const RENT = 'PRLV SEPA SOCIETE IMMO EXEMPLE'
const STREAMING = 'PRLV SEPA STREAMFLIX EXEMPLE'
const GYM = 'PRLV SEPA SALLE DE SPORT EXEMPLE'

const CATEGORY_SLUGS = [
  'groceries',
  'rent',
  'transport',
  'leisure',
  'health',
  'gifts',
  'travel',
] as const
type Slug = (typeof CATEGORY_SLUGS)[number]

describe.skipIf(!process.env.DATABASE_URL)('SpendingService (database)', () => {
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
    service: SpendingService
    checking: string
    savings: string
    category: Record<Slug, string>
    salary: string
    livret: string
  }

  async function withFixture(fn: (f: Fixture) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        await tx.delete(recurringItemsTable)
        await tx.delete(budgetsTable)
        await tx.delete(transactionsTable)
        await tx.delete(categorizationRulesTable)
        const [checking, savings] = await tx
          .insert(accountsTable)
          .values([
            { name: 'Test checking', type: 'checking' },
            { name: 'Test savings', type: 'savings' },
          ])
          .returning()
        const rows = await tx
          .insert(categoriesTable)
          .values([
            ...CATEGORY_SLUGS.map((slug, index) => ({
              slug: `test_${slug}`,
              name: `Test ${slug}`,
              kind: 'expense' as const,
              color: `#00000${index}`,
              icon: slug === 'groceries' ? ('shopping-cart' as const) : null,
            })),
            { slug: 'test_salary', name: 'Test salary', kind: 'income' },
            { slug: 'test_livret', name: 'Test livret', kind: 'transfer' },
          ])
          .returning()
        const bySlug = new Map(rows.map((c) => [c.slug, c.id]))
        const database = { db: tx } as never
        const service = new SpendingService(
          database,
          new RecurringService(database),
        )
        service.now = () => NOW
        await fn({
          tx,
          service,
          checking: checking.id,
          savings: savings.id,
          category: Object.fromEntries(
            CATEGORY_SLUGS.map((slug) => [slug, bySlug.get(`test_${slug}`)!]),
          ) as Record<Slug, string>,
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
  function row(
    accountId: string,
    bookingDate: string,
    amountCents: number,
    overrides: Partial<InsertTransaction> = {},
  ): InsertTransaction {
    hash++
    return {
      accountId,
      bookingDate,
      amountCents,
      rawLabel: `PAIEMENT CB FAKESHOP ${hash}`,
      kind: 'expense',
      dedupeHash: `spending-test-${hash}`,
      ...overrides,
    }
  }

  async function insert(tx: Tx, rows: InsertTransaction[]) {
    await tx.insert(transactionsTable).values(await bankRows(tx, rows))
  }

  /** A recurring series of `rawLabel` debits, confirmed unless overridden. */
  async function recurring(
    tx: Tx,
    accountId: string,
    rawLabel: string,
    amountCents: number,
    item: Partial<InsertRecurringItem> = {},
  ) {
    const { merchantKey } = normalizeLabel(rawLabel, amountCents)
    await tx.insert(recurringItemsTable).values({
      accountId,
      merchantKey: merchantKey!,
      direction: 'debit',
      name: rawLabel,
      status: 'confirmed',
      isFixedCost: true,
      cadence: 'monthly',
      amountType: 'fixed',
      typicalAmountCents: Math.abs(amountCents),
      confidence: 0.9,
      lastSeenDate: '2026-10-01',
      ...item,
    })
  }

  function find(
    categories: CategorySpendingDto[],
    categoryId: string | null,
  ): CategorySpendingDto | undefined {
    return categories.find((item) => item.categoryId === categoryId)
  }

  describe('byCategory', () => {
    it('sums expenses per category, leaving transfers and income out', async () => {
      await withFixture(async (f) => {
        const { groceries, rent } = f.category
        await insert(f.tx, [
          row(f.checking, '2026-10-03', -4_000, { categoryId: groceries }),
          row(f.checking, '2026-10-20', -2_500, { categoryId: groceries }),
          row(f.checking, '2026-10-01', -80_000, { categoryId: rent }),
          // Transfer to savings, filed or not: never spending.
          row(f.checking, '2026-10-05', -50_000, {
            kind: 'transfer',
            categoryId: f.livret,
          }),
          row(f.checking, '2026-10-06', -10_000, { kind: 'transfer' }),
          row(f.savings, '2026-10-05', 50_000, {
            kind: 'transfer',
            categoryId: f.livret,
          }),
          row(f.checking, '2026-10-28', 250_000, {
            kind: 'income',
            categoryId: f.salary,
          }),
        ])

        const result = await f.service.byCategory({ month: '2026-10' })

        expect(result.month).toBe('2026-10')
        expect(result.previousMonth).toBe('2026-09')
        expect(result.totalCents).toBe(86_500)
        expect(result.transactionCount).toBe(3)
        expect(result.categories.map((c) => c.categoryId)).toEqual([
          rent,
          groceries,
        ])
        expect(find(result.categories, groceries)).toMatchObject({
          slug: 'test_groceries',
          name: 'Test groceries',
          color: '#000000',
          icon: 'shopping-cart',
          spentCents: 6_500,
          transactionCount: 2,
        })
        expect(find(result.categories, rent)!.share).toBeCloseTo(
          80_000 / 86_500,
        )
      })
    })

    it('nets refunds against their category', async () => {
      await withFixture(async (f) => {
        const { health, gifts } = f.category
        await insert(f.tx, [
          row(f.checking, '2026-10-02', -6_000, { categoryId: health }),
          // Reimbursement filed under the same category.
          row(f.checking, '2026-10-12', 4_200, { categoryId: health }),
          // A refund bigger than the month's spending in its category.
          row(f.checking, '2026-10-15', 3_000, { categoryId: gifts }),
        ])

        const result = await f.service.byCategory({ month: '2026-10' })

        expect(find(result.categories, health)).toMatchObject({
          spentCents: 1_800,
          transactionCount: 2,
        })
        expect(find(result.categories, gifts)!.spentCents).toBe(-3_000)
        expect(result.totalCents).toBe(-1_200)
        // No meaningful share of a negative total.
        expect(find(result.categories, health)!.share).toBe(0)
      })
    })

    it('puts expenses without a category in their own bucket', async () => {
      await withFixture(async (f) => {
        await insert(f.tx, [
          row(f.checking, '2026-10-02', -1_500),
          row(f.checking, '2026-10-03', -500),
          row(f.checking, '2026-10-04', -9_000, {
            categoryId: f.category.groceries,
          }),
          // Uncategorized income and transfers stay out.
          row(f.checking, '2026-10-05', 2_000, { kind: 'income' }),
          row(f.checking, '2026-10-06', -7_000, { kind: 'transfer' }),
        ])

        const result = await f.service.byCategory({ month: '2026-10' })

        expect(find(result.categories, null)).toEqual({
          categoryId: null,
          slug: null,
          name: null,
          color: null,
          icon: null,
          spentCents: 2_000,
          share: 2_000 / 11_000,
          transactionCount: 2,
          previousSpentCents: 0,
          deltaCents: 2_000,
          averageCents: null,
          notYetThisMonth: false,
          targetCents: null,
          expectedCents: 0,
          accountId: null,
          accountType: null,
          inCents: null,
          outCents: null,
        })
        expect(result.totalCents).toBe(11_000)
      })
    })

    it('leaves one-offs out unless asked for, and reports them', async () => {
      await withFixture(async (f) => {
        const { travel, groceries } = f.category
        await insert(f.tx, [
          row(f.checking, '2026-09-10', -100_000, {
            categoryId: travel,
            isOneOff: true,
          }),
          row(f.checking, '2026-10-10', -60_000, {
            categoryId: travel,
            isOneOff: true,
          }),
          row(f.checking, '2026-10-11', -5_000, { categoryId: travel }),
          row(f.checking, '2026-10-12', -3_000, { categoryId: groceries }),
          // A one-off transfer is still no spending.
          row(f.checking, '2026-10-13', -70_000, {
            kind: 'transfer',
            isOneOff: true,
          }),
        ])

        const excluded = await f.service.byCategory({ month: '2026-10' })
        expect(excluded.includeOneOffs).toBe(false)
        expect(excluded.totalCents).toBe(8_000)
        expect(excluded.oneOffCents).toBe(60_000)
        expect(excluded.previousTotalCents).toBe(0)
        expect(find(excluded.categories, travel)).toMatchObject({
          spentCents: 5_000,
          transactionCount: 1,
          previousSpentCents: 0,
          // September only had a one-off: 0 over one month of history.
          averageCents: 0,
        })

        const included = await f.service.byCategory({
          month: '2026-10',
          includeOneOffs: true,
        })
        expect(included.includeOneOffs).toBe(true)
        expect(included.totalCents).toBe(68_000)
        expect(included.oneOffCents).toBe(60_000)
        expect(included.previousTotalCents).toBe(100_000)
        expect(find(included.categories, travel)).toMatchObject({
          spentCents: 65_000,
          transactionCount: 2,
          previousSpentCents: 100_000,
          deltaCents: -35_000,
          averageCents: 100_000,
        })
      })
    })

    it('cuts months on calendar dates, the default month being the Paris one', async () => {
      await withFixture(async (f) => {
        const { groceries } = f.category
        await insert(f.tx, [
          row(f.checking, '2026-02-28', -1_000, { categoryId: groceries }),
          row(f.checking, '2026-03-01', -2_000, { categoryId: groceries }),
          row(f.checking, '2026-03-31', -3_000, { categoryId: groceries }),
          row(f.checking, '2026-04-01', -4_000, { categoryId: groceries }),
        ])

        const march = await f.service.byCategory({ month: '2026-03' })
        expect(march.totalCents).toBe(5_000)
        expect(march.previousTotalCents).toBe(1_000)

        // 31 March 22:30 UTC is already 1 April in Paris (UTC+2).
        f.service.now = () => new Date('2026-03-31T22:30:00Z')
        const april = await f.service.byCategory({})
        expect(april.month).toBe('2026-04')
        expect(april.totalCents).toBe(4_000)

        // 31 December 23:30 UTC is 1 January in Paris (UTC+1).
        await insert(f.tx, [
          row(f.checking, '2027-01-01', -500, { categoryId: groceries }),
        ])
        f.service.now = () => new Date('2026-12-31T23:30:00Z')
        expect((await f.service.byCategory({})).month).toBe('2027-01')
      })
    })

    it('averages the previous full months, months without spending counting as 0', async () => {
      await withFixture(async (f) => {
        const { groceries, leisure } = f.category
        await insert(f.tx, [
          // History starts long before the window.
          row(f.checking, '2025-01-10', -99_900, { categoryId: groceries }),
          // Window for October 2026: April to September 2026.
          row(f.checking, '2026-04-10', -12_000, { categoryId: groceries }),
          row(f.checking, '2026-06-10', -6_000, { categoryId: groceries }),
          row(f.checking, '2026-09-30', -6_001, { categoryId: groceries }),
          row(f.checking, '2026-08-10', -3_000, { categoryId: leisure }),
          // Out of the window on both sides.
          row(f.checking, '2026-03-31', -50_000, { categoryId: groceries }),
          row(f.checking, '2026-10-02', -10_000, { categoryId: groceries }),
          // October is imported to its end (a transfer is never spending).
          row(f.checking, '2026-10-31', -100, { kind: 'transfer' }),
        ])

        const result = await f.service.byCategory({ month: '2026-10' })

        expect(result.averageMonths).toBe(6)
        expect(result.averageFrom).toBe('2026-04')
        // (12 000 + 6 000 + 6 001) / 6, rounded to the cent.
        expect(find(result.categories, groceries)).toMatchObject({
          spentCents: 10_000,
          previousSpentCents: 6_001,
          deltaCents: 3_999,
          averageCents: 4_000,
        })
        // Leisure only spent in August: not listed (neither this month nor
        // the previous one), but part of the average total.
        expect(find(result.categories, leisure)).toBeUndefined()
        expect(result.averageTotalCents).toBe(Math.round(27_001 / 6))

        const three = await f.service.byCategory({
          month: '2026-10',
          averageMonths: 3,
        })
        expect(three.averageMonths).toBe(3)
        expect(three.averageFrom).toBe('2026-07')
        expect(find(three.categories, groceries)!.averageCents).toBe(2_000)
      })
    })

    it('starts the averages at the first transaction', async () => {
      await withFixture(async (f) => {
        const { groceries } = f.category
        await insert(f.tx, [
          // The history begins in August, with an income only.
          row(f.checking, '2026-08-20', 100_000, { kind: 'income' }),
          row(f.checking, '2026-09-05', -9_000, { categoryId: groceries }),
          row(f.checking, '2026-10-05', -1_000, { categoryId: groceries }),
        ])

        const result = await f.service.byCategory({ month: '2026-10' })
        expect(result.averageMonths).toBe(2)
        expect(result.averageFrom).toBe('2026-08')
        expect(find(result.categories, groceries)!.averageCents).toBe(4_500)
        expect(result.averageTotalCents).toBe(4_500)

        // Nothing before the selected month: no average at all.
        const august = await f.service.byCategory({ month: '2026-08' })
        expect(august.averageMonths).toBe(0)
        expect(august.averageFrom).toBeNull()
        expect(august.averageTotalCents).toBeNull()
      })
    })

    it('lists categories of the previous month with nothing spent this month', async () => {
      await withFixture(async (f) => {
        const { groceries, rent } = f.category
        await insert(f.tx, [
          row(f.checking, '2026-09-01', -80_000, { categoryId: rent }),
          row(f.checking, '2026-10-04', -2_000, { categoryId: groceries }),
        ])

        const result = await f.service.byCategory({ month: '2026-10' })

        expect(result.categories.map((c) => c.categoryId)).toEqual([
          groceries,
          rent,
        ])
        expect(find(result.categories, rent)).toMatchObject({
          spentCents: 0,
          share: 0,
          transactionCount: 0,
          previousSpentCents: 80_000,
          deltaCents: -80_000,
        })
        expect(result.previousTotalCents).toBe(80_000)
      })
    })

    it('carries the budget target in effect for the month', async () => {
      await withFixture(async (f) => {
        const { groceries, health, leisure } = f.category
        await insert(f.tx, [
          row(f.checking, '2026-10-03', -4_000, { categoryId: groceries }),
          row(f.checking, '2026-10-04', -2_000, { categoryId: health }),
          row(f.checking, '2026-10-05', -1_000, { categoryId: leisure }),
          row(f.checking, '2026-10-06', -500),
        ])
        await f.tx.insert(budgetsTable).values([
          {
            categoryId: groceries,
            effectiveFrom: '2026-01-01',
            monthlyTargetCents: 30_000,
          },
          // Raised later: October keeps its own target.
          {
            categoryId: groceries,
            effectiveFrom: '2026-11-01',
            monthlyTargetCents: 40_000,
          },
          // Ended before October.
          {
            categoryId: health,
            effectiveFrom: '2026-01-01',
            monthlyTargetCents: 5_000,
          },
          {
            categoryId: health,
            effectiveFrom: '2026-10-01',
            monthlyTargetCents: null,
          },
        ])

        const result = await f.service.byCategory({ month: '2026-10' })

        expect(find(result.categories, groceries)!.targetCents).toBe(30_000)
        expect(find(result.categories, health)!.targetCents).toBeNull()
        expect(find(result.categories, leisure)!.targetCents).toBeNull()
        expect(find(result.categories, null)!.targetCents).toBeNull()
      })
    })

    it('filters by account', async () => {
      await withFixture(async (f) => {
        const { groceries } = f.category
        await insert(f.tx, [
          row(f.checking, '2026-10-04', -2_000, { categoryId: groceries }),
          row(f.savings, '2026-10-05', -300, { categoryId: groceries }),
        ])

        const all = await f.service.byCategory({ month: '2026-10' })
        expect(all.totalCents).toBe(2_300)
        const savings = await f.service.byCategory({
          month: '2026-10',
          accountId: f.savings,
        })
        expect(savings.totalCents).toBe(300)
        expect(savings.transactionCount).toBe(1)
      })
    })

    it('returns empty figures without transactions', async () => {
      await withFixture(async (f) => {
        const result = await f.service.byCategory({})
        expect(result).toEqual({
          kind: 'expense',
          month: '2026-11',
          previousMonth: '2026-10',
          period: {
            month: '2026-11',
            dataUntil: null,
            status: 'empty',
            throughDay: null,
            previousMonth: '2026-10',
            previousUntil: null,
            defaultMonth: '2026-11',
          },
          includeOneOffs: false,
          averageMonths: 0,
          averageFrom: null,
          totalCents: 0,
          transactionCount: 0,
          previousTotalCents: 0,
          averageTotalCents: null,
          oneOffCents: 0,
          expectedCents: 0,
          categories: [],
        })
      })
    })
    describe('while the month is in progress', () => {
      it('compares the same first days of the previous and averaged months', async () => {
        await withFixture(async (f) => {
          const { groceries, rent } = f.category
          await insert(f.tx, [
            // August and September, whole months.
            row(f.checking, '2026-08-02', -1_000, { categoryId: groceries }),
            row(f.checking, '2026-08-20', -9_000, { categoryId: groceries }),
            row(f.checking, '2026-09-03', -3_000, { categoryId: groceries }),
            row(f.checking, '2026-09-25', -7_000, { categoryId: groceries }),
            // October: rent on the 2nd, groceries on the 3rd and later.
            row(f.checking, '2026-10-02', -80_000, { categoryId: rent }),
            row(f.checking, '2026-10-03', -2_000, { categoryId: groceries }),
            row(f.checking, '2026-10-21', -8_000, { categoryId: groceries }),
            // November imported up to the 3rd: groceries only so far.
            row(f.checking, '2026-11-03', -2_500, { categoryId: groceries }),
          ])
          f.service.now = () => new Date('2026-11-05T10:00:00Z')

          const result = await f.service.byCategory({ averageMonths: 3 })

          expect(result.month).toBe('2026-11')
          expect(result.period).toMatchObject({
            dataUntil: '2026-11-03',
            status: 'partial',
            throughDay: 3,
            previousUntil: '2026-10-03',
          })
          // 1–3 Oct: rent 80 000 + groceries 2 000.
          expect(result.previousTotalCents).toBe(82_000)
          expect(find(result.categories, groceries)).toMatchObject({
            spentCents: 2_500,
            previousSpentCents: 2_000,
            // 1–3 Aug, Sep and Oct: (1 000 + 3 000 + 2 000) / 3.
            averageCents: 2_000,
            notYetThisMonth: false,
          })
          // Rent not paid yet: flagged, never a saving.
          expect(find(result.categories, rent)).toMatchObject({
            spentCents: 0,
            previousSpentCents: 80_000,
            notYetThisMonth: true,
          })
        })
      })

      it('defaults to the month the data stops in when the current one has none', async () => {
        await withFixture(async (f) => {
          const { groceries } = f.category
          await insert(f.tx, [
            row(f.checking, '2026-09-10', -4_000, { categoryId: groceries }),
            row(f.checking, '2026-10-28', -6_000, { categoryId: groceries }),
          ])
          f.service.now = () => new Date('2026-11-02T10:00:00Z')

          const shown = await f.service.byCategory({})
          expect(shown.month).toBe('2026-10')
          expect(shown.period).toMatchObject({
            status: 'partial',
            throughDay: 28,
            defaultMonth: '2026-10',
          })
          expect(shown.totalCents).toBe(6_000)
          expect(shown.previousTotalCents).toBe(4_000)

          // The current month can still be asked for: nothing to compare.
          const november = await f.service.byCategory({ month: '2026-11' })
          expect(november.period).toMatchObject({
            status: 'empty',
            dataUntil: '2026-10-28',
            previousUntil: null,
            defaultMonth: '2026-10',
          })
          expect(november.totalCents).toBe(0)
          expect(november.categories).toHaveLength(0)
        })
      })

      it('returns the recurring costs still expected, apart from the spending', async () => {
        await withFixture(async (f) => {
          const { groceries, rent, leisure } = f.category
          await insert(f.tx, [
            // Rent on the 5th, a streaming subscription on the 2nd.
            ...['2026-08-05', '2026-09-05', '2026-10-05'].map((date) =>
              row(f.checking, date, -80_000, {
                rawLabel: RENT,
                categoryId: rent,
              }),
            ),
            ...['2026-09-02', '2026-10-02', '2026-11-02'].map((date) =>
              row(f.checking, date, -1_399, {
                rawLabel: STREAMING,
                categoryId: leisure,
              }),
            ),
            // A gym series the user has not confirmed.
            ...['2026-09-04', '2026-10-04'].map((date) =>
              row(f.checking, date, -3_000, {
                rawLabel: GYM,
                categoryId: leisure,
              }),
            ),
            // November imported up to the 3rd.
            row(f.checking, '2026-11-03', -2_500, { categoryId: groceries }),
          ])
          await recurring(f.tx, f.checking, RENT, -80_000, {
            categoryId: rent,
          })
          await recurring(f.tx, f.checking, STREAMING, -1_399, {
            categoryId: leisure,
          })
          await recurring(f.tx, f.checking, GYM, -3_000, {
            categoryId: leisure,
            status: 'suggested',
          })
          f.service.now = () => new Date('2026-11-05T10:00:00Z')

          const result = await f.service.byCategory({})

          expect(result.period).toMatchObject({
            month: '2026-11',
            status: 'partial',
            throughDay: 3,
          })
          // Rent expected on the 5th: listed although nothing was spent in
          // it on 1–3 Nov or 1–3 Oct, and not counted as spent.
          expect(find(result.categories, rent)).toMatchObject({
            spentCents: 0,
            previousSpentCents: 0,
            expectedCents: 80_000,
            notYetThisMonth: false,
          })
          // The subscription is already paid; the gym is not confirmed.
          expect(find(result.categories, leisure)).toMatchObject({
            spentCents: 1_399,
            expectedCents: 0,
          })
          expect(find(result.categories, groceries)!.expectedCents).toBe(0)
          expect(result.totalCents).toBe(3_899)
          expect(result.expectedCents).toBe(80_000)

          // A complete month expects nothing more.
          const october = await f.service.byCategory({ month: '2026-10' })
          expect(october.expectedCents).toBe(0)
          expect(
            october.categories.every((item) => item.expectedCents === 0),
          ).toBe(true)

          // Only the series of the account filtered on.
          const savings = await f.service.byCategory({ accountId: f.savings })
          expect(savings.expectedCents).toBe(0)
        })
      })

      it('reads how far the data goes in the account filtered on', async () => {
        await withFixture(async (f) => {
          const { groceries } = f.category
          await insert(f.tx, [
            row(f.checking, '2026-10-02', -1_000, { categoryId: groceries }),
            row(f.checking, '2026-10-20', -2_000, { categoryId: groceries }),
            row(f.checking, '2026-11-12', -3_000, { categoryId: groceries }),
            // The savings account was imported up to the 2nd only.
            row(f.savings, '2026-11-02', -500, { categoryId: groceries }),
          ])

          const all = await f.service.byCategory({})
          expect(all.period).toMatchObject({ month: '2026-11', throughDay: 12 })
          expect(all.previousTotalCents).toBe(1_000)

          const savings = await f.service.byCategory({ accountId: f.savings })
          expect(savings.period).toMatchObject({
            month: '2026-11',
            dataUntil: '2026-11-02',
            throughDay: 2,
          })
        })
      })
    })
  })

  describe('income (#410)', () => {
    it('sums income per category, money in positive, leaving expenses and transfers out', async () => {
      await withFixture(async (f) => {
        await insert(f.tx, [
          row(f.checking, '2026-09-28', 250_000, {
            kind: 'income',
            categoryId: f.salary,
          }),
          row(f.checking, '2026-10-28', 260_000, {
            kind: 'income',
            categoryId: f.salary,
          }),
          // An outgoing amount filed in income lowers it.
          row(f.checking, '2026-10-29', -10_000, {
            kind: 'income',
            categoryId: f.salary,
          }),
          row(f.checking, '2026-10-12', 4_000, { kind: 'income' }),
          row(f.checking, '2026-10-03', -4_000, {
            categoryId: f.category.groceries,
          }),
          row(f.savings, '2026-10-05', 50_000, {
            kind: 'transfer',
            categoryId: f.livret,
          }),
        ])
        await f.tx.insert(budgetsTable).values({
          categoryId: f.salary,
          effectiveFrom: '2026-01-01',
          monthlyTargetCents: 255_000,
        })

        const result = await f.service.byCategory({
          kind: 'income',
          month: '2026-10',
        })

        expect(result.kind).toBe('income')
        expect(result.totalCents).toBe(254_000)
        expect(result.previousTotalCents).toBe(250_000)
        expect(result.categories.map((c) => c.categoryId)).toEqual([
          f.salary,
          null,
        ])
        expect(find(result.categories, f.salary)).toMatchObject({
          spentCents: 250_000,
          previousSpentCents: 250_000,
          transactionCount: 2,
          targetCents: 255_000,
          accountId: null,
          inCents: null,
        })
      })
    })

    it('returns the recurring income still expected in a month in progress', async () => {
      await withFixture(async (f) => {
        const SALARY = 'VIR SEPA EMPLOYEUR EXEMPLE SALAIRE'
        await insert(f.tx, [
          ...['2026-08-28', '2026-09-28', '2026-10-28'].map((date) =>
            row(f.checking, date, 250_000, {
              kind: 'income',
              rawLabel: SALARY,
              categoryId: f.salary,
            }),
          ),
          row(f.checking, '2026-11-03', -2_500, {
            categoryId: f.category.groceries,
          }),
        ])
        await recurring(f.tx, f.checking, SALARY, 250_000, {
          direction: 'credit',
          categoryId: f.salary,
          lastSeenDate: '2026-10-28',
        })
        f.service.now = () => new Date('2026-11-05T10:00:00Z')

        const result = await f.service.byCategory({ kind: 'income' })

        expect(result.period.status).toBe('partial')
        expect(find(result.categories, f.salary)).toMatchObject({
          spentCents: 0,
          expectedCents: 250_000,
        })
        expect(result.totalCents).toBe(0)
        expect(result.expectedCents).toBe(250_000)
        // The expenses expect no debit from it.
        const expenses = await f.service.byCategory({})
        expect(expenses.expectedCents).toBe(0)
      })
    })
  })

  describe('savings (#410)', () => {
    /** The transfer categories the Épargne rule reads (not seeded in tests). */
    async function moveCategories(tx: Tx) {
      const rows = await tx
        .insert(categoriesTable)
        .values(
          ['savings_transfer', 'investment_transfer', 'internal_transfer'].map(
            (slug) => ({ slug, name: slug, kind: 'transfer' as const }),
          ),
        )
        .onConflictDoNothing()
        .returning({ id: categoriesTable.id, slug: categoriesTable.slug })
      return new Map(rows.map((r) => [r.slug, r.id]))
    }

    it('reads the moves as the Épargne page does: per account, deposits and withdrawals', async () => {
      await withFixture(async (f) => {
        const cat = await moveCategories(f.tx)
        const [pea] = await f.tx
          .insert(accountsTable)
          .values({ name: 'Test PEA', type: 'brokerage' })
          .returning()
        const internal = {
          kind: 'transfer' as const,
          categoryId: cat.get('internal_transfer')!,
        }
        const invest = {
          kind: 'transfer' as const,
          categoryId: cat.get('investment_transfer')!,
        }
        await insert(f.tx, [
          // On both sides: only the savings account's row counts.
          row(f.checking, '2026-10-02', -30_000, internal),
          row(f.savings, '2026-10-02', 30_000, internal),
          row(f.savings, '2026-10-20', -10_000, internal),
          row(f.checking, '2026-10-20', 10_000, internal),
          // The PEA has no rows: its checking side, sign flipped.
          row(f.checking, '2026-10-05', -20_000, {
            ...invest,
            counterpartAccountId: pea.id,
          }),
          // A contribution whose account is not known.
          row(f.checking, '2026-10-06', -5_000, invest),
          // Between checking accounts, income, expenses: never counted.
          row(f.checking, '2026-10-07', -7_000, internal),
          row(f.checking, '2026-10-28', 250_000, {
            kind: 'income',
            categoryId: f.salary,
          }),
          row(f.checking, '2026-10-03', -4_000, {
            categoryId: f.category.groceries,
          }),
          row(f.savings, '2026-09-02', 30_000, internal),
        ])

        const result = await f.service.byCategory({
          kind: 'savings',
          month: '2026-10',
        })

        expect(result.kind).toBe('savings')
        expect(result.totalCents).toBe(45_000)
        expect(result.previousTotalCents).toBe(30_000)
        // Equal this month: the one with more the month before first.
        expect(result.categories.map((c) => c.accountId)).toEqual([
          f.savings,
          pea.id,
          null,
        ])
        expect(
          result.categories.find((c) => c.accountId === f.savings),
        ).toMatchObject({
          categoryId: null,
          name: 'Test savings',
          accountType: 'savings',
          icon: 'piggy-bank',
          spentCents: 20_000,
          inCents: 30_000,
          outCents: 10_000,
          previousSpentCents: 30_000,
          targetCents: null,
        })
        expect(
          result.categories.find((c) => c.accountId === pea.id),
        ).toMatchObject({
          name: 'Test PEA',
          accountType: 'brokerage',
          spentCents: 20_000,
          inCents: 20_000,
          outCents: 0,
        })
        expect(
          result.categories.find((c) => c.accountId === null),
        ).toMatchObject({ name: null, spentCents: 5_000 })

        // The trend follows the same rule, one series per account.
        const trend = await f.service.trend({
          kind: 'savings',
          month: '2026-10',
          months: 2,
        })
        expect(trend.kind).toBe('savings')
        expect(trend.totalsCents).toEqual([30_000, 45_000])
        expect(
          trend.series.find((s) => s.accountId === f.savings),
        ).toMatchObject({ type: 'account', valuesCents: [30_000, 20_000] })
      })
    })

    it('reads the checking side when no savings account has rows', async () => {
      await withFixture(async (f) => {
        const cat = await moveCategories(f.tx)
        await insert(f.tx, [
          row(f.checking, '2026-10-02', -30_000, {
            kind: 'transfer',
            categoryId: cat.get('savings_transfer')!,
            counterpartAccountId: f.savings,
          }),
          row(f.checking, '2026-10-03', -9_000, {
            kind: 'transfer',
            categoryId: cat.get('internal_transfer')!,
          }),
        ])

        const result = await f.service.byCategory({
          kind: 'savings',
          month: '2026-10',
        })

        expect(result.totalCents).toBe(30_000)
        expect(result.categories).toHaveLength(1)
        expect(result.categories[0]).toMatchObject({
          accountId: f.savings,
          inCents: 30_000,
        })
      })
    })
  })

  describe('trend', () => {
    it('stacks the top categories of the period and folds the rest into "other"', async () => {
      await withFixture(async (f) => {
        const c = f.category
        await insert(f.tx, [
          row(f.checking, '2026-09-01', -80_000, { categoryId: c.rent }),
          row(f.checking, '2026-10-01', -80_000, { categoryId: c.rent }),
          row(f.checking, '2026-10-02', -30_000, { categoryId: c.groceries }),
          row(f.checking, '2026-11-02', -20_000, { categoryId: c.transport }),
          row(f.checking, '2026-10-03', -15_000, { categoryId: c.leisure }),
          row(f.checking, '2026-10-04', -12_000, { categoryId: c.health }),
          row(f.checking, '2026-10-05', -9_000), // uncategorized
          row(f.checking, '2026-09-06', -1_000, { categoryId: c.gifts }),
          row(f.checking, '2026-11-06', -500, { categoryId: c.travel }),
          // Never spending.
          row(f.checking, '2026-10-07', -40_000, { kind: 'transfer' }),
          row(f.checking, '2026-10-08', 300_000, { kind: 'income' }),
          // Before the window.
          row(f.checking, '2026-08-31', -77_700, { categoryId: c.gifts }),
        ])

        const result = await f.service.trend({ months: 3 })

        expect(result.months).toEqual(['2026-09', '2026-10', '2026-11'])
        expect(result.series.map((s) => s.key)).toEqual([
          c.rent,
          c.groceries,
          c.transport,
          c.leisure,
          c.health,
          'other',
        ])
        expect(result.series[0]).toMatchObject({
          type: 'category',
          categoryId: c.rent,
          name: 'Test rent',
          color: '#000001',
          icon: null,
          valuesCents: [80_000, 80_000, 0],
          totalCents: 160_000,
        })
        expect(result.series[5]).toEqual({
          key: 'other',
          type: 'other',
          categoryId: null,
          accountId: null,
          slug: null,
          name: null,
          color: null,
          icon: null,
          // gifts in September; uncategorized in October; travel in November.
          valuesCents: [1_000, 9_000, 500],
          totalCents: 10_500,
        })
        expect(result.totalsCents).toEqual([81_000, 146_000, 20_500])
        // September and October are complete; November is still running.
        expect(result.averageMonths).toBe(2)
        expect(result.averageCents).toBe(113_500)
      })
    })

    it('shows a single category over the months, zeros included', async () => {
      await withFixture(async (f) => {
        const { groceries, rent } = f.category
        await insert(f.tx, [
          row(f.checking, '2026-01-10', -1, { categoryId: rent }),
          row(f.checking, '2026-08-10', -3_000, { categoryId: groceries }),
          row(f.checking, '2026-10-10', -6_000, { categoryId: groceries }),
          row(f.checking, '2026-10-11', 1_500, { categoryId: groceries }),
          row(f.checking, '2026-10-12', -9_999, {
            categoryId: groceries,
            isOneOff: true,
          }),
          row(f.checking, '2026-10-12', -7_000, { categoryId: rent }),
          // October is imported to its end (a transfer is never spending).
          row(f.checking, '2026-10-31', -100, { kind: 'transfer' }),
        ])

        const result = await f.service.trend({
          month: '2026-10',
          months: 4,
          categoryId: groceries,
        })

        expect(result.months).toEqual([
          '2026-07',
          '2026-08',
          '2026-09',
          '2026-10',
        ])
        expect(result.series).toHaveLength(1)
        expect(result.series[0]).toMatchObject({
          key: groceries,
          type: 'category',
          valuesCents: [0, 3_000, 0, 4_500],
          totalCents: 7_500,
        })
        expect(result.totalsCents).toEqual([0, 3_000, 0, 4_500])
        // Four complete months, the empty ones counting as 0.
        expect(result.averageMonths).toBe(4)
        expect(result.averageCents).toBe(1_875)

        const withOneOffs = await f.service.trend({
          month: '2026-10',
          months: 4,
          categoryId: groceries,
          includeOneOffs: true,
        })
        expect(withOneOffs.series[0].valuesCents).toEqual([0, 3_000, 0, 14_499])
      })
    })

    it('dates each month, names its largest categories and averages the same days', async () => {
      await withFixture(async (f) => {
        const c = f.category
        await insert(f.tx, [
          row(f.checking, '2026-09-02', -50_000, { categoryId: c.rent }),
          row(f.checking, '2026-09-20', -10_000, { categoryId: c.groceries }),
          row(f.checking, '2026-10-02', -50_000, { categoryId: c.rent }),
          row(f.checking, '2026-10-03', -6_000, { categoryId: c.groceries }),
          row(f.checking, '2026-10-04', -4_000, { categoryId: c.leisure }),
          row(f.checking, '2026-10-04', -3_000), // uncategorized
          row(f.checking, '2026-10-25', -8_000, { categoryId: c.groceries }),
          row(f.checking, '2026-10-26', -20_000, {
            categoryId: c.health,
            isOneOff: true,
          }),
          row(f.checking, '2026-11-03', -2_000, { categoryId: c.groceries }),
        ])

        const result = await f.service.trend({ months: 3 })

        expect(
          result.details.map((d) => [d.month, d.status, d.throughDay]),
        ).toEqual([
          ['2026-09', 'complete', null],
          ['2026-10', 'complete', null],
          ['2026-11', 'partial', 3],
        ])
        // October: the one-off is left out, groceries count both rows.
        expect(result.details[1].topCategories).toEqual([
          expect.objectContaining({
            categoryId: c.rent,
            name: 'Test rent',
            spentCents: 50_000,
          }),
          expect.objectContaining({
            categoryId: c.groceries,
            spentCents: 14_000,
          }),
          expect.objectContaining({ categoryId: c.leisure, spentCents: 4_000 }),
        ])
        expect(result.details[2].topCategories).toEqual([
          expect.objectContaining({
            categoryId: c.groceries,
            spentCents: 2_000,
          }),
        ])
        // September 60 000, October 71 000; their 3 first days 50 000 and 56 000.
        expect(result.averageCents).toBe(65_500)
        expect(result.sameDaysAverageCents).toBe(53_000)

        const groceries = await f.service.trend({
          months: 3,
          categoryId: c.groceries,
        })
        // September: none by the 3rd; October: 6 000.
        expect(groceries.sameDaysAverageCents).toBe(3_000)
        // The largest categories stay those of every category.
        expect(groceries.details[1].topCategories[0].categoryId).toBe(c.rent)

        const withOneOffs = await f.service.trend({
          months: 3,
          includeOneOffs: true,
        })
        expect(withOneOffs.details[1].topCategories[1]).toMatchObject({
          categoryId: c.health,
          spentCents: 20_000,
        })
      })
    })

    it('has no same-days average without a partial month', async () => {
      await withFixture(async (f) => {
        await insert(f.tx, [
          row(f.checking, '2026-10-31', -2_000, {
            categoryId: f.category.groceries,
          }),
        ])
        const result = await f.service.trend({ month: '2026-10', months: 2 })
        expect(result.details.map((d) => d.status)).toEqual([
          'complete',
          'complete',
        ])
        expect(result.sameDaysAverageCents).toBeNull()
      })
    })

    it('shows the uncategorized bucket on its own', async () => {
      await withFixture(async (f) => {
        await insert(f.tx, [
          row(f.checking, '2026-11-02', -2_000),
          row(f.checking, '2026-11-03', -1_000, {
            categoryId: f.category.groceries,
          }),
        ])

        const result = await f.service.trend({ months: 2, uncategorized: true })

        expect(result.series).toEqual([
          {
            key: 'uncategorized',
            type: 'uncategorized',
            categoryId: null,
            accountId: null,
            slug: null,
            name: null,
            color: null,
            icon: null,
            valuesCents: [0, 2_000],
            totalCents: 2_000,
          },
        ])
        // October is before the first transaction; November is running.
        expect(result.averageMonths).toBe(0)
        expect(result.averageCents).toBeNull()
      })
    })

    it('rejects an unknown category and contradictory filters', async () => {
      await withFixture(async (f) => {
        await expect(
          f.service.trend({ categoryId: UNKNOWN_ID }),
        ).rejects.toBeInstanceOf(NotFoundException)
        await expect(
          f.service.trend({
            categoryId: f.category.groceries,
            uncategorized: true,
          }),
        ).rejects.toBeInstanceOf(BadRequestException)
      })
    })

    it('returns empty months without transactions', async () => {
      await withFixture(async (f) => {
        const result = await f.service.trend({})
        expect(result.months).toHaveLength(12)
        expect(result.months.at(-1)).toBe('2026-11')
        expect(result.series).toEqual([])
        expect(result.totalsCents).toEqual(Array(12).fill(0))
        expect(result.averageCents).toBeNull()
      })
    })
  })
})
