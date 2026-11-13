import '#/load-env'
import { asc, eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BudgetsService } from '#/budgets/budgets.service'
import { CategorizationRulesService } from '#/categories/categorization-rules.service'
import { dataUntil, dataUntilByAccount } from '#/coverage/coverage'
import * as schema from '#/database/schema'
import {
  accountsTable,
  budgetsTable,
  categoriesTable,
  categorizationRulesTable,
  transactionsTable,
} from '#/database/schema'
import {
  type CicRow,
  cicCsv,
  withBalances,
} from '#/imports/testing/cic-csv-fixture'
import { ManualExpensesService } from '#/transactions/manual-expenses.service'
import { TransactionsService } from '#/transactions/transactions.service'
import { ImportsService } from './imports.service'

/**
 * Reconciliation of expenses noted by hand with the bank rows of an import
 * (#137), against the migrated test database. Every test runs in a
 * transaction that is rolled back. Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

const SALARY = 'VIR SEPA SALAIRE SOCIETE FICTIVE OCT'
const CINEMA = 'PAIEMENT CB 0310 VILLE-EXEMPLE CINEMA FICTIF CARTE 1234 ABCD'
const BAKERY = 'PAIEMENT CB 0410 VILLE-EXEMPLE BOULANGERIE TEST CARTE 1234 ABCD'
const BAR = 'PAIEMENT CB 0610 VILLE-EXEMPLE BAR IMAGINAIRE CARTE 1234 ABCD'

/** Noon in Paris on the last day of the month of the files. */
const NOW = new Date('2026-10-31T11:00:00Z')

interface Fixture {
  tx: Tx
  imports: ImportsService
  manual: ManualExpensesService
  budgets: BudgetsService
  accountId: string
  outings: string
  groceries: string
  /** Previews and commits `rows` (balances chained from 100 €). */
  importRows: (rows: Omit<CicRow, 'balanceCents'>[]) => Promise<void>
  stored: () => Promise<(typeof transactionsTable.$inferSelect)[]>
}

describe.skipIf(!process.env.DATABASE_URL)(
  'Import reconciliation with manual expenses (database)',
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

    async function withFixture(fn: (f: Fixture) => Promise<void>) {
      await db
        .transaction(async (tx) => {
          await tx.delete(categorizationRulesTable)
          const [account] = await tx
            .insert(accountsTable)
            .values({ name: 'Test checking', type: 'checking' })
            .returning()
          const [outings, groceries] = await tx
            .insert(categoriesTable)
            .values([
              {
                slug: 'reconcile_test_outings',
                name: 'Sorties test',
                kind: 'expense',
              },
              {
                slug: 'reconcile_test_groceries',
                name: 'Courses test',
                kind: 'expense',
              },
            ])
            .returning()
          // A rule that would file the bakery rows elsewhere: the manual
          // category must win over it.
          await tx.insert(categorizationRulesTable).values({
            position: 0,
            labelPattern: 'boulangerie',
            categoryId: groceries.id,
          })
          const database = { db: tx } as never
          const imports = new ImportsService(
            database,
            new CategorizationRulesService(database),
          )
          const manual = new ManualExpensesService(
            database,
            new TransactionsService(database),
          )
          await fn({
            tx,
            imports,
            manual,
            budgets: new BudgetsService(database),
            accountId: account.id,
            outings: outings.id,
            groceries: groceries.id,
            importRows: async (rows) => {
              const previewed = await imports.preview({
                accountId: account.id,
                fileName: 'export.csv',
                buffer: cicCsv(withBalances(10_000, rows)),
              })
              await imports.commit(previewed.id, {})
            },
            stored: () =>
              tx
                .select()
                .from(transactionsTable)
                .where(eq(transactionsTable.accountId, account.id))
                .orderBy(
                  asc(transactionsTable.bookingDate),
                  asc(transactionsTable.amountCents),
                  asc(transactionsTable.id),
                ),
          })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    const OCTOBER: Omit<CicRow, 'balanceCents'>[] = [
      { date: '2026-10-01', amountCents: 200_000, label: SALARY },
      { date: '2026-10-05', amountCents: -1_250, label: CINEMA },
      { date: '2026-10-28', amountCents: -2_000, label: BAR },
    ]

    it('shows the match in the preview with the manual category', async () => {
      await withFixture(async ({ imports, manual, accountId, outings }) => {
        const noted = await manual.create(
          {
            amountCents: 1_250,
            categoryId: outings,
            bookingDate: '2026-10-03',
            label: 'Ciné',
          },
          NOW,
        )
        const previewed = await imports.preview({
          accountId,
          fileName: 'export.csv',
          buffer: cicCsv(withBalances(10_000, OCTOBER)),
        })
        const rows = previewed.preview!.rows
        expect(rows.map((row) => row.status)).toEqual(['new', 'new', 'new'])
        expect(rows[1]).toMatchObject({
          categoryId: outings,
          ruleId: null,
          kind: 'expense',
          needsReview: false,
          manualMatch: {
            id: noted.id,
            bookingDate: '2026-10-03',
            amountCents: -1_250,
            rawLabel: 'Ciné',
            categoryId: outings,
          },
        })
        expect(rows[0].manualMatch).toBeNull()
        expect(rows[2].manualMatch).toBeNull()
        expect(previewed.preview!.unmatchedManual).toEqual([])
      })
    })

    it('leaves one transaction: the bank row, with the manual category and note', async () => {
      await withFixture(
        async ({ manual, budgets, importRows, stored, tx, outings }) => {
          const noted = await manual.create(
            {
              amountCents: 1_250,
              categoryId: outings,
              bookingDate: '2026-10-03',
              label: 'Ciné',
            },
            NOW,
          )
          await tx
            .update(transactionsTable)
            .set({ isOneOff: true })
            .where(eq(transactionsTable.id, noted.id))
          await tx.insert(budgetsTable).values({
            categoryId: outings,
            effectiveFrom: '2026-10-01',
            monthlyTargetCents: 10_000,
            tracked: true,
          })
          const before = await budgets.envelopes(tx, NOW)
          expect(before.items[0]).toMatchObject({
            spentCents: 1_250,
            manualCents: 1_250,
          })

          await importRows(OCTOBER)

          const rows = await stored()
          expect(rows).toHaveLength(3)
          expect(rows.filter((row) => row.manual)).toEqual([])
          const cinema = rows.find((row) => row.amountCents === -1_250)!
          expect(cinema).toMatchObject({
            rawLabel: CINEMA,
            bookingDate: '2026-10-05',
            categoryId: outings,
            ruleId: null,
            kind: 'expense',
            needsReview: false,
            isOneOff: true,
            note: 'Ciné',
          })
          expect(cinema.importId).not.toBeNull()
          expect(cinema.balanceAfterCents).not.toBeNull()

          // Counted once: 12.50 € for the cinema, plus the unmatched bar row
          // that no rule files under outings.
          const after = await budgets.envelopes(tx, NOW)
          expect(after.items[0]).toMatchObject({
            spentCents: 1_250,
            manualCents: 0,
          })
        },
      )
    })

    it('keeps a manual category over a rule, and no note for a default label', async () => {
      await withFixture(async ({ manual, importRows, stored, outings }) => {
        await manual.create(
          { amountCents: 350, categoryId: outings, bookingDate: '2026-10-09' },
          NOW,
        )
        await importRows([
          { date: '2026-10-01', amountCents: 200_000, label: SALARY },
          { date: '2026-10-10', amountCents: -350, label: BAKERY },
        ])
        const bakery = (await stored()).find((row) => row.amountCents === -350)!
        expect(bakery).toMatchObject({
          rawLabel: BAKERY,
          categoryId: outings,
          manual: false,
          note: null,
        })
      })
    })

    it('replaces identical expenses noted the same day one for one', async () => {
      await withFixture(async ({ manual, importRows, stored, outings }) => {
        for (let i = 0; i < 2; i++) {
          await manual.create(
            {
              amountCents: 300,
              categoryId: outings,
              bookingDate: '2026-10-07',
            },
            NOW,
          )
        }
        await importRows([
          { date: '2026-10-01', amountCents: 200_000, label: SALARY },
          { date: '2026-10-08', amountCents: -300, label: BAKERY },
          { date: '2026-10-08', amountCents: -300, label: BAKERY },
          { date: '2026-10-08', amountCents: -300, label: BAKERY },
        ])
        const bakery = (await stored()).filter(
          (row) => row.amountCents === -300,
        )
        expect(bakery).toHaveLength(3)
        expect(bakery.every((row) => !row.manual && row.importId)).toBe(true)
        // Two took the manual category; the third one, the rule's.
        expect(bakery.filter((row) => row.categoryId === outings)).toHaveLength(
          2,
        )
        expect(new Set(bakery.map((row) => row.dedupeHash)).size).toBe(3)
      })
    })

    it('gives the bank row to the closest of several candidates and flags the other', async () => {
      await withFixture(async ({ manual, importRows, stored, outings }) => {
        const far = await manual.create(
          {
            amountCents: 2_000,
            categoryId: outings,
            bookingDate: '2026-10-02',
          },
          NOW,
        )
        const near = await manual.create(
          {
            amountCents: 2_000,
            categoryId: outings,
            bookingDate: '2026-10-05',
          },
          NOW,
        )
        await importRows([
          { date: '2026-10-01', amountCents: 200_000, label: SALARY },
          { date: '2026-10-06', amountCents: -2_000, label: BAR },
          { date: '2026-10-30', amountCents: -100, label: BAKERY },
        ])
        const rows = await stored()
        expect(rows.find((row) => row.id === near.id)).toBeUndefined()
        expect(rows.find((row) => row.id === far.id)).toMatchObject({
          manual: true,
          needsReview: true,
        })
      })
    })

    it('flags unmatched expenses only once their bank row was due', async () => {
      await withFixture(
        async ({ imports, manual, accountId, stored, outings }) => {
          const due = await manual.create(
            {
              amountCents: 999,
              categoryId: outings,
              bookingDate: '2026-10-10',
            },
            NOW,
          )
          const recent = await manual.create(
            {
              amountCents: 888,
              categoryId: outings,
              bookingDate: '2026-10-27',
            },
            NOW,
          )
          const previewed = await imports.preview({
            accountId,
            fileName: 'export.csv',
            buffer: cicCsv(withBalances(10_000, OCTOBER)),
          })
          expect(previewed.preview!.unmatchedManual.map((m) => m.id)).toEqual([
            due.id,
          ])
          await imports.commit(previewed.id, {})

          const rows = await stored()
          expect(rows.find((row) => row.id === due.id)).toMatchObject({
            manual: true,
            needsReview: true,
          })
          expect(rows.find((row) => row.id === recent.id)).toMatchObject({
            manual: true,
            needsReview: false,
          })
        },
      )
    })

    it('reconciles against the manual expenses as they are at commit', async () => {
      await withFixture(
        async ({ imports, manual, accountId, stored, outings, groceries }) => {
          const deleted = await manual.create(
            {
              amountCents: 1_250,
              categoryId: outings,
              bookingDate: '2026-10-04',
            },
            NOW,
          )
          const previewed = await imports.preview({
            accountId,
            fileName: 'export.csv',
            buffer: cicCsv(withBalances(10_000, OCTOBER)),
          })
          expect(previewed.preview!.rows[1].manualMatch?.id).toBe(deleted.id)
          await manual.remove(deleted.id)
          const late = await manual.create(
            {
              amountCents: 2_000,
              categoryId: groceries,
              bookingDate: '2026-10-28',
            },
            NOW,
          )
          await imports.commit(previewed.id, {})

          const rows = await stored()
          expect(rows).toHaveLength(3)
          expect(rows.some((row) => row.manual)).toBe(false)
          expect(rows.find((row) => row.id === late.id)).toBeUndefined()
          expect(rows.find((row) => row.amountCents === -2_000)).toMatchObject({
            rawLabel: BAR,
            categoryId: groceries,
          })
        },
      )
    })

    it('lets a category chosen in the preview win over the manual one', async () => {
      await withFixture(
        async ({ imports, manual, accountId, stored, outings, groceries }) => {
          await manual.create(
            {
              amountCents: 1_250,
              categoryId: outings,
              bookingDate: '2026-10-05',
              label: 'Ciné',
            },
            NOW,
          )
          const previewed = await imports.preview({
            accountId,
            fileName: 'export.csv',
            buffer: cicCsv(withBalances(10_000, OCTOBER)),
          })
          await imports.commit(previewed.id, {
            categoryOverrides: [{ rowIndex: 1, categoryId: groceries }],
          })
          const cinema = (await stored()).find(
            (row) => row.amountCents === -1_250,
          )!
          expect(cinema).toMatchObject({ categoryId: groceries, note: 'Ciné' })
        },
      )
    })

    it('keeps manual expenses out of the dedupe and the continuity check', async () => {
      await withFixture(
        async ({ imports, manual, accountId, importRows, outings }) => {
          const first = OCTOBER.slice(0, 2)
          await importRows(first)
          // Same day, amount and label as a bank row of the next file, and one
          // with an amount the running balance does not know about.
          await manual.create(
            {
              amountCents: 2_000,
              categoryId: outings,
              bookingDate: '2026-10-28',
              label: BAR,
            },
            NOW,
          )
          await manual.create(
            {
              amountCents: 4_200,
              categoryId: outings,
              bookingDate: '2026-10-06',
            },
            NOW,
          )
          const balances = withBalances(10_000, OCTOBER)
          const previewed = await imports.preview({
            accountId,
            fileName: 'export.csv',
            buffer: cicCsv(balances.slice(2)),
          })
          const preview = previewed.preview!
          expect(preview.rows[0].status).toBe('new')
          expect(preview.rows[0].existing).toBeNull()
          expect(preview.rows[0].manualMatch).not.toBeNull()
          expect(preview.previousBalanceCents).toBe(balances[1].balanceCents)
          expect(preview.continuity.ok).toBe(true)
        },
      )
    })

    it('never makes the month look imported', async () => {
      await withFixture(
        async ({ tx, manual, importRows, accountId, outings }) => {
          await importRows(OCTOBER.slice(0, 2))
          const now = new Date('2026-11-13T11:00:00Z')
          await manual.create({ amountCents: 1_000, categoryId: outings }, now)
          expect(await dataUntil(tx, { now })).toBe('2026-10-05')
          expect(await dataUntil(tx, { accountId, now })).toBe('2026-10-05')
          expect((await dataUntilByAccount(tx, now)).get(accountId)).toBe(
            '2026-10-05',
          )
        },
      )
    })
  },
)
