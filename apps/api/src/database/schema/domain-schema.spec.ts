import '#/load-env'
import { eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from './index'
import {
  accountsTable,
  importsTable,
  type InsertTransaction,
  transactionsTable,
} from './index'
import { bankRows } from '#/transactions/testing/bank-rows'

/**
 * Integration checks against the migrated database (CI applies migrations
 * before tests; locally run `docker compose up -d` and `pnpm db:migrate`).
 * Every test runs in a transaction that is rolled back, so the database is
 * left untouched. Skipped when no DATABASE_URL is configured.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

describe.skipIf(!process.env.DATABASE_URL)('domain schema (database)', () => {
  let client: postgres.Sql
  let db: Db

  beforeAll(() => {
    client = postgres(process.env.DATABASE_URL!, { max: 1 })
    db = drizzle(client, { schema })
  })

  afterAll(async () => {
    await client.end()
  })

  async function inRollback(fn: (tx: Tx) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        await fn(tx)
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
  }

  async function createAccount(tx: Tx, name = 'Test checking') {
    const [account] = await tx
      .insert(accountsTable)
      .values({ name, type: 'checking' })
      .returning()
    return account
  }

  function transaction(
    accountId: string,
    overrides: Partial<InsertTransaction> = {},
  ) {
    return {
      accountId,
      bookingDate: '2026-01-15',
      amountCents: -1234,
      balanceAfterCents: 98_766,
      rawLabel: 'PAIEMENT CB 1501 TESTVILLE SHOP',
      kind: 'expense',
      dedupeHash: 'hash-1',
      ...overrides,
    } satisfies InsertTransaction
  }

  it('round-trips cents as numbers and dates as calendar strings', async () => {
    await inRollback(async (tx) => {
      const account = await createAccount(tx)
      const [row] = await tx
        .insert(transactionsTable)
        .values(
          await bankRows(
            tx,
            transaction(account.id, { amountCents: -9_007_199_254_740 }),
          ),
        )
        .returning()

      expect(row.amountCents).toBe(-9_007_199_254_740)
      expect(row.bookingDate).toBe('2026-01-15')
      expect(row.needsReview).toBe(false)
      expect(row.isOneOff).toBe(false)
    })
  })

  it('rejects the same dedupe hash twice for one account', async () => {
    await inRollback(async (tx) => {
      const account = await createAccount(tx)
      await tx
        .insert(transactionsTable)
        .values(await bankRows(tx, transaction(account.id)))

      await expect(
        tx.transaction(async (nested) =>
          nested
            .insert(transactionsTable)
            .values(await bankRows(tx, transaction(account.id))),
        ),
      ).rejects.toMatchObject({ cause: { code: '23505' } })
    })
  })

  it('allows the same dedupe hash on different accounts', async () => {
    await inRollback(async (tx) => {
      const first = await createAccount(tx, 'First')
      const second = await createAccount(tx, 'Second')

      await tx
        .insert(transactionsTable)
        .values(
          await bankRows(tx, [transaction(first.id), transaction(second.id)]),
        )

      const rows = await tx.select().from(transactionsTable)
      expect(rows.filter((r) => r.dedupeHash === 'hash-1')).toHaveLength(2)
    })
  })

  it('deletes the transactions of a deleted import', async () => {
    await inRollback(async (tx) => {
      const account = await createAccount(tx)
      const [imported] = await tx
        .insert(importsTable)
        .values({
          accountId: account.id,
          source: 'cic_csv',
          fileName: 'test.csv',
          fileHash: 'f'.repeat(64),
        })
        .returning()
      await tx
        .insert(transactionsTable)
        .values(
          await bankRows(
            tx,
            transaction(account.id, { importId: imported.id }),
          ),
        )

      await tx.delete(importsTable).where(eq(importsTable.id, imported.id))

      const rows = await tx
        .select()
        .from(transactionsTable)
        .where(eq(transactionsTable.accountId, account.id))
      expect(rows).toHaveLength(0)
    })
  })

  it('refuses to delete an account that still has transactions', async () => {
    await inRollback(async (tx) => {
      const account = await createAccount(tx)
      await tx
        .insert(transactionsTable)
        .values(await bankRows(tx, transaction(account.id)))

      await expect(
        tx.transaction((nested) =>
          nested.delete(accountsTable).where(eq(accountsTable.id, account.id)),
        ),
      ).rejects.toMatchObject({ cause: { code: '23503' } })
    })
  })
})
