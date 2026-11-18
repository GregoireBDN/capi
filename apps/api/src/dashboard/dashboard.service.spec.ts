import '#/load-env'
import { ValidationPipe } from '@nestjs/common'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AccountsService } from '#/accounts/accounts.service'
import * as schema from '#/database/schema'
import {
  balanceSnapshotsTable,
  monthClosesTable,
  categoriesTable,
  importsTable,
  type InsertTransaction,
  transactionsTable,
} from '#/database/schema'
import { BudgetsService } from '#/budgets/budgets.service'
import { TransactionsService } from '#/transactions/transactions.service'
import { DashboardService, savingsRate } from './dashboard.service'
import {
  DashboardHistoryQueryDto,
  DashboardOverviewQueryDto,
} from './dto/dashboard.dto'

/**
 * Integration checks against the dedicated test database (see
 * `vitest.config.ts`). Every test runs in a transaction that is rolled back.
 * Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

/** 5 November 2026, mid-morning in Paris. */
const NOW = new Date('2026-11-05T10:00:00Z')

describe.skipIf(!process.env.DATABASE_URL)(
  'DashboardService (database)',
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

    async function inRollback(
      fn: (f: {
        tx: Tx
        accounts: AccountsService
        dashboard: DashboardService
      }) => Promise<void>,
    ) {
      await db
        .transaction(async (tx) => {
          const database = { db: tx } as never
          const accounts = new AccountsService(database)
          const dashboard = new DashboardService(
            database,
            accounts,
            new TransactionsService(database),
            new BudgetsService(database),
          )
          await fn({ tx, accounts, dashboard })
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
    ) {
      hash++
      return {
        accountId,
        bookingDate: '2026-10-01',
        amountCents: -1_000,
        rawLabel: 'PAIEMENT CB 0110 VILLE-TEST FAUX MAGASIN',
        kind: 'expense',
        dedupeHash: `dashboard-test-${hash}`,
        ...overrides,
      } satisfies InsertTransaction
    }

    it('returns zeros and no net worth on an empty database', async () => {
      await inRollback(async ({ dashboard }) => {
        const overview = await dashboard.overview('2026-11', { now: NOW })
        expect(overview).toEqual({
          netWorth: {
            totalCents: 0,
            cashCents: 0,
            investmentsCents: 0,
            previousMonthEnd: '2026-10-31',
            previousMonthEndCents: null,
            unknownBalanceCount: 0,
          },
          accounts: [],
          period: {
            month: '2026-11',
            dataUntil: null,
            status: 'empty',
            throughDay: null,
            previousMonth: '2026-10',
            previousUntil: null,
            defaultMonth: '2026-11',
          },
          current: {
            month: '2026-11',
            until: '2026-11-30',
            incomeCents: 0,
            expenseCents: 0,
            netCents: 0,
            oneOffIncomeCents: 0,
            oneOffExpenseCents: 0,
            savingsRate: null,
          },
          previous: expect.objectContaining({
            month: '2026-10',
            netCents: 0,
            savingsRate: null,
          }),
          reviewCount: 0,
        })

        const { months } = await dashboard.history(12, { now: NOW })
        expect(months.map((m) => m.month)).toEqual([
          '2025-12',
          '2026-01',
          '2026-02',
          '2026-03',
          '2026-04',
          '2026-05',
          '2026-06',
          '2026-07',
          '2026-08',
          '2026-09',
          '2026-10',
          '2026-11',
        ])
        for (const month of months) {
          expect(month).toMatchObject({
            incomeCents: 0,
            expenseCents: 0,
            netCents: 0,
            netWorthCents: null,
          })
        }
      })
    })

    it('never counts transfers as income or expense, and cuts months on calendar dates', async () => {
      await inRollback(async ({ tx, accounts, dashboard }) => {
        const checking = await accounts.create({
          name: 'Test checking',
          type: 'checking',
        })
        const savings = await accounts.create({
          name: 'Test savings',
          type: 'savings',
        })
        await tx.insert(transactionsTable).values([
          // September: last day.
          transaction(checking.id, {
            bookingDate: '2026-09-30',
            amountCents: -2_000,
          }),
          // October: first and last day, a one-off, a refund.
          transaction(checking.id, {
            bookingDate: '2026-10-01',
            amountCents: 300_000,
            kind: 'income',
          }),
          transaction(checking.id, {
            bookingDate: '2026-10-20',
            amountCents: -10_000,
            isOneOff: true,
          }),
          transaction(checking.id, {
            bookingDate: '2026-10-22',
            amountCents: 1_500,
          }),
          transaction(checking.id, {
            bookingDate: '2026-10-31',
            amountCents: -5_000,
            needsReview: true,
          }),
          // Transfer checking → savings: both legs are left out.
          transaction(checking.id, {
            bookingDate: '2026-10-15',
            amountCents: -50_000,
            kind: 'transfer',
          }),
          transaction(savings.id, {
            bookingDate: '2026-10-15',
            amountCents: 50_000,
            kind: 'transfer',
          }),
          // November: first day.
          transaction(checking.id, {
            bookingDate: '2026-11-01',
            amountCents: -7_000,
          }),
        ])

        const overview = await dashboard.overview('2026-10', { now: NOW })
        expect(overview.period.status).toBe('complete')
        expect(overview.current).toEqual({
          month: '2026-10',
          until: '2026-10-31',
          incomeCents: 300_000,
          expenseCents: -13_500,
          netCents: 286_500,
          oneOffIncomeCents: 0,
          oneOffExpenseCents: -10_000,
          savingsRate: 286_500 / 300_000,
        })
        expect(overview.previous).toMatchObject({
          month: '2026-09',
          until: '2026-09-30',
          incomeCents: 0,
          expenseCents: -2_000,
          netCents: -2_000,
          savingsRate: null,
        })
        expect(overview.reviewCount).toBe(1)
        // Transfers move money between accounts, never out of the net worth.
        expect(overview.netWorth).toMatchObject({
          totalCents: 300_000 - 2_000 - 13_500 - 7_000,
          cashCents: 300_000 - 2_000 - 13_500 - 7_000,
          investmentsCents: 0,
        })
        expect(
          overview.accounts.map((a) => [
            a.name,
            a.group,
            a.balanceCents,
            a.dataUntil,
          ]),
        ).toEqual([
          [
            'Test checking',
            'cash',
            300_000 - 2_000 - 13_500 - 7_000 - 50_000,
            '2026-11-01',
          ],
          ['Test savings', 'cash', 50_000, '2026-10-15'],
        ])

        const { months } = await dashboard.history(3, { now: NOW })
        expect(
          months.map((m) => [
            m.month,
            m.incomeCents,
            m.expenseCents,
            m.netCents,
          ]),
        ).toEqual([
          ['2026-09', 0, -2_000, -2_000],
          ['2026-10', 300_000, -13_500, 286_500],
          ['2026-11', 0, -7_000, -7_000],
        ])
      })
    })

    it('takes the current month in Europe/Paris', async () => {
      await inRollback(async ({ dashboard }) => {
        // Still October 31st in UTC, already November 1st in Paris.
        const { months } = await dashboard.history(1, {
          now: new Date('2026-10-31T23:30:00Z'),
        })
        expect(months.map((m) => m.month)).toEqual(['2026-11'])

        const overview = await dashboard.overview('2026-11', {
          now: new Date('2026-10-31T23:30:00Z'),
        })
        expect(overview.previous.month).toBe('2026-10')
      })
    })

    it('rebuilds month-end net worth from snapshots, running balances and later transactions', async () => {
      await inRollback(async ({ tx, accounts, dashboard }) => {
        // Spreadsheet history: month-end snapshots, rows without balance.
        const checking = await accounts.create({
          name: 'Test checking',
          type: 'checking',
        })
        // Bank export: running balances, then a row entered by hand.
        const exported = await accounts.create({
          name: 'Test exported',
          type: 'checking',
        })
        // No anchor at all: the sum of the amounts.
        const savings = await accounts.create({
          name: 'Test savings',
          type: 'savings',
        })
        const pea = await accounts.create({
          name: 'Test PEA',
          type: 'brokerage',
        })
        const closed = await accounts.create({
          name: 'Test closed',
          type: 'savings',
        })
        await accounts.update(closed.id, { archived: true })

        await tx.insert(balanceSnapshotsTable).values([
          { accountId: checking.id, date: '2026-08-31', valueCents: 100_000 },
          { accountId: pea.id, date: '2026-08-31', valueCents: 200_000 },
          { accountId: pea.id, date: '2026-10-31', valueCents: 210_000 },
          { accountId: closed.id, date: '2026-08-31', valueCents: 99_999 },
        ])
        await tx.insert(transactionsTable).values([
          // Already in the 08-31 snapshot.
          transaction(checking.id, {
            bookingDate: '2026-08-20',
            amountCents: -999,
          }),
          transaction(checking.id, {
            bookingDate: '2026-09-10',
            amountCents: -20_000,
          }),
          transaction(checking.id, {
            bookingDate: '2026-09-15',
            amountCents: -50_000,
            kind: 'transfer',
          }),
          transaction(savings.id, {
            bookingDate: '2026-09-15',
            amountCents: 50_000,
            kind: 'transfer',
          }),
          transaction(checking.id, {
            bookingDate: '2026-10-05',
            amountCents: 5_000,
            kind: 'income',
          }),
          transaction(checking.id, {
            bookingDate: '2026-11-02',
            amountCents: -1_000,
          }),
          transaction(exported.id, {
            bookingDate: '2026-09-05',
            amountCents: -100,
            balanceAfterCents: 10_000,
          }),
          transaction(exported.id, {
            bookingDate: '2026-10-03',
            amountCents: -200,
            balanceAfterCents: 9_800,
          }),
          transaction(exported.id, {
            bookingDate: '2026-10-10',
            amountCents: -300,
          }),
        ])

        const { months } = await dashboard.history(5, { now: NOW })
        expect(months.map((m) => [m.month, m.netWorthCents])).toEqual([
          // Before any data.
          ['2026-07', null],
          // checking 100 000 + PEA 200 000 (exported, savings: nothing yet).
          ['2026-08', 300_000],
          // checking 30 000 + exported 10 000 + savings 50 000 + PEA 200 000.
          ['2026-09', 290_000],
          // checking 35 000 + exported 9 500 + savings 50 000 + PEA 210 000.
          ['2026-10', 304_500],
          // checking 34 000 + the rest unchanged.
          ['2026-11', 303_500],
        ])

        // Each month end lists the balances behind it, archived account and
        // accounts without a balance yet left out; they add up to the total.
        const names = new Map([
          [checking.id, 'checking'],
          [exported.id, 'exported'],
          [savings.id, 'savings'],
          [pea.id, 'pea'],
        ])
        expect(
          months.map((m) =>
            m.accounts.map((a) => [
              names.get(a.accountId),
              a.type,
              a.balanceCents,
            ]),
          ),
        ).toEqual([
          [],
          [
            ['checking', 'checking', 100_000],
            ['pea', 'brokerage', 200_000],
          ],
          [
            ['checking', 'checking', 30_000],
            ['exported', 'checking', 10_000],
            ['savings', 'savings', 50_000],
            ['pea', 'brokerage', 200_000],
          ],
          [
            ['checking', 'checking', 35_000],
            ['exported', 'checking', 9_500],
            ['savings', 'savings', 50_000],
            ['pea', 'brokerage', 210_000],
          ],
          [
            ['checking', 'checking', 34_000],
            ['exported', 'checking', 9_500],
            ['savings', 'savings', 50_000],
            ['pea', 'brokerage', 210_000],
          ],
        ])
        for (const month of months) {
          const sum = month.accounts.reduce((s, a) => s + a.balanceCents, 0)
          expect(month.netWorthCents ?? 0).toBe(sum)
        }

        const overview = await dashboard.overview('2026-11', { now: NOW })
        expect(overview.netWorth).toEqual({
          totalCents: 303_500,
          cashCents: 93_500,
          investmentsCents: 210_000,
          previousMonthEnd: '2026-10-31',
          previousMonthEndCents: 304_500,
          unknownBalanceCount: 0,
        })
        expect(overview.accounts.map((a) => a.name)).not.toContain(
          'Test closed',
        )
        expect(overview.accounts.find((a) => a.id === pea.id)).toMatchObject({
          group: 'investments',
          balanceCents: 210_000,
          balanceDate: '2026-10-31',
          dataUntil: '2026-10-31',
          stale: false,
        })

        // Same figures as the accounts list as of each month end.
        const asOf = await accounts.list({ asOf: '2026-09-30' })
        expect(asOf.find((a) => a.id === checking.id)).toMatchObject({
          balanceCents: 30_000,
          balanceDate: '2026-09-15',
        })
      })
    })

    it('flags investment values older than a month', async () => {
      await inRollback(async ({ tx, accounts, dashboard }) => {
        const create = (name: string, type: 'checking' | 'brokerage') =>
          accounts.create({ name, type })
        const due = await create('Test PEA due', 'brokerage')
        const fresh = await create('Test PEA fresh', 'brokerage')
        const empty = await create('Test PEA empty', 'brokerage')
        const checking = await create('Test checking', 'checking')
        await tx.insert(balanceSnapshotsTable).values([
          // 32 and 31 days before 5 November.
          { accountId: due.id, date: '2026-10-04', valueCents: 1_000 },
          { accountId: fresh.id, date: '2026-10-05', valueCents: 1_000 },
          { accountId: checking.id, date: '2026-01-31', valueCents: 1_000 },
        ])

        const overview = await dashboard.overview('2026-11', { now: NOW })
        const stale = new Map(overview.accounts.map((a) => [a.id, a.stale]))
        expect(stale.get(due.id)).toBe(true)
        expect(stale.get(fresh.id)).toBe(false)
        expect(stale.get(empty.id)).toBe(false)
        // Cash accounts are fed by imports: the month review covers them.
        expect(stale.get(checking.id)).toBe(false)
      })
    })

    it('compares a partial month with the same days of the previous one', async () => {
      await inRollback(async ({ tx, accounts, dashboard }) => {
        const checking = await accounts.create({
          name: 'Test checking',
          type: 'checking',
        })
        await tx.insert(transactionsTable).values([
          transaction(checking.id, {
            bookingDate: '2026-10-01',
            amountCents: 250_000,
            kind: 'income',
          }),
          transaction(checking.id, {
            bookingDate: '2026-10-02',
            amountCents: -4_000,
          }),
          // After the 3rd: out of the comparison.
          transaction(checking.id, {
            bookingDate: '2026-10-05',
            amountCents: -90_000,
          }),
          transaction(checking.id, {
            bookingDate: '2026-10-28',
            amountCents: 40_000,
            kind: 'income',
          }),
          // November so far: the 1st to the 3rd.
          transaction(checking.id, {
            bookingDate: '2026-11-01',
            amountCents: 250_000,
            kind: 'income',
          }),
          transaction(checking.id, {
            bookingDate: '2026-11-03',
            amountCents: -6_000,
          }),
          // A transfer is never income or expense, on either side.
          transaction(checking.id, {
            bookingDate: '2026-10-03',
            amountCents: -20_000,
            kind: 'transfer',
          }),
        ])

        const overview = await dashboard.overview(undefined, { now: NOW })
        expect(overview.period).toEqual({
          month: '2026-11',
          dataUntil: '2026-11-03',
          status: 'partial',
          throughDay: 3,
          previousMonth: '2026-10',
          previousUntil: '2026-10-03',
          defaultMonth: '2026-11',
        })
        expect(overview.current).toMatchObject({
          incomeCents: 250_000,
          expenseCents: -6_000,
        })
        expect(overview.previous).toMatchObject({
          month: '2026-10',
          until: '2026-10-03',
          incomeCents: 250_000,
          expenseCents: -4_000,
          netCents: 246_000,
        })
      })
    })

    it('shows the last month with data when the current one has none yet', async () => {
      await inRollback(async ({ tx, accounts, dashboard }) => {
        const checking = await accounts.create({
          name: 'Test checking',
          type: 'checking',
        })
        await tx.insert(transactionsTable).values([
          transaction(checking.id, {
            bookingDate: '2026-09-30',
            amountCents: -3_000,
          }),
          transaction(checking.id, {
            bookingDate: '2026-10-31',
            amountCents: -5_000,
          }),
        ])

        // 2 November, nothing imported since October.
        const now = new Date('2026-11-02T08:00:00Z')
        const overview = await dashboard.overview(undefined, { now })
        expect(overview.period).toMatchObject({
          month: '2026-10',
          status: 'complete',
          dataUntil: '2026-10-31',
          defaultMonth: '2026-10',
        })
        expect(overview.current).toMatchObject({ expenseCents: -5_000 })
        expect(overview.previous).toMatchObject({
          month: '2026-09',
          until: '2026-09-30',
          expenseCents: -3_000,
        })

        // November asked for explicitly: empty, nothing to compare with.
        const november = await dashboard.overview('2026-11', { now })
        expect(november.period).toMatchObject({
          status: 'empty',
          previousUntil: null,
        })
      })
    })

    describe('review', () => {
      async function expenseCategories(tx: Tx) {
        const rows = await tx
          .insert(categoriesTable)
          .values([
            { slug: 'test_groceries', name: 'Test courses', kind: 'expense' },
            { slug: 'test_leisure', name: 'Test sorties', kind: 'expense' },
          ])
          .returning()
        return { groceries: rows[0].id, leisure: rows[1].id }
      }

      it('says when the month was closed and whether the next month has a budget', async () => {
        await inRollback(async ({ tx, dashboard }) => {
          const { groceries } = await expenseCategories(tx)
          const closedAt = new Date('2026-11-03T09:00:00Z')
          await tx.insert(monthClosesTable).values({
            month: '2026-10',
            closedAt,
            report: {} as never,
          })
          // A budget that starts after the reviewed month's next one.
          const budgets = new BudgetsService({ db: tx } as never)
          await budgets.upsert(groceries, '2026-12', {
            monthlyTargetCents: 20_000,
          })

          const october = await dashboard.review('2026-10', { now: NOW })
          expect(october.closedAt).toBe(closedAt.toISOString())
          expect(october.nextMonthBudgeted).toBe(false)

          const november = await dashboard.review('2026-11', { now: NOW })
          expect(november.closedAt).toBeNull()
          expect(november.nextMonthBudgeted).toBe(true)
        })
      })

      it('reviews a closed month against its budget, split into saved and the rest', async () => {
        await inRollback(async ({ tx, accounts, dashboard }) => {
          const { groceries, leisure } = await expenseCategories(tx)
          const checking = await accounts.create({
            name: 'Test checking',
            type: 'checking',
          })
          const livret = await accounts.create({
            name: 'Test savings',
            type: 'savings',
          })
          const pea = await accounts.create({
            name: 'Test PEA',
            type: 'brokerage',
          })
          await tx.insert(transactionsTable).values([
            transaction(checking.id, {
              bookingDate: '2026-09-30',
              amountCents: 300_000,
              kind: 'income',
            }),
            transaction(checking.id, {
              bookingDate: '2026-10-01',
              amountCents: 250_000,
              kind: 'income',
            }),
            transaction(checking.id, {
              bookingDate: '2026-10-05',
              amountCents: -30_000,
              categoryId: groceries,
            }),
            transaction(checking.id, {
              bookingDate: '2026-10-10',
              amountCents: -5_000,
              categoryId: leisure,
            }),
            // A move to the savings account: neither saved nor spent.
            transaction(checking.id, {
              bookingDate: '2026-10-31',
              amountCents: -50_000,
              kind: 'transfer',
            }),
            transaction(livret.id, {
              bookingDate: '2026-10-31',
              amountCents: 50_000,
              kind: 'transfer',
            }),
            transaction(checking.id, {
              bookingDate: '2026-11-02',
              amountCents: -1_000,
            }),
          ])
          await tx.insert(balanceSnapshotsTable).values([
            { accountId: pea.id, date: '2026-09-30', valueCents: 100_000 },
            { accountId: pea.id, date: '2026-10-31', valueCents: 104_000 },
          ])
          const budgets = new BudgetsService({ db: tx } as never)
          await budgets.upsert(groceries, '2026-10', {
            monthlyTargetCents: 20_000,
          })
          await budgets.upsert(leisure, '2026-10', {
            monthlyTargetCents: 15_000,
          })

          const review = await dashboard.review(undefined, { now: NOW })

          expect(review).toMatchObject({
            month: '2026-10',
            nextMonth: '2026-11',
            closed: true,
            // Not closed in « Revue du mois »; the budget carries over.
            closedAt: null,
            nextMonthBudgeted: true,
            missing: [],
          })
          expect(review.period.status).toBe('complete')
          // 400 000 at the end of September, 619 000 at the end of October:
          // 215 000 saved from the month's income and expenses, 4 000 from
          // the PEA's value.
          expect(review.netWorth).toEqual({
            date: '2026-10-31',
            endCents: 619_000,
            previousDate: '2026-09-30',
            previousEndCents: 400_000,
            changeCents: 219_000,
            savedCents: 215_000,
            otherCents: 4_000,
          })
          expect(review.flow).toMatchObject({
            incomeCents: 250_000,
            expenseCents: -35_000,
            netCents: 215_000,
            savingsRate: 215_000 / 250_000,
          })
          expect(review.budget).toMatchObject({
            budgetCount: 2,
            targetCents: 35_000,
            spentCents: 35_000,
            remainingCents: 0,
            unbudgetedCents: 0,
          })
          expect(review.budget.over).toEqual([
            expect.objectContaining({
              categoryId: groceries,
              targetCents: 20_000,
              spentCents: 30_000,
              gapCents: 10_000,
            }),
          ])
          expect(review.budget.under).toEqual([
            expect.objectContaining({ categoryId: leisure, gapCents: -10_000 }),
          ])
        })
      })

      it('lists the accounts not updated up to the month end', async () => {
        await inRollback(async ({ tx, accounts, dashboard }) => {
          const checking = await accounts.create({
            name: 'Test checking',
            type: 'checking',
          })
          const livret = await accounts.create({
            name: 'Test savings',
            type: 'savings',
          })
          const pea = await accounts.create({
            name: 'Test PEA',
            type: 'brokerage',
          })
          await tx
            .insert(transactionsTable)
            .values([transaction(checking.id, { bookingDate: '2026-10-20' })])
          await tx
            .insert(balanceSnapshotsTable)
            .values([
              { accountId: pea.id, date: '2026-09-30', valueCents: 100_000 },
            ])
          const now = new Date('2026-11-02T08:00:00Z')

          const review = await dashboard.review(undefined, { now })
          expect(review.month).toBe('2026-10')
          expect(review.closed).toBe(false)
          expect(review.period).toMatchObject({
            status: 'partial',
            throughDay: 20,
          })
          expect(review.budget).toMatchObject({ budgetCount: 0, over: [] })
          expect(review.missing.map((a) => [a.name, a.lastDate])).toEqual([
            ['Test checking', '2026-10-20'],
            ['Test savings', null],
            ['Test PEA', '2026-09-30'],
          ])

          // A savings statement exported after the month end covers it,
          // even without any movement.
          await tx.insert(importsTable).values({
            accountId: livret.id,
            source: 'cic_csv',
            fileName: 'test.csv',
            fileHash: 'c'.repeat(64),
            committedAt: new Date('2026-11-01T09:00:00Z'),
          })
          const again = await dashboard.review('2026-10', { now })
          expect(again.missing.map((a) => a.name)).toEqual([
            'Test checking',
            'Test PEA',
          ])
        })
      })
    })

    it('counts accounts without a known balance apart', async () => {
      await inRollback(async ({ accounts, dashboard }) => {
        await accounts.create({ name: 'Test crypto', type: 'crypto' })
        const overview = await dashboard.overview('2026-11', { now: NOW })
        expect(overview.netWorth).toMatchObject({
          totalCents: 0,
          unknownBalanceCount: 1,
          previousMonthEndCents: null,
        })
        expect(overview.accounts[0]).toMatchObject({
          group: 'investments',
          balanceCents: null,
        })
      })
    })
  },
)

describe('savingsRate', () => {
  it('divides the net by a positive income only', () => {
    expect(savingsRate(200_000, 50_000)).toBe(0.25)
    expect(savingsRate(200_000, -10_000)).toBe(-0.05)
    expect(savingsRate(0, -10_000)).toBeNull()
    expect(savingsRate(-500, 0)).toBeNull()
  })
})

describe('dashboard query validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  })

  function validate<T>(metatype: new () => T, value: unknown) {
    return pipe.transform(value, { type: 'query', metatype }) as Promise<T>
  }

  it('accepts a YYYY-MM month and rejects anything else', async () => {
    await expect(
      validate(DashboardOverviewQueryDto, { month: '2026-02' }),
    ).resolves.toMatchObject({ month: '2026-02' })
    for (const month of ['2026-13', '2026-1', '2026-02-01', 'now']) {
      await expect(
        validate(DashboardOverviewQueryDto, { month }),
      ).rejects.toThrow()
    }
  })

  it('parses months between 1 and 60', async () => {
    await expect(
      validate(DashboardHistoryQueryDto, { months: '24' }),
    ).resolves.toMatchObject({ months: 24 })
    for (const months of ['0', '61', '1.5', 'abc']) {
      await expect(
        validate(DashboardHistoryQueryDto, { months }),
      ).rejects.toThrow()
    }
  })
})
