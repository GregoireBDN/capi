import { asSpecOwner } from '#/database/testing/spec-owner'
import '#/load-env'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '#/database/schema'
import {
  balanceSnapshotsTable,
  importsTable,
  type InsertTransaction,
  transactionsTable,
} from '#/database/schema'
import { AccountActivityService } from './account-activity.service'
import { AccountsService } from './accounts.service'
import { bankRows } from '#/transactions/testing/bank-rows'

/**
 * Integration checks against the migrated test database. Every test runs in
 * a transaction that is rolled back. Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')
/** 19 November 2026, noon in Paris. */
const NOW = new Date('2026-11-19T11:00:00Z')

describe.skipIf(!process.env.DATABASE_URL)(
  'AccountActivityService (database)',
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
        activity: AccountActivityService
      }) => Promise<void>,
    ) {
      await db
        .transaction(async (tx) => {
          await asSpecOwner(tx)
          const database = { db: tx } as never
          await fn({
            tx,
            accounts: new AccountsService(database),
            activity: new AccountActivityService(database),
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
    ) {
      hash++
      return {
        accountId,
        bookingDate: '2026-10-01',
        amountCents: -1_000,
        rawLabel: 'PAIEMENT CB 0110 VILLE-TEST FAUX MAGASIN',
        kind: 'expense',
        dedupeHash: `activity-test-${hash}`,
        ...overrides,
      } satisfies InsertTransaction
    }

    it('draws the bank balance: corrections never change it, manual rows count after the anchor', async () => {
      await inRollback(async ({ tx, accounts, activity }) => {
        const account = await accounts.create({
          name: 'Test checking',
          type: 'checking',
        })
        await tx.insert(transactionsTable).values(
          await bankRows(tx, [
            transaction(account.id, {
              bookingDate: '2026-10-01',
              amountCents: -1_000,
              balanceAfterCents: 99_000,
            }),
            // Corrected by hand: the bank's amount and day stay the balance's.
            transaction(account.id, {
              bookingDate: '2026-10-09',
              amountCents: -9_999,
              originalBookingDate: '2026-10-05',
              originalAmountCents: -2_000,
              balanceAfterCents: 97_000,
            }),
            // Entered by hand before the bank's last day: already in its balance.
            transaction(account.id, {
              bookingDate: '2026-10-04',
              amountCents: -500,
              manual: true,
            }),
            // Entered by hand after it: counts from its day.
            transaction(account.id, {
              bookingDate: '2026-10-07',
              amountCents: -300,
              manual: true,
            }),
          ]),
        )

        const history = await activity.balanceHistory(account.id, NOW)
        expect(history.from).toBe('2026-10-01')
        expect(history.to).toBe('2026-10-07')
        expect(history.points).toEqual([
          { date: '2026-10-01', balanceCents: 99_000 },
          { date: '2026-10-02', balanceCents: 99_000 },
          { date: '2026-10-03', balanceCents: 99_000 },
          { date: '2026-10-04', balanceCents: 98_500 },
          { date: '2026-10-05', balanceCents: 97_000 },
          { date: '2026-10-06', balanceCents: 97_000 },
          { date: '2026-10-07', balanceCents: 96_700 },
        ])
        expect(history.gaps).toEqual([])
        expect(history.dataUntil).toBe('2026-10-05')
        // The import `bankRows` gives the fixture's bank rows.
        expect(history.lastImportOn).toBe('2026-01-01')

        // The last point is the account's balance.
        const current = await accounts.findOne(account.id)
        expect(current.balanceCents).toBe(96_700)
      })
    })

    it('reports the statement balances, the gaps and the last import of the window', async () => {
      await inRollback(async ({ tx, accounts, activity }) => {
        const account = await accounts.create({
          name: 'Test savings',
          type: 'savings',
        })
        await tx.insert(transactionsTable).values(
          await bankRows(tx, [
            // Older than the 12 months: only gives the opening balance.
            transaction(account.id, {
              bookingDate: '2025-03-15',
              amountCents: 10_000,
              balanceAfterCents: 10_000,
              kind: 'transfer',
            }),
            transaction(account.id, {
              bookingDate: '2026-03-10',
              amountCents: 5_000,
              balanceAfterCents: 15_000,
              kind: 'transfer',
            }),
            // 1 000 missing between the two.
            transaction(account.id, {
              bookingDate: '2026-04-10',
              amountCents: 5_000,
              balanceAfterCents: 21_000,
              kind: 'transfer',
            }),
          ]),
        )
        await tx.insert(balanceSnapshotsTable).values({
          accountId: account.id,
          date: '2026-04-30',
          valueCents: 21_000,
        })
        await tx.insert(importsTable).values({
          accountId: account.id,
          source: 'cic_csv',
          fileName: 'test.csv',
          fileHash: 'activity-test-import',
          periodStart: '2026-04-01',
          periodEnd: '2026-04-30',
          committedAt: new Date('2026-05-02T08:00:00Z'),
        })

        const history = await activity.balanceHistory(account.id, NOW)
        expect(history.from).toBe('2025-05-01')
        expect(history.to).toBe('2026-04-30')
        expect(history.points[0]).toEqual({
          date: '2025-05-01',
          balanceCents: 10_000,
        })
        expect(history.points.at(-1)).toEqual({
          date: '2026-04-30',
          balanceCents: 21_000,
        })
        expect(history.statements).toEqual([
          { date: '2026-04-30', valueCents: 21_000 },
        ])
        expect(history.gaps).toEqual([
          {
            fromDate: '2026-03-10',
            toDate: '2026-04-10',
            differenceCents: 1_000,
          },
        ])
        expect(history.dataUntil).toBe('2026-04-30')
        expect(history.lastImportOn).toBe('2026-05-02')
      })
    })

    it('has no history for an account without data', async () => {
      await inRollback(async ({ accounts, activity }) => {
        const account = await accounts.create({
          name: 'Empty',
          type: 'checking',
        })
        expect(await activity.balanceHistory(account.id, NOW)).toEqual({
          from: null,
          to: null,
          points: [],
          statements: [],
          gaps: [],
          dataUntil: null,
          lastImportOn: null,
        })
      })
    })

    it('sums the month’s money in and out, transfers apart', async () => {
      await inRollback(async ({ tx, accounts, activity }) => {
        const account = await accounts.create({
          name: 'Test checking',
          type: 'checking',
        })
        await tx.insert(transactionsTable).values(
          await bankRows(tx, [
            transaction(account.id, {
              bookingDate: '2026-10-31',
              amountCents: -99_999,
            }),
            transaction(account.id, {
              bookingDate: '2026-11-02',
              amountCents: 200_000,
              kind: 'income',
            }),
            transaction(account.id, {
              bookingDate: '2026-11-03',
              amountCents: -50_000,
              kind: 'transfer',
            }),
            transaction(account.id, {
              bookingDate: '2026-11-04',
              amountCents: -4_000,
              originalAmountCents: -3_000,
            }),
            transaction(account.id, {
              bookingDate: '2026-11-05',
              amountCents: -1_000,
              manual: true,
            }),
          ]),
        )

        const flows = await activity.monthFlows(account.id, undefined, NOW)
        expect(flows.period).toMatchObject({
          month: '2026-11',
          status: 'partial',
          dataUntil: '2026-11-04',
          throughDay: 4,
        })
        expect(flows).toMatchObject({
          inCents: 200_000,
          outCents: -54_000,
          netCents: 146_000,
          transfersInCents: 0,
          transfersOutCents: -50_000,
          count: 4,
        })

        const october = await activity.monthFlows(account.id, '2026-10', NOW)
        expect(october).toMatchObject({
          inCents: 0,
          outCents: -99_999,
          count: 1,
        })
      })
    })

    it('refuses investment accounts and unknown ids', async () => {
      await inRollback(async ({ accounts, activity }) => {
        const pea = await accounts.create({ name: 'PEA', type: 'brokerage' })
        await expect(activity.balanceHistory(pea.id, NOW)).rejects.toThrow(
          BadRequestException,
        )
        await expect(
          activity.monthFlows(pea.id, undefined, NOW),
        ).rejects.toThrow(BadRequestException)
        await expect(
          activity.balanceHistory('00000000-0000-4000-8000-000000000000'),
        ).rejects.toThrow(NotFoundException)
      })
    })
  },
)
