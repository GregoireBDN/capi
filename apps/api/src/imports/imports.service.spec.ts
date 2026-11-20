import '#/load-env'
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common'
import { asc, eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { CategorizationRulesService } from '#/categories/categorization-rules.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  categorizationRulesTable,
  importsTable,
  transactionsTable,
} from '#/database/schema'
import {
  type CicRow,
  cicCsv,
  cp1252,
  withBalances,
} from '#/imports/testing/cic-csv-fixture'
import type { ImportDetailDto } from './dto/import.dto'
import { ImportsService, PENDING_PREVIEW_TTL_MS } from './imports.service'
import { bankRows } from '#/transactions/testing/bank-rows'

/**
 * Integration checks of the import pipeline against the migrated database
 * (locally: `docker compose up -d` and `pnpm db:migrate`). Every test runs in
 * a transaction that is rolled back, so the local database is left untouched.
 * Skipped when no DATABASE_URL is configured.
 *
 * Synthetic data only: fake labels, amounts and balances.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

const SALARY = 'VIR SEPA SALAIRE SOCIETE FICTIVE OCT'
const COFFEE = 'PAIEMENT CB 0210 VILLE-EXEMPLE CAFE DE LA GARE CARTE 1234 ABCD'
const GROCERIES = 'PAIEMENT CB 0310 VILLE-EXEMPLE FAUXMARCHE CARTE 1234 ABCD'
const INSURANCE = 'PRLV SEPA ACME ASSURANCE 1234567890'
const BAKERY = 'PAIEMENT CB 0510 VILLE-EXEMPLE BOULANGERIE TEST CARTE 1234 ABCD'

const OPENING = 100_000

/** Oct 1–5, balances chained from OPENING, with two identical coffees on the 2nd. */
const HISTORY: CicRow[] = withBalances(OPENING, [
  { date: '2026-10-01', amountCents: 245_000, label: SALARY },
  { date: '2026-10-02', amountCents: -390, label: COFFEE },
  { date: '2026-10-02', amountCents: -390, label: COFFEE },
  { date: '2026-10-03', amountCents: -4_250, label: GROCERIES },
  { date: '2026-10-04', amountCents: -1_200, label: INSURANCE },
  { date: '2026-10-05', amountCents: -180, label: BAKERY },
])

/** Oct 1–3. */
const FILE_A = cicCsv(HISTORY.slice(0, 4))
/** Oct 3–5: overlaps FILE_A on the 3rd. */
const FILE_B = cicCsv(HISTORY.slice(3))

interface Fixture {
  tx: Tx
  service: ImportsService
  accountId: string
  groceries: string
  salary: string
  groceriesRule: string
  /** Stand-in for the recurring detection run after a commit or an undo. */
  detectInBackground: ReturnType<typeof vi.fn>
  preview: (file: Buffer, accountId?: string) => Promise<ImportDetailDto>
}

describe.skipIf(!process.env.DATABASE_URL)('ImportsService (database)', () => {
  let client: postgres.Sql
  let db: Db

  beforeAll(() => {
    client = postgres(process.env.DATABASE_URL!, { max: 1 })
    db = drizzle(client, { schema })
  })

  afterAll(async () => {
    await client.end()
  })

  async function withFixture(fn: (f: Fixture) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        // Deterministic categorization: only the rules created below.
        await tx.delete(categorizationRulesTable)
        const [account] = await tx
          .insert(accountsTable)
          .values({ name: 'Test checking', type: 'checking' })
          .returning()
        const [groceries, salary] = await tx
          .insert(categoriesTable)
          .values([
            {
              slug: 'import_test_groceries',
              name: 'Import test groceries',
              kind: 'expense',
            },
            {
              slug: 'import_test_salary',
              name: 'Import test salary',
              kind: 'income',
            },
          ])
          .returning()
        const [groceriesRule] = await tx
          .insert(categorizationRulesTable)
          .values([
            {
              position: 0,
              labelPattern: 'fauxmarche',
              categoryId: groceries.id,
            },
            { position: 1, labelPattern: 'salaire', categoryId: salary.id },
          ])
          .returning()

        // The services only read `db`; their transactions become savepoints.
        const database = { db: tx } as never
        const detectInBackground = vi.fn()
        const service = new ImportsService(
          database,
          new CategorizationRulesService(database),
          { detectInBackground } as never,
        )
        await fn({
          tx,
          service,
          accountId: account.id,
          groceries: groceries.id,
          salary: salary.id,
          groceriesRule: groceriesRule.id,
          detectInBackground,
          preview: (file, accountId = account.id) =>
            service.preview({
              accountId,
              fileName: 'export.csv',
              buffer: file,
            }),
        })
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
  }

  async function storedTransactions(tx: Tx, accountId: string) {
    return tx
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.accountId, accountId))
      .orderBy(
        asc(transactionsTable.bookingDate),
        asc(transactionsTable.dedupeHash),
      )
  }

  function statuses(detail: ImportDetailDto) {
    return detail.preview!.rows.map((row) => row.status)
  }

  describe('preview', () => {
    it('classifies, categorizes and checks a file without writing transactions', async () => {
      await withFixture(async ({ tx, preview, accountId }) => {
        const result = await preview(
          cicCsv(HISTORY.slice(0, 4), ['32/10/2026;;-1,00;;FAUX;1,00']),
        )

        expect(result).toMatchObject({
          status: 'pending',
          source: 'cic_csv',
          fileName: 'export.csv',
          accountName: 'Test checking',
          periodStart: '2026-10-01',
          periodEnd: '2026-10-03',
          committedAt: null,
          alreadyImported: null,
          counts: {
            rows: 4,
            new: 4,
            duplicates: 0,
            conflicts: 0,
            issues: 1,
            inserted: 0,
            skipped: 0,
          },
        })
        expect(result.preview!.issues).toEqual([
          { lineNumber: 6, message: expect.stringContaining('date') },
        ])
        expect(result.preview!.rows[0]).toMatchObject({
          index: 0,
          lineNumber: 2,
          bookingDate: '2026-10-01',
          amountCents: 245_000,
          rawLabel: SALARY,
          status: 'new',
          existing: null,
        })
        expect(result.preview!.rows[0]).not.toHaveProperty('dedupeHash')
        // No stored balance before the file: only the file itself is checked.
        expect(result.preview!.continuity).toMatchObject({
          checked: true,
          ok: true,
          gaps: [],
        })

        expect(await storedTransactions(tx, accountId)).toHaveLength(0)
        const [record] = await tx
          .select()
          .from(importsTable)
          .where(eq(importsTable.id, result.id))
        expect(record.committedAt).toBeNull()
        expect(record.fileHash).toMatch(/^[0-9a-f]{64}$/)
        expect(record.preview?.rows).toHaveLength(4)
      })
    })

    it('applies the rules and flags unmatched rows for review', async () => {
      await withFixture(
        async ({ preview, groceries, salary, groceriesRule }) => {
          const rows = (await preview(FILE_A)).preview!.rows

          expect(rows[0]).toMatchObject({
            categoryId: salary,
            kind: 'income',
            needsReview: false,
          })
          expect(rows[1]).toMatchObject({
            categoryId: null,
            ruleId: null,
            kind: 'expense',
            needsReview: true,
          })
          expect(rows[3]).toMatchObject({
            categoryId: groceries,
            ruleId: groceriesRule,
            kind: 'expense',
            needsReview: false,
          })
        },
      )
    })

    it('rejects a file that is not a CIC export with a clear message', async () => {
      await withFixture(async ({ preview }) => {
        const error = await preview(
          cp1252('Date,Amount,Description\r\n2026-10-01,-1.00,Test\r\n'),
        ).catch((e: unknown) => e)
        expect(error).toBeInstanceOf(BadRequestException)
        expect((error as BadRequestException).message).toMatch(
          /^Not a CIC CSV export: missing column/,
        )
        await expect(preview(Buffer.alloc(0))).rejects.toThrow(
          'Not a CIC CSV export: the file is empty',
        )
      })
    })

    it('only imports into existing, active checking or savings accounts', async () => {
      await withFixture(async ({ tx, preview }) => {
        const [pea, archived, card] = await tx
          .insert(accountsTable)
          .values([
            { name: 'Test PEA', type: 'brokerage' },
            { name: 'Closed', type: 'savings', archivedAt: new Date() },
            { name: 'Titres-restaurant', type: 'meal_voucher' },
          ])
          .returning()

        await expect(preview(FILE_A, pea.id)).rejects.toThrow(
          'checking or savings',
        )
        // The meal-voucher card is entered by hand (#298).
        await expect(preview(FILE_A, card.id)).rejects.toThrow(
          'checking or savings',
        )
        await expect(preview(FILE_A, archived.id)).rejects.toThrow('archived')
        await expect(
          preview(FILE_A, '00000000-0000-4000-8000-000000000000'),
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(
          await tx
            .select()
            .from(importsTable)
            .where(eq(importsTable.accountId, pea.id)),
        ).toHaveLength(0)
      })
    })

    it('runs the recurring detection after a commit and an undo', async () => {
      await withFixture(async ({ service, preview, detectInBackground }) => {
        const discarded = await preview(FILE_A)
        await service.remove(discarded.id)
        expect(detectInBackground).not.toHaveBeenCalled()

        const committed = await service.commit((await preview(FILE_A)).id, {})
        expect(detectInBackground).toHaveBeenCalledTimes(1)
        await service.remove(committed.id)
        expect(detectInBackground).toHaveBeenCalledTimes(2)
      })
    })

    it('reports a gap in the running balance and an opening mismatch', async () => {
      await withFixture(async ({ service, preview }) => {
        // The 2nd coffee is missing: the next balance does not follow.
        const gap = await preview(cicCsv([...HISTORY.slice(0, 2), HISTORY[3]]))
        expect(gap.preview!.continuity).toMatchObject({
          checked: true,
          ok: false,
          gaps: [
            { lineNumber: 4, fromDate: '2026-10-02', toDate: '2026-10-03' },
          ],
          openingMismatch: null,
        })

        await service.commit((await preview(FILE_A)).id, {})
        // Starts on the 5th, skipping the insurance debit of the 4th.
        const next = await preview(cicCsv(HISTORY.slice(5)))
        expect(next.preview!.previousBalanceCents).toBe(HISTORY[3].balanceCents)
        expect(next.preview!.continuity).toMatchObject({
          checked: true,
          ok: false,
          openingMismatch: {
            fromDate: null,
            toDate: '2026-10-05',
            expectedCents: HISTORY[3].balanceCents! - 180,
            actualCents: HISTORY[5].balanceCents,
          },
        })
      })
    })

    it('discards pending previews older than a day', async () => {
      await withFixture(async ({ tx, preview }) => {
        const stale = await preview(FILE_A)
        await tx
          .update(importsTable)
          .set({
            createdAt: new Date(Date.now() - PENDING_PREVIEW_TTL_MS - 60_000),
          })
          .where(eq(importsTable.id, stale.id))
        const fresh = await preview(FILE_A)

        const ids = (
          await tx.select({ id: importsTable.id }).from(importsTable)
        ).map((r) => r.id)
        expect(ids).toContain(fresh.id)
        expect(ids).not.toContain(stale.id)
      })
    })
  })

  describe('commit', () => {
    it('writes the new rows atomically and records the counts', async () => {
      await withFixture(async ({ tx, service, preview, accountId }) => {
        const previewed = await preview(FILE_A)
        const committed = await service.commit(previewed.id, {})

        expect(committed).toMatchObject({
          status: 'committed',
          preview: null,
          counts: { rows: 4, new: 4, inserted: 4, duplicates: 0, skipped: 0 },
        })
        expect(committed.committedAt).toBeInstanceOf(Date)

        const stored = await storedTransactions(tx, accountId)
        expect(stored).toHaveLength(4)
        expect(stored.every((t) => t.importId === previewed.id)).toBe(true)
        // Two identical coffees on the same day are both kept.
        expect(stored.filter((t) => t.rawLabel === COFFEE)).toHaveLength(2)
        expect(stored.find((t) => t.rawLabel === SALARY)).toMatchObject({
          bookingDate: '2026-10-01',
          valueDate: '2026-10-01',
          amountCents: 245_000,
          balanceAfterCents: HISTORY[0].balanceCents,
          kind: 'income',
          needsReview: false,
        })

        const [record] = await tx
          .select()
          .from(importsTable)
          .where(eq(importsTable.id, previewed.id))
        expect(record.preview).toBeNull()
      })
    })

    it('links transfers through a rule’s destination and to their other side (#296)', async () => {
      await withFixture(async ({ tx, service, preview, accountId }) => {
        const [livret, pea] = await tx
          .insert(accountsTable)
          .values([
            { name: 'Test livret', type: 'savings' },
            { name: 'Test PEA', type: 'brokerage' },
          ])
          .returning()
        const [moves] = await tx
          .insert(categoriesTable)
          .values({
            slug: 'import_test_moves',
            name: 'Import test moves',
            kind: 'transfer',
          })
          .returning()
        await tx.insert(categorizationRulesTable).values([
          {
            position: 2,
            labelPattern: 'courtier test',
            categoryId: moves.id,
            counterpartAccountId: pea.id,
          },
          { position: 3, labelPattern: 'vir livret', categoryId: moves.id },
        ])
        // The other side, already on the savings account.
        const [arrival] = await tx
          .insert(transactionsTable)
          .values(
            await bankRows(tx, {
              accountId: livret.id,
              bookingDate: '2026-10-03',
              amountCents: 20_000,
              rawLabel: 'VIR DEPUIS COMPTE COURANT',
              kind: 'transfer',
              dedupeHash: 'test-livret-arrival',
            }),
          )
          .returning()

        const file = cicCsv(
          withBalances(OPENING, [
            {
              date: '2026-10-01',
              amountCents: -50_000,
              label: 'VIR COURTIER TEST PEA',
            },
            { date: '2026-10-02', amountCents: -20_000, label: 'VIR LIVRET A' },
          ]),
        )
        await service.commit((await preview(file)).id, {})

        const stored = await storedTransactions(tx, accountId)
        expect(
          stored.map((t) => [t.rawLabel, t.kind, t.counterpartAccountId]),
        ).toEqual([
          ['VIR COURTIER TEST PEA', 'transfer', pea.id],
          ['VIR LIVRET A', 'transfer', livret.id],
        ])
        const [other] = await tx
          .select()
          .from(transactionsTable)
          .where(eq(transactionsTable.id, arrival.id))
        expect(other.counterpartAccountId).toBe(accountId)
      })
    })

    it('refuses to commit twice', async () => {
      await withFixture(async ({ service, preview }) => {
        const { id } = await preview(FILE_A)
        await service.commit(id, {})
        await expect(service.commit(id, {})).rejects.toBeInstanceOf(
          ConflictException,
        )
        await expect(
          service.commit('00000000-0000-4000-8000-000000000000', {}),
        ).rejects.toBeInstanceOf(NotFoundException)
      })
    })

    it('treats a re-imported file as all duplicates and flags it', async () => {
      await withFixture(async ({ tx, service, preview, accountId }) => {
        const first = await service.commit((await preview(FILE_A)).id, {})

        const again = await preview(FILE_A)
        expect(statuses(again)).toEqual([
          'duplicate',
          'duplicate',
          'duplicate',
          'duplicate',
        ])
        expect(again.alreadyImported).toEqual({
          importId: first.id,
          committedAt: first.committedAt,
        })
        expect(again.preview!.rows[1].existing).toMatchObject({
          bookingDate: '2026-10-02',
          amountCents: -390,
          rawLabel: COFFEE,
        })

        const committed = await service.commit(again.id, {})
        expect(committed.counts).toMatchObject({ inserted: 0, duplicates: 4 })
        expect(await storedTransactions(tx, accountId)).toHaveLength(4)
      })
    })

    it('only adds the rows of an overlapping file that are not stored yet', async () => {
      await withFixture(async ({ tx, service, preview, accountId }) => {
        await service.commit((await preview(FILE_A)).id, {})

        const overlap = await preview(FILE_B)
        expect(statuses(overlap)).toEqual(['duplicate', 'new', 'new'])
        // Continues from the stored balance of the 2nd.
        expect(overlap.preview!.previousBalanceCents).toBe(
          HISTORY[2].balanceCents,
        )
        expect(overlap.preview!.continuity.ok).toBe(true)

        const committed = await service.commit(overlap.id, {})
        expect(committed.counts).toMatchObject({ inserted: 2, duplicates: 1 })
        expect(await storedTransactions(tx, accountId)).toHaveLength(6)
      })
    })

    it('counts rows stored by another import since the preview as duplicates', async () => {
      await withFixture(async ({ tx, service, preview, accountId }) => {
        const pending = await preview(FILE_A)
        await service.commit((await preview(FILE_B)).id, {})

        const committed = await service.commit(pending.id, {})
        // The groceries row of the 3rd landed with FILE_B meanwhile.
        expect(committed.counts).toMatchObject({
          rows: 4,
          new: 4,
          inserted: 3,
          duplicates: 1,
        })
        expect(await storedTransactions(tx, accountId)).toHaveLength(6)
      })
    })

    it('imports or skips conflicts with another source as resolved', async () => {
      await withFixture(async ({ tx, service, preview, accountId }) => {
        // Same coffee and groceries, entered by another source (other labels).
        const [history] = await tx
          .insert(importsTable)
          .values({
            accountId,
            source: 'spreadsheet',
            fileName: 'history.xlsx',
            fileHash: 'f'.repeat(64),
            committedAt: new Date(),
          })
          .returning()
        await tx.insert(transactionsTable).values(
          await bankRows(
            tx,
            [
              {
                bookingDate: '2026-10-02',
                amountCents: -390,
                rawLabel: 'Café de la gare',
              },
              {
                bookingDate: '2026-10-03',
                amountCents: -4_250,
                rawLabel: 'Fauxmarché Ville-Exemple',
              },
            ].map((t, i) => ({
              ...t,
              accountId,
              importId: history.id,
              kind: 'expense' as const,
              dedupeHash: `history-test-${i}`,
            })),
          ),
        )

        const previewed = await preview(FILE_A)
        expect(previewed.counts).toMatchObject({ new: 2, conflicts: 2 })
        const conflicts = previewed.preview!.rows.filter(
          (row) => row.status === 'conflict',
        )
        expect(conflicts.map((row) => row.rawLabel)).toEqual([
          COFFEE,
          GROCERIES,
        ])
        expect(conflicts[0].existing).toMatchObject({
          bookingDate: '2026-10-02',
          amountCents: -390,
          rawLabel: 'Café de la gare',
        })
        expect(conflicts[0].conflictReason).toMatch(/^Same amount, same day/)

        // Import the coffee conflict; the groceries one has no decision → skipped.
        const committed = await service.commit(previewed.id, {
          conflictResolutions: [
            { rowIndex: conflicts[0].index, action: 'import' },
          ],
        })
        expect(committed.counts).toMatchObject({
          inserted: 3,
          skipped: 1,
          duplicates: 0,
        })
        const stored = await storedTransactions(tx, accountId)
        expect(stored.filter((t) => t.rawLabel === COFFEE)).toHaveLength(2)
        expect(stored.filter((t) => t.rawLabel === GROCERIES)).toHaveLength(0)

        // Re-importing: the imported conflict got its own hash → duplicate;
        // the skipped one is still a conflict.
        const again = await preview(FILE_A)
        expect(statuses(again)).toEqual([
          'duplicate',
          'duplicate',
          'duplicate',
          'conflict',
        ])
      })
    })

    it('skips a conflict resolved as skip', async () => {
      await withFixture(async ({ tx, service, preview, accountId }) => {
        await tx.insert(transactionsTable).values(
          await bankRows(tx, {
            accountId,
            bookingDate: '2026-10-01',
            amountCents: 245_000,
            rawLabel: 'Salaire société fictive',
            kind: 'income',
            dedupeHash: 'history-test-salary',
          }),
        )
        const previewed = await preview(FILE_A)
        expect(statuses(previewed)[0]).toBe('conflict')

        const committed = await service.commit(previewed.id, {
          conflictResolutions: [{ rowIndex: 0, action: 'skip' }],
        })
        expect(committed.counts).toMatchObject({ inserted: 3, skipped: 1 })
        expect(await storedTransactions(tx, accountId)).toHaveLength(4)
      })
    })

    it('validates the resolutions and category overrides', async () => {
      await withFixture(async ({ service, preview }) => {
        const { id } = await preview(FILE_A)
        await expect(
          service.commit(id, {
            conflictResolutions: [{ rowIndex: 0, action: 'import' }],
          }),
        ).rejects.toThrow('row 0 is not a conflict')
        await expect(
          service.commit(id, {
            categoryOverrides: [
              {
                rowIndex: 9,
                categoryId: '00000000-0000-4000-8000-000000000000',
              },
            ],
          }),
        ).rejects.toThrow('row 9 does not exist')
        await expect(
          service.commit(id, {
            categoryOverrides: [
              {
                rowIndex: 1,
                categoryId: '00000000-0000-4000-8000-000000000000',
              },
            ],
          }),
        ).rejects.toBeInstanceOf(BadRequestException)
        // Nothing was committed by the failed attempts.
        expect((await service.findOne(id)).status).toBe('pending')
      })
    })

    it('applies a category chosen in the preview', async () => {
      await withFixture(
        async ({ tx, service, preview, accountId, groceries }) => {
          const { id } = await preview(FILE_A)
          await service.commit(id, {
            categoryOverrides: [{ rowIndex: 1, categoryId: groceries }],
          })
          const coffees = (await storedTransactions(tx, accountId)).filter(
            (t) => t.rawLabel === COFFEE,
          )
          expect(coffees.map((t) => [t.categoryId, t.needsReview])).toEqual(
            expect.arrayContaining([
              [groceries, false],
              [null, true],
            ]),
          )
        },
      )
    })
  })

  describe('history and undo', () => {
    it('lists committed and pending imports, newest first', async () => {
      await withFixture(async ({ tx, service, preview }) => {
        const first = await service.commit((await preview(FILE_A)).id, {})
        const second = await preview(FILE_B)
        await tx
          .update(importsTable)
          .set({ createdAt: new Date(Date.now() - 60_000) })
          .where(eq(importsTable.id, first.id))

        const listed = (await service.list()).filter((i) =>
          [first.id, second.id].includes(i.id),
        )
        expect(listed.map((i) => [i.id, i.status])).toEqual([
          [second.id, 'pending'],
          [first.id, 'committed'],
        ])
        expect(listed[1]).toMatchObject({
          accountName: 'Test checking',
          counts: { rows: 4, inserted: 4 },
        })
        expect(listed[0]).not.toHaveProperty('preview')

        expect((await service.findOne(second.id)).preview!.rows).toHaveLength(3)
        expect((await service.findOne(first.id)).preview).toBeNull()
      })
    })

    it('undoes exactly the transactions of one import', async () => {
      await withFixture(async ({ tx, service, preview, accountId }) => {
        const a = await service.commit((await preview(FILE_A)).id, {})
        const b = await service.commit((await preview(FILE_B)).id, {})

        await expect(service.remove(a.id)).resolves.toEqual({
          id: a.id,
          result: 'undone',
          removedTransactions: 4,
          restoredManual: 0,
        })
        const remaining = await storedTransactions(tx, accountId)
        expect(remaining).toHaveLength(2)
        expect(remaining.every((t) => t.importId === b.id)).toBe(true)
        await expect(service.findOne(a.id)).rejects.toBeInstanceOf(
          NotFoundException,
        )

        // After the undo, the same file is new again.
        expect(statuses(await preview(FILE_A))).toEqual([
          'new',
          'new',
          'new',
          'new',
        ])
      })
    })

    it('discards a pending import', async () => {
      await withFixture(async ({ service, preview }) => {
        const { id } = await preview(FILE_A)
        await expect(service.remove(id)).resolves.toEqual({
          id,
          result: 'discarded',
          removedTransactions: 0,
          restoredManual: 0,
        })
        await expect(service.commit(id, {})).rejects.toBeInstanceOf(
          NotFoundException,
        )
        await expect(service.remove(id)).rejects.toBeInstanceOf(
          NotFoundException,
        )
      })
    })
  })
})
