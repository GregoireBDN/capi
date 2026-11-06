import '#/load-env'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  categorizationRulesTable,
  type InsertTransaction,
  transactionsTable,
} from '#/database/schema'
import type { CategorySpendingDto } from './dto/spending.dto'
import { SpendingService } from './spending.service'

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
            })),
            { slug: 'test_salary', name: 'Test salary', kind: 'income' },
            { slug: 'test_livret', name: 'Test livret', kind: 'transfer' },
          ])
          .returning()
        const bySlug = new Map(rows.map((c) => [c.slug, c.id]))
        const service = new SpendingService({ db: tx } as never)
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
    await tx.insert(transactionsTable).values(rows)
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
          // Transfer to savings, filed under an expense category by mistake
          // or not: never spending.
          row(f.checking, '2026-10-05', -50_000, {
            kind: 'transfer',
            categoryId: f.livret,
          }),
          row(f.checking, '2026-10-06', -10_000, {
            kind: 'transfer',
            categoryId: groceries,
          }),
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
          spentCents: 2_000,
          share: 2_000 / 11_000,
          transactionCount: 2,
          previousSpentCents: 0,
          deltaCents: 2_000,
          averageCents: null,
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
          month: '2026-11',
          previousMonth: '2026-10',
          includeOneOffs: false,
          averageMonths: 0,
          averageFrom: null,
          totalCents: 0,
          transactionCount: 0,
          previousTotalCents: 0,
          averageTotalCents: null,
          oneOffCents: 0,
          categories: [],
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
          valuesCents: [80_000, 80_000, 0],
          totalCents: 160_000,
        })
        expect(result.series[5]).toEqual({
          key: 'other',
          type: 'other',
          categoryId: null,
          slug: null,
          name: null,
          color: null,
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
            slug: null,
            name: null,
            color: null,
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
