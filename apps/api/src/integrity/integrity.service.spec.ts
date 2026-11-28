import { asSpecOwner, asTableOwner } from '#/database/testing/spec-owner'
import '#/load-env'
import { sql } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AccountsService } from '#/accounts/accounts.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  balanceSnapshotsTable,
  categoriesTable,
  contactsTable,
  cryptoHoldingsTable,
  cryptoMovementsTable,
  type InsertTransaction,
  receivablePaymentsTable,
  receivablesTable,
  transactionsTable,
} from '#/database/schema'
import { OwedService } from '#/owed/owed.service'
import { RecurringService } from '#/recurring/recurring.service'
import { bankRows } from '#/transactions/testing/bank-rows'
import { TransactionsService } from '#/transactions/transactions.service'
import { flowMismatch, IntegrityService } from './integrity.service'

/**
 * One synthetic inconsistency per check (#427), against the dedicated test
 * database (see `vitest.config.ts`). Every test runs in a transaction that is
 * rolled back. Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

/** 20 November 2026 in Paris: October is over. */
const NOW = new Date('2026-11-20T10:00:00Z')

describe('flowMismatch', () => {
  it('is null when income − expenses is what is saved', () => {
    expect(
      flowMismatch({
        incomeCents: 300_000,
        expenseCents: -120_000,
        savedCents: 180_000,
      }),
    ).toBeNull()
  })

  it('gives the difference when they disagree', () => {
    // Saved shown without a 50 € refund the categories count.
    expect(
      flowMismatch({
        incomeCents: 300_000,
        expenseCents: -115_000,
        savedCents: 180_000,
      }),
    ).toBe(5_000)
  })
})

describe.skipIf(!process.env.DATABASE_URL)(
  'IntegrityService (database)',
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
        service: IntegrityService
      }) => Promise<void>,
    ) {
      await db
        .transaction(async (tx) => {
          await asSpecOwner(tx)
          const database = { db: tx } as never
          const accounts = new AccountsService(database)
          const transactions = new TransactionsService(database)
          const service = new IntegrityService(
            database,
            accounts,
            transactions,
            new OwedService(
              database,
              transactions,
              new RecurringService(database),
            ),
          )
          await fn({ tx, accounts, service })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    let hash = 0
    function transaction(
      accountId: string | null,
      overrides: Partial<InsertTransaction> = {},
    ) {
      hash++
      return {
        accountId,
        bookingDate: '2026-10-01',
        amountCents: -1_000,
        rawLabel: 'PAIEMENT CB 0110 VILLE-TEST FAUX MAGASIN',
        kind: 'expense',
        dedupeHash: `integrity-test-${hash}`,
        ...overrides,
      } satisfies InsertTransaction
    }

    const run = (service: IntegrityService, month = '2026-10') =>
      service.check(month, { now: NOW })

    it('finds nothing on consistent data', async () => {
      await inRollback(async ({ tx, accounts, service }) => {
        const checking = await accounts.create({
          name: 'Test checking',
          type: 'checking',
        })
        await tx.insert(transactionsTable).values(
          await bankRows(tx, [
            transaction(checking.id, {
              bookingDate: '2026-09-30',
              amountCents: 0,
              kind: 'transfer',
              balanceAfterCents: 10_000,
            }),
            transaction(checking.id, {
              bookingDate: '2026-10-05',
              amountCents: -1_000,
              balanceAfterCents: 9_000,
            }),
          ]),
        )
        const result = await run(service)
        expect(result.findings).toEqual([])
        expect(result.checks.map((c) => [c.key, c.status])).toEqual([
          ['balances', 'ok'],
          ['crypto', 'ok'],
          ['owed', 'ok'],
          ['totals', 'ok'],
        ])
      })
    })

    it('balances: a missing bank row, a statement off, an entry never matched', async () => {
      await inRollback(async ({ tx, accounts, service }) => {
        const checking = await accounts.create({
          name: 'Test checking',
          type: 'checking',
        })
        await tx.insert(transactionsTable).values(
          await bankRows(tx, [
            transaction(checking.id, {
              bookingDate: '2026-09-30',
              amountCents: 0,
              kind: 'transfer',
              balanceAfterCents: 10_000,
            }),
            transaction(checking.id, {
              bookingDate: '2026-10-05',
              amountCents: -1_000,
              balanceAfterCents: 9_000,
            }),
            // A 5 € debit between the 5th and the 20th is missing.
            transaction(checking.id, {
              bookingDate: '2026-10-20',
              amountCents: -500,
              balanceAfterCents: 8_000,
            }),
            // Entered by hand on the 2nd, never matched by an import.
            transaction(checking.id, {
              bookingDate: '2026-10-02',
              amountCents: -300,
              manual: true,
            }),
            // Too close to the data's end to be sure yet.
            transaction(checking.id, {
              bookingDate: '2026-10-18',
              amountCents: -200,
              manual: true,
            }),
          ]),
        )
        await tx.insert(balanceSnapshotsTable).values({
          accountId: checking.id,
          date: '2026-10-31',
          valueCents: 7_000,
        })

        const result = await run(service)
        expect(result.checks[0]).toMatchObject({
          key: 'balances',
          status: 'findings',
          count: 3,
        })
        expect(
          result.findings.map((f) => [
            f.code,
            f.accountName,
            f.date,
            f.amountCents,
          ]),
        ).toEqual([
          ['manual_not_reconciled', 'Test checking', '2026-10-02', -300],
          ['balance_gap', 'Test checking', '2026-10-20', -500],
          ['statement_gap', 'Test checking', '2026-10-31', -1_000],
        ])
        expect(result.findings[1].fromDate).toBe('2026-10-05')
      })
    })

    it('crypto: a quantity held that the last complete read did not record', async () => {
      await inRollback(async ({ tx, service }) => {
        const observedAt = new Date('2026-11-10T08:00:00Z')
        const [account] = await tx
          .insert(accountsTable)
          .values({
            name: 'Test cold wallet',
            type: 'crypto',
            cryptoSource: 'manual',
            cryptoObservedAt: observedAt,
          })
          .returning()
        await tx.insert(cryptoHoldingsTable).values([
          {
            accountId: account.id,
            assetId: 'bitcoin',
            symbol: 'BTC',
            name: 'Bitcoin',
            quantity: '0.5',
          },
          {
            accountId: account.id,
            assetId: 'ethereum',
            symbol: 'ETH',
            name: 'Ethereum',
            quantity: '1.25',
          },
        ])
        const observed = (
          assetId: string,
          asset: string,
          quantity: string,
        ) => ({
          accountId: account.id,
          occurredAt: observedAt,
          operation: 'opening',
          kind: 'observed_in' as const,
          asset,
          assetId,
          quantity,
          dedupeHash: `observed:integrity-${assetId}`,
        })
        await tx
          .insert(cryptoMovementsTable)
          .values([
            observed('bitcoin', 'BTC', '0.4'),
            observed('ethereum', 'ETH', '1.25'),
          ])

        const result = await run(service)
        expect(result.findings).toEqual([
          expect.objectContaining({
            check: 'crypto',
            code: 'holding_differs_from_read',
            accountName: 'Test cold wallet',
            date: '2026-11-10',
            asset: 'BTC',
            quantity: '0.5',
            readQuantity: '0.4',
          }),
        ])
      })
    })

    it('owed: repaid past the share, and repayments past their transfer', async () => {
      await inRollback(async ({ tx, accounts, service }) => {
        const checking = await accounts.create({
          name: 'Test checking',
          type: 'checking',
        })
        const [contact] = await tx
          .insert(contactsTable)
          .values({ name: 'Test Camille' })
          .returning()
        const [dinner, groceries] = await tx
          .insert(transactionsTable)
          .values(
            await bankRows(tx, [
              transaction(checking.id, {
                bookingDate: '2026-09-10',
                amountCents: -4_000,
              }),
              transaction(checking.id, {
                bookingDate: '2026-09-12',
                amountCents: -3_000,
              }),
            ]),
          )
          .returning()
        const [repayment] = await tx
          .insert(transactionsTable)
          .values(
            await bankRows(tx, [
              transaction(checking.id, {
                bookingDate: '2026-09-20',
                amountCents: 2_500,
                kind: 'transfer',
                rawLabel: 'VIR TEST CAMILLE',
              }),
            ]),
          )
          .returning()
        const [owedDinner, owedGroceries] = await tx
          .insert(receivablesTable)
          .values([
            {
              direction: 'owed_to_me',
              transactionId: dinner.id,
              contactId: contact.id,
              amountCents: 2_000,
            },
            {
              direction: 'owed_to_me',
              transactionId: groceries.id,
              contactId: contact.id,
              amountCents: 1_500,
            },
          ])
          .returning()
        // 2 000 + 1 000 linked to a 25 € transfer, and 1 000 too many on
        // the dinner's 20 € share (written past the service's guards, and
        // past the database rule of #437, switched off in this rolled-back
        // transaction: the check is for data from before it).
        await asTableOwner(tx, async () => {
          await tx.execute(
            sql`alter table receivable_payments disable trigger receivable_payments_within_share`,
          )
          await tx.insert(receivablePaymentsTable).values([
            {
              receivableId: owedDinner.id,
              transactionId: repayment.id,
              amountCents: 2_000,
              paidOn: '2026-09-20',
            },
            {
              receivableId: owedGroceries.id,
              transactionId: repayment.id,
              amountCents: 1_000,
              paidOn: '2026-09-20',
            },
            {
              receivableId: owedDinner.id,
              amountCents: 1_000,
              paidOn: '2026-09-25',
            },
          ])
          await tx.execute(
            sql`alter table receivable_payments enable trigger receivable_payments_within_share`,
          )
        })

        const result = await run(service)
        const owed = result.findings.filter((f) => f.check === 'owed')
        expect(
          owed.map((f) => [f.code, f.accountName, f.date, f.amountCents]),
        ).toEqual([
          ['owed_negative', 'Test checking', '2026-09-10', -1_000],
          ['repayment_over_transfer', 'Test checking', '2026-09-20', 500],
        ])
        expect(owed[0].transactionId).toBe(dinner.id)
        expect(owed[1].transactionId).toBe(repayment.id)
      })
    })

    it('totals: a move between own accounts counted as an expense', async () => {
      await inRollback(async ({ tx, accounts, service }) => {
        const [category] = await tx
          .insert(categoriesTable)
          .values({
            slug: 'test_integrity_misc',
            name: 'Test divers',
            kind: 'expense',
          })
          .returning()
        const checking = await accounts.create({
          name: 'Test checking',
          type: 'checking',
        })
        const savings = await accounts.create({
          name: 'Test livret',
          type: 'savings',
        })
        const third = await accounts.create({
          name: 'Test LDDS',
          type: 'savings',
        })
        const [counted] = await tx
          .insert(transactionsTable)
          .values(
            await bankRows(tx, [
              // Filed as an expense on the checking account…
              transaction(checking.id, {
                bookingDate: '2026-10-03',
                amountCents: -20_000,
                categoryId: category.id,
                rawLabel: 'VIR TEST LIVRET',
              }),
            ]),
          )
          .returning()
        await tx.insert(transactionsTable).values(
          await bankRows(tx, [
            // …while the savings side, two days later, is a transfer.
            transaction(savings.id, {
              bookingDate: '2026-10-05',
              amountCents: 20_000,
              kind: 'transfer',
              rawLabel: 'VIR TEST DEPUIS COMPTE',
            }),
            // Unrelated rows of other amounts: no mirror.
            transaction(checking.id, {
              bookingDate: '2026-10-04',
              amountCents: -1_999,
              categoryId: category.id,
            }),
            transaction(savings.id, {
              bookingDate: '2026-10-04',
              amountCents: 1_234,
              kind: 'income',
              rawLabel: 'INTERETS TEST',
            }),
            // The same amount, but linked to a third account: not a mirror.
            transaction(savings.id, {
              bookingDate: '2026-10-04',
              amountCents: 1_999,
              kind: 'transfer',
              counterpartAccountId: third.id,
            }),
          ]),
        )

        const result = await run(service)
        const totals = result.findings.filter((f) => f.check === 'totals')
        expect(totals).toEqual([
          expect.objectContaining({
            code: 'internal_move_counted',
            accountName: 'Test checking',
            date: '2026-10-03',
            amountCents: -20_000,
            transactionId: counted.id,
          }),
        ])
      })
    })

    it('a check that fails is reported failed, the others still answer', async () => {
      await inRollback(async ({ service }) => {
        const failing = service as unknown as {
          crypto: () => Promise<never>
        }
        failing.crypto = () => Promise.reject(new Error('boom'))
        const result = await run(service)
        expect(result.checks.find((c) => c.key === 'crypto')).toMatchObject({
          status: 'failed',
          count: 0,
        })
        expect(result.checks.find((c) => c.key === 'owed')?.status).toBe('ok')
      })
    })
  },
)
