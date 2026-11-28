import { asSpecOwner } from '#/database/testing/spec-owner'
import '#/load-env'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedDefaultCategories } from '#/categories/seed-default-categories'
import * as schema from '#/database/schema'
import {
  accountsTable,
  balanceSnapshotsTable,
  categoriesTable,
  categorizationRulesTable,
  importsTable,
  transactionsTable,
} from '#/database/schema'
import { computeDedupeHashes } from '#/imports/dedupe/dedupe'
import {
  decodeUtf8,
  parseHistoryBalancesCsv,
  parseHistoryTransactionsCsv,
} from './history-csv.parser'
import {
  HistoryImportError,
  type HistoryImportInput,
  importHistory,
  runHistoryImport,
} from './history-import'
import { type AccountSpec, DEFAULT_ACCOUNT_SPECS } from './mapping'
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

const FIXTURES = join(__dirname, 'fixtures')
const read = (name: string) => decodeUtf8(readFileSync(join(FIXTURES, name)))
const TRANSACTIONS = parseHistoryTransactionsCsv(
  read('history-transactions.csv'),
)
const BALANCES = parseHistoryBalancesCsv(read('history-balances.csv'))

describe.skipIf(!process.env.DATABASE_URL)('history import (database)', () => {
  let client: postgres.Sql
  let db: Db

  beforeAll(() => {
    client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
    db = drizzle(client, { schema })
  })

  afterAll(async () => {
    await client.end()
  })

  async function inRollback(fn: (tx: Tx) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        await asSpecOwner(tx)
        await seedDefaultCategories(tx, await asSpecOwner(tx))
        await fn(tx)
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
  }

  /** Default specs with unique names, so a real account never matches. */
  function uniqueSpecs(): AccountSpec[] {
    const suffix = randomUUID().slice(0, 8)
    return DEFAULT_ACCOUNT_SPECS.map((spec) => ({
      ...spec,
      name: `${spec.name} test ${suffix}`,
    }))
  }

  function input(
    specs: AccountSpec[],
    overrides: Partial<HistoryImportInput> = {},
  ): HistoryImportInput {
    return {
      transactions: TRANSACTIONS,
      transactionsFile: { name: 'history.csv', sha256: 'a'.repeat(64) },
      accountSpecs: specs,
      now: new Date('2026-11-05T12:00:00Z'),
      ...overrides,
    }
  }

  async function accountTransactions(tx: Tx, accountId: string) {
    return tx
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.accountId, accountId))
      .orderBy(asc(transactionsTable.bookingDate), asc(transactionsTable.id))
  }

  it('imports the rows once and nothing on a second run', async () => {
    await inRollback(async (tx) => {
      const specs = uniqueSpecs()
      const first = await importHistory(tx, input(specs))

      expect(first.rows).toBe(17)
      expect(first.unmappedAccountCodes).toEqual([{ code: 'XX', rows: 1 }])
      expect(
        first.accounts.map((a) => [
          a.code,
          a.created,
          a.rows,
          a.new,
          a.inserted,
        ]),
      ).toEqual([
        ['CC', true, 15, 15, 15],
        ['LA', true, 1, 1, 1],
      ])
      expect(first.conflicts).toEqual([])
      // paypal, virement_emis (Dépense), unknown slug, empty category
      expect(first.needsReview).toBe(4)
      expect(first.unmappedCategories).toEqual([
        { sheetSlug: 'categorie_inventee', rows: 1 },
      ])

      const checking = first.accounts[0]
      const [imported] = await tx
        .select()
        .from(importsTable)
        .where(eq(importsTable.id, checking.importId!))
      expect(imported).toMatchObject({
        accountId: checking.accountId,
        source: 'spreadsheet',
        fileName: 'history.csv',
        fileHash: 'a'.repeat(64),
        periodStart: '2023-07-01',
        periodEnd: '2023-08-02',
        rowCount: 15,
        insertedCount: 15,
        duplicateCount: 0,
      })
      expect(imported.committedAt).toEqual(new Date('2026-11-05T12:00:00Z'))

      const rows = await accountTransactions(tx, checking.accountId)
      const groceries = await tx
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.slug, 'groceries'))
      const supermarket = rows.filter(
        (r) => r.merchant === 'Supermarche Exemple',
      )
      expect(supermarket).toHaveLength(4)
      expect(supermarket[0]).toMatchObject({
        categoryId: groceries[0].id,
        kind: 'expense',
        ruleId: null,
        needsReview: false,
        balanceAfterCents: null,
        importId: checking.importId,
      })
      const oneOff = rows.find((r) => r.amountCents === -123_456)!
      expect(oneOff.isOneOff).toBe(true)
      const savings = rows.find((r) => r.amountCents === -10_000)!
      expect(savings.kind).toBe('transfer')

      const second = await importHistory(tx, input(specs))
      expect(
        second.accounts.map((a) => [
          a.code,
          a.created,
          a.new,
          a.duplicate,
          a.inserted,
          a.importId,
        ]),
      ).toEqual([
        ['CC', false, 0, 15, 0, null],
        ['LA', false, 0, 1, 0, null],
      ])
      expect(await accountTransactions(tx, checking.accountId)).toHaveLength(15)
      const imports = await tx
        .select()
        .from(importsTable)
        .where(eq(importsTable.accountId, checking.accountId))
      expect(imports).toHaveLength(1)
    })
  })

  it('keeps identical rows of the same day', async () => {
    await inRollback(async (tx) => {
      const specs = uniqueSpecs()
      const result = await importHistory(tx, input(specs))
      const rows = await accountTransactions(tx, result.accounts[0].accountId)
      const coffees = rows.filter((r) => r.merchant === 'Cafe Fictif')
      expect(coffees).toHaveLength(2)
      expect(new Set(coffees.map((r) => r.dedupeHash)).size).toBe(2)
    })
  })

  it('reports a probable duplicate from a CSV import as a conflict, not inserted', async () => {
    await inRollback(async (tx) => {
      const specs = uniqueSpecs()
      const [account] = await tx
        .insert(accountsTable)
        .values({ name: specs[0].name, type: 'checking', institution: 'CIC' })
        .returning()
      // The same card payment as exported by the bank (other label format).
      const csvLabel =
        'PAIEMENT CB 0507 TESTVILLE SUPERMARCHE EXEMPLE CARTE 1234 ABCD'
      const [hash] = computeDedupeHashes([
        { bookingDate: '2023-07-05', amountCents: -4230, rawLabel: csvLabel },
      ])
      const [existing] = await tx
        .insert(transactionsTable)
        .values(
          await bankRows(tx, {
            accountId: account.id,
            bookingDate: '2023-07-05',
            amountCents: -4230,
            balanceAfterCents: 12_345,
            rawLabel: csvLabel,
            kind: 'expense',
            dedupeHash: hash,
          }),
        )
        .returning()

      const result = await importHistory(tx, input(specs))
      expect(result.accounts[0]).toMatchObject({
        created: false,
        accountId: account.id,
        new: 14,
        conflict: 1,
        inserted: 14,
      })
      expect(result.conflicts).toEqual([
        {
          accountCode: 'CC',
          lineNumber: 4,
          existingId: existing.id,
          reason: 'Same amount, same day, same merchant',
          inserted: false,
        },
      ])
      const sameDay = (await accountTransactions(tx, account.id)).filter(
        (r) => r.bookingDate === '2023-07-05',
      )
      expect(sameDay.map((r) => r.id)).toEqual([existing.id])

      // Opt-in: inserted anyway, flagged for review.
      const forced = await importHistory(
        tx,
        input(specs, { includeConflicts: true }),
      )
      expect(forced.accounts[0]).toMatchObject({ conflict: 1, inserted: 1 })
      const after = (await accountTransactions(tx, account.id)).filter(
        (r) => r.bookingDate === '2023-07-05',
      )
      expect(after).toHaveLength(2)
      expect(after.find((r) => r.id !== existing.id)!.needsReview).toBe(true)
    })
  })

  it('upserts month-end balance snapshots', async () => {
    await inRollback(async (tx) => {
      const specs = uniqueSpecs()
      const first = await importHistory(
        tx,
        input(specs, { balances: BALANCES }),
      )
      expect(first.snapshots).toEqual({
        inserted: 7,
        updated: 0,
        unchanged: 0,
        unmappedColumns: [],
        perAccount: [
          { code: 'CC', name: specs[0].name, snapshots: 3 },
          { code: 'LA', name: specs[1].name, snapshots: 2 },
          { code: 'LJ', name: specs[2].name, snapshots: 2 },
        ],
      })
      // The Livret Jeune has balances only: its account is created too.
      expect(first.accounts.map((a) => a.code)).toEqual(['CC', 'LA', 'LJ'])

      const checkingId = first.accounts[0].accountId
      const snapshots = await tx
        .select()
        .from(balanceSnapshotsTable)
        .where(eq(balanceSnapshotsTable.accountId, checkingId))
        .orderBy(asc(balanceSnapshotsTable.date))
      expect(snapshots.map((s) => [s.date, s.valueCents])).toEqual([
        ['2023-07-31', 2800],
        ['2023-08-31', 101_240],
        ['2023-09-30', -1200],
      ])

      const changed = {
        ...BALANCES,
        rows: BALANCES.rows.map((row) =>
          row.date === '2023-09-30'
            ? {
                ...row,
                values: row.values.map((v) =>
                  v.column === 'Compte courant'
                    ? { ...v, valueCents: 4200 }
                    : v,
                ),
              }
            : row,
        ),
      }
      const second = await importHistory(
        tx,
        input(specs, { balances: changed }),
      )
      expect(second.snapshots).toMatchObject({
        inserted: 0,
        updated: 1,
        unchanged: 6,
      })
      const [september] = await tx
        .select()
        .from(balanceSnapshotsTable)
        .where(
          and(
            eq(balanceSnapshotsTable.accountId, checkingId),
            eq(balanceSnapshotsTable.date, '2023-09-30'),
          ),
        )
      expect(september.valueCents).toBe(4200)
    })
  })

  it('reports balance columns that map to no account', async () => {
    await inRollback(async (tx) => {
      const specs = uniqueSpecs().filter((s) => s.code !== 'LJ')
      const result = await importHistory(
        tx,
        input(specs, { balances: BALANCES }),
      )
      expect(result.snapshots).toMatchObject({
        inserted: 5,
        unmappedColumns: ['Livret Jeune'],
      })
    })
  })

  it('creates the bootstrapped rules at the end, once', async () => {
    await inRollback(async (tx) => {
      const specs = uniqueSpecs()
      const [category] = await tx
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.slug, 'leisure'))
      const [lastRule] = await tx
        .insert(categorizationRulesTable)
        .values({
          position: 1000,
          labelPattern: 'REGLE EXISTANTE FICTIVE',
          categoryId: category.id,
        })
        .returning()

      const dryRules = await importHistory(tx, input(specs))
      expect(dryRules.rules).toMatchObject({ created: 0 })
      expect(
        dryRules.rules.proposed.map((p) => [
          p.merchantKey,
          p.categorySlug,
          p.occurrences,
        ]),
      ).toEqual([['SUPERMARCHE EXEMPLE', 'groceries', 4]])

      const result = await importHistory(
        tx,
        input(specs, { createRules: true }),
      )
      expect(result.rules.created).toBe(1)
      const created = await tx
        .select()
        .from(categorizationRulesTable)
        .where(eq(categorizationRulesTable.labelPattern, 'SUPERMARCHE EXEMPLE'))
      expect(created).toHaveLength(1)
      expect(created[0].position).toBeGreaterThan(lastRule.position)
      expect(created[0]).toMatchObject({
        matchType: 'contains',
        enabled: true,
      })

      const again = await importHistory(tx, input(specs, { createRules: true }))
      expect(again.rules).toMatchObject({
        proposed: [],
        created: 0,
        skippedCovered: 1,
      })
    })
  })

  it('refuses an existing account of another type', async () => {
    await inRollback(async (tx) => {
      const specs = uniqueSpecs()
      await tx
        .insert(accountsTable)
        .values({ name: specs[0].name.toUpperCase(), type: 'savings' })
      await expect(importHistory(tx, input(specs))).rejects.toThrow(
        HistoryImportError,
      )
    })
  })

  it('writes nothing in a dry run', async () => {
    await inRollback(async (tx) => {
      const specs = uniqueSpecs()
      const result = await runHistoryImport(
        tx,
        input(specs, { balances: BALANCES, createRules: true }),
        { commit: false },
      )
      expect(result.accounts.map((a) => a.inserted)).toEqual([15, 1, 0])
      expect(result.rules.created).toBe(1)
      const leftovers = await tx
        .select()
        .from(accountsTable)
        .where(
          inArray(
            accountsTable.name,
            specs.map((s) => s.name),
          ),
        )
      expect(leftovers).toEqual([])
      const rules = await tx
        .select()
        .from(categorizationRulesTable)
        .where(eq(categorizationRulesTable.labelPattern, 'SUPERMARCHE EXEMPLE'))
      expect(rules).toEqual([])
    })
  })
})
