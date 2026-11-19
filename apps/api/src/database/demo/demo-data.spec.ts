import '#/load-env'
import * as bcrypt from 'bcryptjs'
import { and, asc, eq, sql } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '#/database/schema'
import {
  accountsTable,
  importsTable,
  recurringItemsTable,
  transactionSplitsTable,
  transactionsTable,
  usersTable,
} from '#/database/schema'
import {
  CHECKING_OPENING_CENTS,
  DATA_LAG_DAYS,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  type DemoResult,
  generateDemoData,
} from './demo-data'

/**
 * Smoke run of the demo seed against the migrated test database, inside a
 * transaction that is rolled back. Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')
const TODAY = '2026-11-16'

describe.skipIf(!process.env.DATABASE_URL)(
  'generateDemoData (database)',
  () => {
    let client: postgres.Sql
    let db: Db

    beforeAll(() => {
      client = postgres(process.env.DATABASE_URL!, {
        max: 1,
        onnotice: () => {},
      })
      db = drizzle(client, { schema })
    })

    afterAll(async () => {
      await client.end()
    })

    async function seeded<T>(
      fn: (tx: Tx, result: DemoResult) => Promise<T>,
    ): Promise<T> {
      let value: T | undefined
      await db
        .transaction(async (tx) => {
          const result = await generateDemoData(tx, {
            today: TODAY,
            bcryptRounds: 4,
          })
          value = await fn(tx, result)
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
      return value as T
    }

    it('creates a verified account, consistent bank data and the extras', async () => {
      await seeded(async (tx, result) => {
        expect(result.dataUntil).toBe('2026-11-06')
        expect(DATA_LAG_DAYS).toBe(10)

        const [user] = await tx
          .select()
          .from(usersTable)
          .where(eq(usersTable.email, DEMO_EMAIL))
        expect(user.emailVerifiedAt).not.toBeNull()
        expect(await bcrypt.compare(DEMO_PASSWORD, user.passwordHash!)).toBe(
          true,
        )

        const counts = result.counts
        expect(counts.accounts).toBe(8)
        expect(counts.transactions).toBeGreaterThan(400)
        expect(counts.reviewQueue).toBeGreaterThan(0)
        expect(counts.splits).toBe(1)
        // Every checking ↔ Livret A transfer has its two sides linked.
        expect(counts.linkedTransferPairs).toBeGreaterThan(10)
        expect(counts.recurringItems).toBeGreaterThan(5)

        const accounts = await tx.select().from(accountsTable)
        const checking = accounts.find((a) => a.type === 'checking')!
        expect(accounts.find((a) => a.type === 'crypto')?.cryptoSource).toBe(
          'manual',
        )

        // Running balances chain day to day (continuity check): the last row
        // of each day ends on the opening balance plus everything booked so
        // far, and no imported row is after the data end.
        const rows = await tx
          .select()
          .from(transactionsTable)
          .where(
            and(
              eq(transactionsTable.accountId, checking.id),
              eq(transactionsTable.manual, false),
            ),
          )
          .orderBy(asc(transactionsTable.bookingDate))
        expect(rows.at(-1)!.bookingDate <= result.dataUntil).toBe(true)
        const byDay = new Map<string, (typeof rows)[number][]>()
        for (const row of rows) {
          byDay.set(row.bookingDate, [
            ...(byDay.get(row.bookingDate) ?? []),
            row,
          ])
        }
        let balance = CHECKING_OPENING_CENTS
        for (const dayRows of byDay.values()) {
          balance += dayRows.reduce((s, r) => s + r.amountCents, 0)
          expect(dayRows.some((r) => r.balanceAfterCents === balance)).toBe(
            true,
          )
        }
        expect(new Set(rows.map((r) => r.dedupeHash)).size).toBe(rows.length)

        // Every imported row belongs to a committed cic_csv import.
        const [{ orphans }] = await tx
          .select({ orphans: sql<number>`count(*)::int` })
          .from(transactionsTable)
          .leftJoin(
            importsTable,
            eq(importsTable.id, transactionsTable.importId),
          )
          .where(
            and(
              eq(transactionsTable.manual, false),
              sql`(${importsTable.committedAt} is null or ${importsTable.source} <> 'cic_csv')`,
            ),
          )
        expect(orphans).toBe(0)

        // Moves between own accounts are transfers, never income or expense.
        const moves = await tx
          .select({ kind: transactionsTable.kind })
          .from(transactionsTable)
          .where(
            sql`${transactionsTable.rawLabel} like 'VIR SEPA %LIVRET A' or ${transactionsTable.rawLabel} like 'VIR SEPA %COMPTE COURANT' or ${transactionsTable.rawLabel} = 'VIR SEPA VERS PEA'`,
          )
        expect(moves.length).toBeGreaterThan(20)
        expect(new Set(moves.map((m) => m.kind))).toEqual(new Set(['transfer']))
        // Each one is linked to the owner's other account (#296).
        const unlinked = await tx
          .select({ id: transactionsTable.id })
          .from(transactionsTable)
          .where(
            sql`(${transactionsTable.rawLabel} like 'VIR SEPA %LIVRET A' or ${transactionsTable.rawLabel} like 'VIR SEPA %COMPTE COURANT' or ${transactionsTable.rawLabel} = 'VIR SEPA VERS PEA') and ${transactionsTable.counterpartAccountId} is null`,
          )
        expect(unlinked).toEqual([])

        // The split sums exactly to its transaction.
        const parts = await tx
          .select({
            part: transactionSplitsTable.amountCents,
            total: transactionsTable.amountCents,
          })
          .from(transactionSplitsTable)
          .innerJoin(
            transactionsTable,
            eq(transactionsTable.id, transactionSplitsTable.transactionId),
          )
        expect(parts.reduce((s, p) => s + p.part, 0)).toBe(parts[0].total)

        const recurring = await tx.select().from(recurringItemsTable)
        expect(recurring.find((r) => r.merchantKey === 'NETFLIX')?.status).toBe(
          'confirmed',
        )
        // One cancellation over, one ending next month.
        const ended = recurring
          .filter((r) => r.endedOn !== null)
          .map((r) => ({ key: r.merchantKey, status: r.status }))
          .sort((a, b) => a.key.localeCompare(b.key))
        expect(ended).toHaveLength(2)
        expect(ended.every((r) => r.status === 'confirmed')).toBe(true)
        expect(ended.map((r) => r.key).join(' ')).toMatch(/SPOTIFY.*VIDEOPASS/)

        // The meal-voucher card (#298): entered by hand, credits are income
        // (a confirmed monthly credit), payments expenses, never below zero.
        const voucher = accounts.find((a) => a.type === 'meal_voucher')!
        const voucherRows = await tx
          .select()
          .from(transactionsTable)
          .where(eq(transactionsTable.accountId, voucher.id))
          .orderBy(asc(transactionsTable.bookingDate))
        expect(voucherRows.length).toBeGreaterThan(100)
        expect(voucherRows.every((r) => r.manual)).toBe(true)
        expect(
          voucherRows.every((r) =>
            r.amountCents > 0 ? r.kind === 'income' : r.kind === 'expense',
          ),
        ).toBe(true)
        let voucherBalance = 0
        for (const row of voucherRows) {
          voucherBalance += row.amountCents
          if (row.amountCents < 0)
            expect(voucherBalance).toBeGreaterThanOrEqual(0)
        }
        expect(voucherRows.at(-1)!.bookingDate < TODAY).toBe(true)
        // Never more than 25 € of payments a day.
        const paidByDay = new Map<string, number>()
        for (const row of voucherRows.filter((r) => r.amountCents < 0)) {
          paidByDay.set(
            row.bookingDate,
            (paidByDay.get(row.bookingDate) ?? 0) - row.amountCents,
          )
        }
        expect(Math.max(...paidByDay.values())).toBeLessThanOrEqual(2_500)
        const credit = recurring.find(
          (r) => r.accountId === voucher.id && r.direction === 'credit',
        )
        expect(credit?.status).toBe('confirmed')
        expect(credit?.cadence).toBe('monthly')
      })
    })

    it('is deterministic for a given day', async () => {
      const digest = (tx: Tx) =>
        tx
          .select({
            date: transactionsTable.bookingDate,
            amount: transactionsTable.amountCents,
            label: transactionsTable.rawLabel,
            kind: transactionsTable.kind,
            hash: transactionsTable.dedupeHash,
          })
          .from(transactionsTable)
          .innerJoin(
            accountsTable,
            eq(accountsTable.id, transactionsTable.accountId),
          )
          .where(eq(accountsTable.name, 'Compte courant'))
          .orderBy(asc(transactionsTable.dedupeHash))
      const first = await seeded((tx) => digest(tx))
      const second = await seeded((tx) => digest(tx))
      expect(first.length).toBeGreaterThan(0)
      expect(second).toEqual(first)
    })
  },
)
