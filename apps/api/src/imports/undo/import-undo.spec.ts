import '#/load-env'
import { asc, eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CategorizationRulesService } from '#/categories/categorization-rules.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  categorizationRulesTable,
  receivablesTable,
  transactionSplitsTable,
  transactionsTable,
} from '#/database/schema'
import { ImportsService } from '#/imports/imports.service'
import { ImportProfilesService } from '#/imports/profiles/import-profiles.service'
import {
  type CicRow,
  cicCsv,
  withBalances,
} from '#/imports/testing/cic-csv-fixture'
import { OwedService } from '#/owed/owed.service'
import { RecurringService } from '#/recurring/recurring.service'
import { ManualTransactionsService } from '#/transactions/manual-transactions.service'
import { TransactionsService } from '#/transactions/transactions.service'
import { restoredManual } from './import-undo'
import { legacyCorrect } from '#/transactions/testing/legacy-correction'

/**
 * Undoing a committed import (#371): what it deletes is counted beforehand,
 * and the manual transactions its rows absorbed come back. Against the
 * migrated test database, every test in a transaction rolled back.
 * Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

const SALARY = 'VIR SEPA SALAIRE SOCIETE FICTIVE OCT'
const BAKERY = 'PAIEMENT CB 0210 VILLE-EXEMPLE BOULANGERIE TEST CARTE 1234 ABCD'
const CINEMA = 'PAIEMENT CB 0310 VILLE-EXEMPLE CINEMA FICTIF CARTE 1234 ABCD'
const BAR = 'PAIEMENT CB 0610 VILLE-EXEMPLE BAR IMAGINAIRE CARTE 1234 ABCD'
const BOOKS = 'PAIEMENT CB 0710 VILLE-EXEMPLE LIBRAIRIE TEST CARTE 1234 ABCD'
const MARKET = 'PAIEMENT CB 0810 VILLE-EXEMPLE SUPERMARCHE TEST CARTE 1234 ABCD'
const PHARMACY = 'PAIEMENT CB 0910 VILLE-EXEMPLE PHARMACIE TEST CARTE 1234 ABCD'
const TO_SAVINGS = 'VIR LIVRET TEST VERS EPARGNE'
const TO_OTHER = 'VIR COMPTE TIERS TEST'

/** Noon in Paris on the last day of the month of the files. */
const NOW = new Date('2026-10-31T11:00:00Z')

interface Fixture {
  tx: Tx
  imports: ImportsService
  manual: ManualTransactionsService
  transactions: TransactionsService
  owed: OwedService
  accountId: string
  savingsId: string
  outings: string
  groceries: string
  /** Previews and commits `rows`; returns the import's id. */
  importRows: (rows: Omit<CicRow, 'balanceCents'>[]) => Promise<string>
  stored: () => Promise<(typeof transactionsTable.$inferSelect)[]>
  byLabel: (label: string) => Promise<typeof transactionsTable.$inferSelect>
}

describe.skipIf(!process.env.DATABASE_URL)('Import undo (database)', () => {
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
        const [account, savings] = await tx
          .insert(accountsTable)
          .values([
            { name: 'Test checking', type: 'checking' },
            { name: 'Test savings', type: 'savings' },
          ])
          .returning()
        const [outings, groceries, moves] = await tx
          .insert(categoriesTable)
          .values([
            {
              slug: 'undo_test_outings',
              name: 'Sorties test',
              kind: 'expense',
            },
            {
              slug: 'undo_test_groceries',
              name: 'Courses test',
              kind: 'expense',
            },
            {
              slug: 'undo_test_moves',
              name: 'Virements test',
              kind: 'transfer',
            },
          ])
          .returning()
        await tx.insert(categorizationRulesTable).values([
          {
            position: 0,
            labelPattern: 'boulangerie',
            categoryId: groceries.id,
          },
          { position: 1, labelPattern: 'vir livret', categoryId: moves.id },
          { position: 2, labelPattern: 'vir compte', categoryId: moves.id },
        ])
        const database = { db: tx } as never
        const imports = new ImportsService(
          database,
          new CategorizationRulesService(database),
          new ImportProfilesService(database),
        )
        const transactions = new TransactionsService(database)
        const stored = () =>
          tx
            .select()
            .from(transactionsTable)
            .where(eq(transactionsTable.accountId, account.id))
            .orderBy(
              asc(transactionsTable.bookingDate),
              asc(transactionsTable.amountCents),
              asc(transactionsTable.id),
            )
        await fn({
          tx,
          imports,
          transactions,
          owed: new OwedService(
            database,
            transactions,
            new RecurringService(database),
          ),
          manual: new ManualTransactionsService(database, transactions),
          accountId: account.id,
          savingsId: savings.id,
          outings: outings.id,
          groceries: groceries.id,
          importRows: async (rows) => {
            const previewed = await imports.preview({
              accountId: account.id,
              fileName: 'export.csv',
              buffer: cicCsv(withBalances(10_000, rows)),
            })
            await imports.commit(previewed.id, {})
            return previewed.id
          },
          stored,
          byLabel: async (label) => {
            const row = (await stored()).find((r) => r.rawLabel === label)
            if (!row) throw new Error(`no row ${label}`)
            return row
          },
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

  it('has nothing to tell for an import nobody touched', async () => {
    await withFixture(async ({ imports, importRows, stored }) => {
      const id = await importRows(OCTOBER)
      expect((await imports.findOne(id)).undo).toEqual({
        editedCount: 0,
        absorbedManualCount: 0,
      })
      expect(await imports.remove(id)).toEqual({
        id,
        result: 'undone',
        removedTransactions: 3,
        restoredManual: 0,
      })
      expect(await stored()).toEqual([])
    })
  })

  it('has no undo figures while pending', async () => {
    await withFixture(async ({ imports, accountId }) => {
      const previewed = await imports.preview({
        accountId,
        fileName: 'export.csv',
        buffer: cicCsv(withBalances(10_000, OCTOBER)),
      })
      expect(previewed.undo).toBeNull()
      expect((await imports.remove(previewed.id)).restoredManual).toBe(0)
    })
  })

  it('counts the rows edited by hand, not the ones filed by a rule or linked by matching', async () => {
    await withFixture(
      async ({
        tx,
        imports,
        transactions,
        importRows,
        byLabel,
        savingsId,
        outings,
        groceries,
      }) => {
        // The other side of the transfer to the savings account, already there.
        await tx.insert(transactionsTable).values({
          accountId: savingsId,
          bookingDate: '2026-10-12',
          amountCents: 50_000,
          rawLabel: 'VIR RECU TEST',
          kind: 'transfer',
          manual: true,
          dedupeHash: 'manual:undo-spec-savings-side',
        })
        const id = await importRows([
          { date: '2026-10-01', amountCents: 200_000, label: SALARY },
          { date: '2026-10-02', amountCents: -450, label: BAKERY },
          { date: '2026-10-05', amountCents: -1_250, label: CINEMA },
          { date: '2026-10-06', amountCents: -2_000, label: BAR },
          { date: '2026-10-07', amountCents: -3_000, label: BOOKS },
          { date: '2026-10-08', amountCents: -6_000, label: MARKET },
          { date: '2026-10-09', amountCents: -800, label: PHARMACY },
          { date: '2026-10-12', amountCents: -50_000, label: TO_SAVINGS },
          { date: '2026-10-15', amountCents: -10_000, label: TO_OTHER },
        ])
        // Filed by a rule (bakery), linked by matching (savings): not edits.
        expect((await byLabel(BAKERY)).ruleId).not.toBeNull()
        expect((await byLabel(TO_SAVINGS)).counterpartAccountId).toBe(savingsId)
        expect((await imports.findOne(id)).undo).toEqual({
          editedCount: 0,
          absorbedManualCount: 0,
        })

        await transactions.update((await byLabel(CINEMA)).id, {
          categoryId: outings,
        })
        await transactions.update((await byLabel(BAR)).id, {
          note: 'Anniversaire',
        })
        await transactions.update((await byLabel(BOOKS)).id, {
          isOneOff: true,
        })
        await transactions.split((await byLabel(MARKET)).id, [
          { categoryId: groceries, amountCents: -4_000 },
          { categoryId: outings, amountCents: -2_000 },
        ])
        await legacyCorrect(tx, (await byLabel(PHARMACY)).id, {
          amountCents: -900,
        })
        await transactions.update((await byLabel(TO_OTHER)).id, {
          counterpartAccountId: savingsId,
        })

        expect((await imports.findOne(id)).undo).toEqual({
          editedCount: 6,
          absorbedManualCount: 0,
        })
        const result = await imports.remove(id)
        expect(result).toMatchObject({
          removedTransactions: 9,
          restoredManual: 0,
        })
      },
    )
  })

  it('puts an absorbed manual transaction back on its own day, and a re-import absorbs it again', async () => {
    await withFixture(
      async ({ imports, manual, importRows, stored, accountId, outings }) => {
        await manual.create(
          {
            amountCents: 1_250,
            categoryId: outings,
            bookingDate: '2026-10-03',
            label: 'Ciné',
            isOneOff: true,
          },
          NOW,
        )
        const id = await importRows(OCTOBER)
        const absorbing = (await stored()).find(
          (row) => row.rawLabel === CINEMA,
        )!
        expect(absorbing).toMatchObject({
          manual: false,
          note: 'Ciné',
          absorbedManual: {
            bookingDate: '2026-10-03',
            rawLabel: 'Ciné',
            note: null,
          },
        })
        expect((await imports.findOne(id)).undo).toEqual({
          editedCount: 0,
          absorbedManualCount: 1,
        })

        expect(await imports.remove(id)).toMatchObject({
          result: 'undone',
          removedTransactions: 3,
          restoredManual: 1,
        })
        const [restored, ...others] = await stored()
        expect(others).toEqual([])
        expect(restored).toMatchObject({
          accountId,
          importId: null,
          manual: true,
          bookingDate: '2026-10-03',
          amountCents: -1_250,
          rawLabel: 'Ciné',
          kind: 'expense',
          categoryId: outings,
          ruleId: null,
          isOneOff: true,
          note: null,
          absorbedManual: null,
        })
        expect(restored.dedupeHash).toMatch(/^manual:/)

        // The same file again: the entry is reconciled as the first time.
        const again = await importRows(OCTOBER)
        const rows = await stored()
        expect(rows.filter((row) => row.manual)).toEqual([])
        expect(rows.find((row) => row.rawLabel === CINEMA)).toMatchObject({
          importId: again,
          categoryId: outings,
          isOneOff: true,
          absorbedManual: { bookingDate: '2026-10-03', rawLabel: 'Ciné' },
        })
      },
    )
  })

  it('gives the restored entry its own note, its split and what was edited since', async () => {
    await withFixture(
      async ({
        tx,
        imports,
        manual,
        transactions,
        importRows,
        stored,
        outings,
        groceries,
      }) => {
        await manual.create(
          {
            amountCents: 1_250,
            categoryId: outings,
            bookingDate: '2026-10-04',
            label: 'Ciné',
            note: 'Avec des amis',
          },
          NOW,
        )
        await manual.create(
          {
            amountCents: 2_000,
            categoryId: outings,
            bookingDate: '2026-10-27',
          },
          NOW,
        )
        const id = await importRows(OCTOBER)
        const cinema = (await stored()).find((r) => r.rawLabel === CINEMA)!
        expect(cinema.note).toBe('Avec des amis')
        await transactions.split(cinema.id, [
          { categoryId: outings, amountCents: -1_000 },
          { categoryId: groceries, amountCents: -250 },
        ])
        const bar = (await stored()).find((r) => r.rawLabel === BAR)!
        // Its label defaulted to the category name: no note was carried over.
        expect(bar.note).toBeNull()
        await transactions.update(bar.id, { note: 'Pot de départ' })

        expect((await imports.findOne(id)).undo).toEqual({
          editedCount: 0,
          absorbedManualCount: 2,
        })
        await imports.remove(id)

        const restored = await stored()
        expect(restored).toHaveLength(2)
        expect(restored[0]).toMatchObject({
          manual: true,
          bookingDate: '2026-10-04',
          rawLabel: 'Ciné',
          note: 'Avec des amis',
        })
        expect(restored[1]).toMatchObject({
          manual: true,
          bookingDate: '2026-10-27',
          rawLabel: 'Sorties test',
          note: 'Pot de départ',
        })
        const parts = await tx
          .select()
          .from(transactionSplitsTable)
          .where(eq(transactionSplitsTable.transactionId, restored[0].id))
          .orderBy(asc(transactionSplitsTable.position))
        expect(parts.map((p) => [p.categoryId, p.amountCents])).toEqual([
          [outings, -1_000],
          [groceries, -250],
        ])
      },
    )
  })

  it('gives the restored entry back what is owed on it, and counts a row shared by hand (#359)', async () => {
    await withFixture(
      async ({ tx, imports, manual, owed, importRows, stored, outings }) => {
        const entry = await manual.create(
          {
            amountCents: 1_250,
            categoryId: outings,
            bookingDate: '2026-10-04',
            label: 'Ciné',
          },
          NOW,
        )
        await owed.createShares({
          transactionId: entry.id,
          shares: [{ contactName: 'Alex', amountCents: 625 }],
        })
        const id = await importRows(OCTOBER)
        const cinema = (await stored()).find((r) => r.rawLabel === CINEMA)!
        const bar = (await stored()).find((r) => r.rawLabel === BAR)!
        const [moved] = await tx
          .select()
          .from(receivablesTable)
          .where(
            eq(receivablesTable.contactId, (await owed.listContacts())[0].id),
          )
        expect(moved.transactionId).toBe(cinema.id)
        // A bank row shared by hand is an edit the undo loses.
        await owed.createShares({
          transactionId: bar.id,
          shares: [{ contactName: 'Sam', amountCents: 1_000 }],
        })
        expect((await imports.findOne(id)).undo).toEqual({
          editedCount: 1,
          absorbedManualCount: 1,
        })

        await imports.remove(id)
        const [restored] = await stored()
        expect(restored).toMatchObject({ manual: true, rawLabel: 'Ciné' })
        const shares = await tx.select().from(receivablesTable)
        expect(shares.map((r) => [r.transactionId, r.amountCents])).toEqual([
          [restored.id, 625],
        ])
      },
    )
  })
})

describe('restoredManual', () => {
  const row = {
    accountId: 'a',
    bookingDate: '2026-10-05',
    amountCents: -1_250,
    kind: 'expense' as const,
    categoryId: 'c',
    needsReview: false,
    isOneOff: false,
    note: 'Ciné',
    counterpartAccountId: null,
    prepaidItemId: null,
    originalBookingDate: null,
    absorbedManual: { bookingDate: '2026-10-03', rawLabel: 'Ciné', note: null },
  }

  it('keeps the day of the entry and drops the note made from its label', () => {
    expect(restoredManual(row)).toMatchObject({
      bookingDate: '2026-10-03',
      rawLabel: 'Ciné',
      note: null,
      manual: true,
      importId: null,
      ruleId: null,
    })
  })

  it('takes the corrected day and amount of a corrected row', () => {
    expect(
      restoredManual({
        ...row,
        bookingDate: '2026-10-06',
        amountCents: -1_300,
        originalBookingDate: '2026-10-05',
      }),
    ).toMatchObject({ bookingDate: '2026-10-06', amountCents: -1_300 })
  })

  it('keeps a note written after the reconciliation', () => {
    expect(restoredManual({ ...row, note: 'Avec Léa' }).note).toBe('Avec Léa')
  })
})
