import '#/load-env'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '#/database/schema'
import {
  accountsTable,
  importsTable,
  type InsertTransaction,
  transactionsTable,
} from '#/database/schema'
import { dataUntil, dataUntilByAccount, resolvePeriod } from './coverage'

/**
 * Integration checks against the migrated test database, inside a rolled
 * back transaction. Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

/** 5 November 2026, mid-morning in Paris. */
const NOW = new Date('2026-11-05T10:00:00Z')

describe.skipIf(!process.env.DATABASE_URL)('data coverage (database)', () => {
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
    fn: (f: { tx: Tx; checking: string; savings: string }) => Promise<void>,
  ) {
    await db
      .transaction(async (tx) => {
        const [checking, savings] = await tx
          .insert(accountsTable)
          .values([
            { name: 'Test checking', type: 'checking' },
            { name: 'Test savings', type: 'savings' },
          ])
          .returning()
        await fn({ tx, checking: checking.id, savings: savings.id })
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
  }

  let hash = 0
  function row(accountId: string, bookingDate: string): InsertTransaction {
    hash++
    return {
      accountId,
      bookingDate,
      amountCents: -1_000,
      rawLabel: 'PAIEMENT CB FAKESHOP',
      kind: 'expense',
      dedupeHash: `coverage-test-${hash}`,
    }
  }

  it('has no date without data', async () => {
    await inRollback(async ({ tx }) => {
      expect(await dataUntil(tx, { now: NOW })).toBeNull()
      expect(await dataUntilByAccount(tx, NOW)).toEqual(new Map())
    })
  })

  it('takes the latest booking or committed statement end, never after today', async () => {
    await inRollback(async ({ tx, checking, savings }) => {
      await tx.insert(transactionsTable).values([
        row(checking, '2026-10-20'),
        row(savings, '2026-10-02'),
        // Deferred card debit booked ahead of today.
        row(savings, '2026-11-30'),
      ])
      await tx.insert(importsTable).values([
        // A statement ending on days without any row.
        {
          accountId: checking,
          source: 'cic_csv',
          fileName: 'test.csv',
          fileHash: 'a'.repeat(64),
          periodEnd: '2026-10-31',
          committedAt: new Date('2026-11-01T09:00:00Z'),
        },
        // Still pending: does not count.
        {
          accountId: checking,
          source: 'cic_csv',
          fileName: 'test-2.csv',
          fileHash: 'b'.repeat(64),
          periodEnd: '2026-11-04',
        },
      ])

      expect(await dataUntil(tx, { accountId: checking, now: NOW })).toBe(
        '2026-10-31',
      )
      expect(await dataUntil(tx, { accountId: savings, now: NOW })).toBe(
        '2026-11-05',
      )
      expect(await dataUntil(tx, { now: NOW })).toBe('2026-11-05')
      expect(await dataUntilByAccount(tx, NOW)).toEqual(
        new Map([
          [checking, '2026-10-31'],
          [savings, '2026-11-05'],
        ]),
      )
    })
  })

  it('resolves the default month from the data', async () => {
    await inRollback(async ({ tx, checking }) => {
      await tx.insert(transactionsTable).values([row(checking, '2026-10-20')])
      expect(await resolvePeriod(tx, undefined, { now: NOW })).toMatchObject({
        month: '2026-10',
        status: 'partial',
        throughDay: 20,
      })
      expect(await resolvePeriod(tx, '2026-09', { now: NOW })).toMatchObject({
        month: '2026-09',
        status: 'complete',
        defaultMonth: '2026-10',
      })
    })
  })
})
