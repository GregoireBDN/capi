import '#/load-env'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '#/database/schema'
import {
  accountsTable,
  type InsertTransaction,
  transactionsTable,
} from '#/database/schema'
import { normalizeLabel } from '#/imports/normalize/label'
import { checkContinuity } from './continuity'
import { classifyRows, computeDedupeHashes, type DedupeInput } from './dedupe'
import { loadExistingForRange, loadPreviousBalance } from './dedupe.repository'
import { bankRows } from '#/transactions/testing/bank-rows'

/**
 * Integration checks against the migrated database (locally:
 * `docker compose up -d` and `pnpm db:migrate`). Every test runs in a
 * transaction that is rolled back. Skipped when no DATABASE_URL is configured.
 *
 * Synthetic data only: fake labels, amounts and balances.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

type FileRow = DedupeInput & { balanceAfterCents: number | null }

const COFFEE = 'PAIEMENT CB 0210 VILLE-EXEMPLE CAFE DE LA GARE CARTE 1234 ABCD'

/** Oldest-first export with two identical same-day card payments. */
const FIRST_FILE: FileRow[] = [
  {
    bookingDate: '2026-10-01',
    amountCents: 245_000,
    rawLabel: 'VIR SEPA SALAIRE SOCIETE FICTIVE OCT',
    balanceAfterCents: 264_199,
  },
  {
    bookingDate: '2026-10-02',
    amountCents: -390,
    rawLabel: COFFEE,
    balanceAfterCents: 263_809,
  },
  {
    bookingDate: '2026-10-02',
    amountCents: -390,
    rawLabel: COFFEE,
    balanceAfterCents: 263_419,
  },
]

/** Overlaps the first file on the 2nd of October and adds two days. */
const SECOND_FILE: FileRow[] = [
  ...FIRST_FILE.slice(1),
  {
    bookingDate: '2026-10-03',
    amountCents: -1_200,
    rawLabel: 'PRLV SEPA ACME ASSURANCE 1234567890',
    balanceAfterCents: 262_219,
  },
  {
    bookingDate: '2026-10-04',
    amountCents: -390,
    rawLabel: COFFEE.replace('0210', '0410'),
    balanceAfterCents: 261_829,
  },
]

describe.skipIf(!process.env.DATABASE_URL)(
  'dedupe repository (database)',
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

    function toInsert(
      accountId: string,
      rows: FileRow[],
      hashes = computeDedupeHashes(rows),
    ): InsertTransaction[] {
      return rows.map((r, k) => ({
        accountId,
        ...r,
        kind: r.amountCents < 0 ? 'expense' : 'income',
        dedupeHash: hashes[k],
      }))
    }

    async function insertFile(tx: Tx, accountId: string, rows: FileRow[]) {
      return tx
        .insert(transactionsTable)
        .values(await bankRows(tx, toInsert(accountId, rows)))
        .returning({ id: transactionsTable.id })
    }

    describe('loadExistingForRange', () => {
      it('returns the transactions of the account in the range, with merchant keys', async () => {
        await inRollback(async (tx) => {
          const account = await createAccount(tx)
          const other = await createAccount(tx, 'Other checking')
          await insertFile(tx, account.id, SECOND_FILE)
          await insertFile(tx, other.id, SECOND_FILE)

          const existing = await loadExistingForRange(
            tx,
            account.id,
            '2026-10-02',
            '2026-10-03',
          )

          expect(existing.map((e) => e.bookingDate)).toEqual([
            '2026-10-02',
            '2026-10-02',
            '2026-10-03',
          ])
          expect(existing[0]).toMatchObject({
            amountCents: -390,
            rawLabel: COFFEE,
            balanceAfterCents: expect.any(Number) as number,
            merchantKey: normalizeLabel(COFFEE, -390).merchantKey,
            dedupeHash: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
          })
          expect(existing[2].merchantKey).toBe('ACME ASSURANCE')
        })
      })

      it('pads the range by the date tolerance', async () => {
        await inRollback(async (tx) => {
          const account = await createAccount(tx)
          await insertFile(tx, account.id, SECOND_FILE)

          const padded = await loadExistingForRange(
            tx,
            account.id,
            '2026-10-03',
            '2026-10-03',
            { dateToleranceDays: 1 },
          )
          expect(padded.map((e) => e.bookingDate)).toEqual([
            '2026-10-02',
            '2026-10-02',
            '2026-10-03',
            '2026-10-04',
          ])
        })
      })

      it('rejects an inverted range', async () => {
        await expect(
          loadExistingForRange(
            db,
            '00000000-0000-0000-0000-000000000000',
            '2026-10-03',
            '2026-10-02',
          ),
        ).rejects.toThrow(RangeError)
      })
    })

    describe('loadPreviousBalance', () => {
      it('returns null for an account without balances', async () => {
        await inRollback(async (tx) => {
          const account = await createAccount(tx)
          await insertFile(
            tx,
            account.id,
            FIRST_FILE.map((r) => ({ ...r, balanceAfterCents: null })),
          )
          expect(
            await loadPreviousBalance(tx, account.id, '2026-10-05'),
          ).toBeNull()
        })
      })

      it('returns the end-of-day balance of the last day strictly before', async () => {
        await inRollback(async (tx) => {
          const account = await createAccount(tx)
          await insertFile(tx, account.id, FIRST_FILE)
          // A history row without balance after it must be ignored.
          await insertFile(tx, account.id, [
            {
              bookingDate: '2026-10-03',
              amountCents: -500,
              rawLabel: 'CARTE X1234 03/10 KIOSQUE IMAGINAIRE',
              balanceAfterCents: null,
            },
          ])

          expect(await loadPreviousBalance(tx, account.id, '2026-10-04')).toBe(
            263_419,
          )
          expect(await loadPreviousBalance(tx, account.id, '2026-10-02')).toBe(
            264_199,
          )
          expect(
            await loadPreviousBalance(tx, account.id, '2026-10-01'),
          ).toBeNull()
        })
      })
    })

    it('re-importing an overlapping file hits the unique constraint only for duplicates', async () => {
      await inRollback(async (tx) => {
        const account = await createAccount(tx)
        await insertFile(tx, account.id, FIRST_FILE)

        const hashes = computeDedupeHashes(SECOND_FILE)
        const existing = await loadExistingForRange(
          tx,
          account.id,
          SECOND_FILE[0].bookingDate,
          SECOND_FILE[SECOND_FILE.length - 1].bookingDate,
        )
        const statuses = classifyRows(
          SECOND_FILE.map((r) => ({
            ...r,
            merchantKey: normalizeLabel(r.rawLabel, r.amountCents).merchantKey,
          })),
          hashes,
          existing,
        )
        expect(statuses.map((s) => s.status)).toEqual([
          'duplicate',
          'duplicate',
          'new',
          'new',
        ])

        const previous = await loadPreviousBalance(
          tx,
          account.id,
          SECOND_FILE[0].bookingDate,
        )
        expect(
          checkContinuity(
            SECOND_FILE.map((r, k) => ({
              ...r,
              lineNumber: k + 2,
              valueDate: null,
            })),
            previous,
          ),
        ).toMatchObject({ checked: true, ok: true, order: 'ascending' })

        // Insert every row on its own savepoint: only duplicates must collide.
        const rejected: boolean[] = []
        for (const value of toInsert(account.id, SECOND_FILE, hashes)) {
          const outcome = await tx
            .transaction(async (nested) =>
              nested
                .insert(transactionsTable)
                .values(await bankRows(tx, value)),
            )
            .then(
              () => false,
              (error: unknown) => {
                expect(error).toMatchObject({ cause: { code: '23505' } })
                return true
              },
            )
          rejected.push(outcome)
        }
        expect(rejected).toEqual(statuses.map((s) => s.status === 'duplicate'))

        const all = await loadExistingForRange(
          tx,
          account.id,
          '2026-10-01',
          '2026-10-04',
        )
        expect(all).toHaveLength(5)
        expect(all.filter((e) => e.rawLabel === COFFEE)).toHaveLength(2)
      })
    })
  },
)
