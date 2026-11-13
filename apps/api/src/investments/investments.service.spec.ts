import '#/load-env'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AccountsService } from '#/accounts/accounts.service'
import { DashboardService } from '#/dashboard/dashboard.service'
import * as schema from '#/database/schema'
import type { AccountType } from '#/database/schema/domain-enums'
import { BudgetsService } from '#/budgets/budgets.service'
import { TransactionsService } from '#/transactions/transactions.service'
import { InvestmentsService } from './investments.service'

/**
 * Integration checks against the dedicated test database (see
 * `vitest.config.ts`). Every test runs in a transaction that is rolled back.
 * Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>

const ROLLBACK = Symbol('rollback')

/** 5 November 2026, mid-morning in Paris. */
const NOW = new Date('2026-11-05T10:00:00Z')

describe.skipIf(!process.env.DATABASE_URL)(
  'InvestmentsService (database)',
  () => {
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
      accounts: AccountsService
      investments: InvestmentsService
      dashboard: DashboardService
      account: (type: AccountType, name?: string) => Promise<string>
    }

    async function inRollback(fn: (f: Fixture) => Promise<void>) {
      await db
        .transaction(async (tx) => {
          // The services only read `db`; their transactions become savepoints.
          const database = { db: tx } as never
          const accounts = new AccountsService(database)
          const investments = new InvestmentsService(database, accounts)
          const dashboard = new DashboardService(
            database,
            accounts,
            new TransactionsService(database),
            new BudgetsService(database),
          )
          const account = async (type: AccountType, name = `Test ${type}`) =>
            (await accounts.create({ name, type, institution: 'Test bank' })).id
          await fn({ accounts, investments, dashboard, account })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    it('creates, replaces and deletes the snapshot of a day', async () => {
      await inRollback(async ({ investments, account }) => {
        const id = await account('brokerage')
        const created = await investments.upsert(
          id,
          '2026-09-30',
          { valueCents: 1_234_56, contributionsCents: 1_000_00, note: 'Q3' },
          NOW,
        )
        expect(created).toMatchObject({
          date: '2026-09-30',
          valueCents: 1_234_56,
          contributionsCents: 1_000_00,
          note: 'Q3',
        })

        const replaced = await investments.upsert(
          id,
          '2026-09-30',
          { valueCents: 1_300_00 },
          NOW,
        )
        expect(replaced).toMatchObject({
          id: created.id,
          valueCents: 1_300_00,
          contributionsCents: null,
          note: null,
        })
        expect(await investments.list(id)).toHaveLength(1)

        await investments.remove(id, '2026-09-30')
        expect(await investments.list(id)).toEqual([])
        await expect(investments.remove(id, '2026-09-30')).rejects.toThrow(
          NotFoundException,
        )
      })
    })

    it('accepts today in Paris and refuses future dates', async () => {
      await inRollback(async ({ investments, account }) => {
        const id = await account('crypto')
        // 23:30 UTC on 5 November is already 6 November in Paris.
        const lateEvening = new Date('2026-11-05T23:30:00Z')
        await expect(
          investments.upsert(id, '2026-11-06', { valueCents: 1 }, lateEvening),
        ).resolves.toMatchObject({ date: '2026-11-06' })
        await expect(
          investments.upsert(id, '2026-11-07', { valueCents: 1 }, lateEvening),
        ).rejects.toThrow(BadRequestException)
        await expect(
          investments.bulkUpsert(
            id,
            [{ date: '2026-11-07', valueCents: 1 }],
            lateEvening,
          ),
        ).rejects.toThrow(BadRequestException)
      })
    })

    it('refuses unknown and archived accounts for writes', async () => {
      await inRollback(async ({ accounts, investments, account }) => {
        await expect(
          investments.upsert(
            '00000000-0000-4000-8000-000000000000',
            '2026-01-01',
            { valueCents: 1 },
            NOW,
          ),
        ).rejects.toThrow(NotFoundException)
        const id = await account('life_insurance')
        await investments.upsert(id, '2025-12-31', { valueCents: 10 }, NOW)
        await accounts.update(id, { archived: true })
        await expect(
          investments.upsert(id, '2026-01-01', { valueCents: 1 }, NOW),
        ).rejects.toThrow(BadRequestException)
        await expect(investments.remove(id, '2025-12-31')).rejects.toThrow(
          BadRequestException,
        )
        // Still readable.
        expect(await investments.list(id)).toHaveLength(1)
      })
    })

    it('upserts a history in bulk, keeping known contributions and notes', async () => {
      await inRollback(async ({ investments, account }) => {
        const id = await account('brokerage')
        await investments.upsert(
          id,
          '2026-03-31',
          { valueCents: 900_00, contributionsCents: 800_00, note: 'Relevé' },
          NOW,
        )
        const result = await investments.bulkUpsert(
          id,
          [
            {
              date: '2025-12-31',
              valueCents: 850_00,
              contributionsCents: 780_00,
            },
            { date: '2026-03-31', valueCents: 910_00 },
            {
              date: '2026-06-30',
              valueCents: 950_00,
              contributionsCents: 820_00,
            },
          ],
          NOW,
        )
        expect(result).toEqual({ created: 2, updated: 1 })
        const snapshots = await investments.list(id)
        expect(
          snapshots.map((s) => [
            s.date,
            s.valueCents,
            s.contributionsCents,
            s.note,
          ]),
        ).toEqual([
          ['2025-12-31', 850_00, 780_00, null],
          ['2026-03-31', 910_00, 800_00, 'Relevé'],
          ['2026-06-30', 950_00, 820_00, null],
        ])

        // Re-running the same history changes nothing.
        await expect(
          investments.bulkUpsert(
            id,
            [
              {
                date: '2025-12-31',
                valueCents: 850_00,
                contributionsCents: 780_00,
              },
            ],
            NOW,
          ),
        ).resolves.toEqual({ created: 0, updated: 1 })
        expect(await investments.list(id)).toHaveLength(3)
      })
    })

    it('writes nothing when a bulk row is refused', async () => {
      await inRollback(async ({ investments, account }) => {
        const id = await account('brokerage')
        await expect(
          investments.bulkUpsert(
            id,
            [
              { date: '2026-01-31', valueCents: 1 },
              { date: '2026-01-31', valueCents: 2 },
            ],
            NOW,
          ),
        ).rejects.toThrow(/Duplicate date 2026-01-31/)
        expect(await investments.list(id)).toEqual([])
      })
    })

    it('computes the performance with missing contributions and a 1-year comparison', async () => {
      await inRollback(async ({ investments, account }) => {
        const id = await account('life_insurance')
        await investments.bulkUpsert(
          id,
          [
            {
              date: '2024-12-31',
              valueCents: 20_000_00,
              contributionsCents: 18_000_00,
            },
            {
              date: '2025-10-15',
              valueCents: 21_000_00,
              contributionsCents: 19_000_00,
            },
            {
              date: '2025-12-31',
              valueCents: 21_500_00,
              contributionsCents: 19_000_00,
            },
            // Occasional update without contributions.
            { date: '2026-08-01', valueCents: 22_400_00 },
          ],
          NOW,
        )
        const performance = await investments.performance(id, NOW)
        expect(performance).toMatchObject({
          accountId: id,
          type: 'life_insurance',
          valueCents: 22_400_00,
          valueDate: '2026-08-01',
          contributionsCents: 19_000_00,
          contributionsDate: '2025-12-31',
          gainCents: 3_400_00,
          daysSinceLatest: 96,
          stale: false,
        })
        expect(performance.returnRate).toBeCloseTo(3_400_00 / 19_000_00)
        expect(performance.sincePrevious).toMatchObject({
          fromDate: '2025-12-31',
          changeCents: 900_00,
          contributionsChangeCents: null,
        })
        // Last snapshot on or before 2025-08-01.
        expect(performance.sinceOneYear).toMatchObject({
          fromDate: '2024-12-31',
          changeCents: 2_400_00,
        })
        expect(performance.snapshots.map((s) => s.date)).toEqual([
          '2024-12-31',
          '2025-10-15',
          '2025-12-31',
          '2026-08-01',
        ])
      })
    })

    it('sums the investment accounts in the summary', async () => {
      await inRollback(async ({ accounts, investments, account }) => {
        const pea = await account('brokerage', 'Test PEA')
        const life = await account('life_insurance', 'Test life')
        const crypto = await account('crypto', 'Test crypto')
        const empty = await account('employee_savings', 'Test PEE')
        const archived = await account('brokerage', 'Test old PEA')
        const checking = await account('checking', 'Test checking')
        await investments.upsert(
          pea,
          '2026-09-30',
          { valueCents: 12_000_00, contributionsCents: 10_000_00 },
          NOW,
        )
        await investments.upsert(
          life,
          '2025-12-31',
          { valueCents: 5_500_00, contributionsCents: 5_000_00 },
          NOW,
        )
        await investments.upsert(
          crypto,
          '2026-06-01',
          { valueCents: 800_00 },
          NOW,
        )
        await investments.upsert(
          archived,
          '2026-01-01',
          { valueCents: 99_00 },
          NOW,
        )
        await investments.upsert(
          checking,
          '2026-10-31',
          { valueCents: 1_00 },
          NOW,
        )
        await accounts.update(archived, { archived: true })

        const summary = await investments.summary(NOW)
        expect(summary.accounts.map((a) => a.id)).toEqual([
          pea,
          life,
          crypto,
          empty,
        ])
        expect(summary.totals).toEqual({
          valueCents: 18_300_00,
          contributionsCents: 15_000_00,
          gainCents: 2_500_00,
          returnRate: 2_500_00 / 15_000_00,
          withoutContributionsCount: 1,
          withoutValueCount: 1,
          // The crypto value is from June.
          staleCount: 1,
        })
        expect(summary.accounts[2]).toMatchObject({
          name: 'Test crypto',
          type: 'crypto',
          valueCents: 800_00,
          gainCents: null,
          daysSinceLatest: 157,
          stale: true,
        })
      })
    })

    it('feeds the dashboard net worth with a new snapshot', async () => {
      await inRollback(async ({ investments, dashboard, account }) => {
        const pea = await account('brokerage')
        await investments.upsert(
          pea,
          '2026-09-30',
          { valueCents: 10_000_00 },
          NOW,
        )
        const before = await dashboard.overview('2026-11', { now: NOW })
        await investments.upsert(
          pea,
          '2026-11-04',
          { valueCents: 10_500_00 },
          NOW,
        )
        const after = await dashboard.overview('2026-11', { now: NOW })
        expect(
          after.netWorth.investmentsCents - before.netWorth.investmentsCents,
        ).toBe(500_00)
        expect(after.accounts.find((a) => a.id === pea)).toMatchObject({
          balanceCents: 10_500_00,
          balanceDate: '2026-11-04',
        })
        // The October month end still sees the September value.
        expect(after.netWorth.previousMonthEndCents).toBe(
          before.netWorth.previousMonthEndCents,
        )
      })
    })
  },
)
