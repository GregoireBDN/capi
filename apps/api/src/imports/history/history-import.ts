import { eq, inArray, max, sql } from 'drizzle-orm'
import {
  accountsTable,
  balanceSnapshotsTable,
  categoriesTable,
  categorizationRulesTable,
  importsTable,
  type InsertTransaction,
  type SelectCategory,
  type TransactionKind,
  transactionsTable,
} from '#/database/schema'
import {
  classifyRows,
  computeDedupeHashes,
  type RowStatus,
} from '#/imports/dedupe/dedupe'
import {
  type DedupeExecutor,
  loadExistingForRange,
} from '#/imports/dedupe/dedupe.repository'
import { normalizeLabel } from '#/imports/normalize/label'
import type { ParseIssue } from '#/imports/parsers/parsed-row'
import {
  createProposedRules,
  type ProposedRule,
  proposeRules,
  type RuleBootstrapRow,
} from './bootstrap-rules'
import type {
  HistoryBalancesParseResult,
  HistoryTransactionRow,
  HistoryTransactionsParseResult,
} from './history-csv.parser'
import {
  type AccountSpec,
  accountForBalanceColumn,
  DEFAULT_ACCOUNT_SPECS,
  DEFAULT_SHEET_CATEGORIES,
  mapCategory,
  type ReviewReason,
  type SheetCategoryMapping,
} from './mapping'

/**
 * One-shot import of the spreadsheet history (#13): transactions, month-end
 * balance snapshots and bootstrapped categorization rules, all written through
 * the executor it is given, so the caller decides whether the transaction is
 * committed or rolled back (dry run).
 *
 * Idempotent: rows are deduplicated with the same hashes as bank imports, so
 * a second run inserts nothing; rows that probably are a transaction already
 * imported from another source (a CIC CSV) are conflicts and are never
 * inserted unless `includeConflicts` is set. Results hold counts, line numbers
 * and ids only, plus merchant keys and slugs for the report: never raw labels
 * or amounts.
 */

export class HistoryImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HistoryImportError'
  }
}

export interface HistoryImportInput {
  transactions: HistoryTransactionsParseResult
  /** Recorded on the `imports` rows. */
  transactionsFile: { name: string; sha256: string }
  balances?: HistoryBalancesParseResult | null
  accountSpecs?: readonly AccountSpec[]
  categoryMappings?: Readonly<Record<string, SheetCategoryMapping>>
  /** Insert probable duplicates too (flagged for review). */
  includeConflicts?: boolean
  /** Save the proposed rules; otherwise they are only returned. */
  createRules?: boolean
  now?: Date
}

export interface AccountImportResult {
  code: string
  accountId: string
  name: string
  created: boolean
  rows: number
  new: number
  duplicate: number
  conflict: number
  inserted: number
  needsReview: number
  importId: string | null
  periodStart: string | null
  periodEnd: string | null
}

export interface ConflictDetail {
  accountCode: string
  lineNumber: number
  existingId: string
  reason: string
  inserted: boolean
}

export interface CategoryMappingCount {
  /** Sheet `Catégorie` slug, null when empty. */
  sheetSlug: string | null
  /** Seeded category slug, null when uncategorized. */
  categorySlug: string | null
  kind: TransactionKind
  count: number
}

export interface SnapshotResult {
  inserted: number
  updated: number
  unchanged: number
  /** Balance columns no account maps to (skipped). */
  unmappedColumns: string[]
  perAccount: { code: string; name: string; snapshots: number }[]
}

export interface ProposedRuleSummary extends ProposedRule {
  categorySlug: string
}

export interface HistoryImportResult {
  /** Valid rows in the transactions file. */
  rows: number
  parseIssues: ParseIssue[]
  balanceParseIssues: ParseIssue[]
  accounts: AccountImportResult[]
  /** Rows skipped because their `Compte` code maps to no account. */
  unmappedAccountCodes: { code: string; rows: number }[]
  /** Inserted rows flagged for review. */
  needsReview: number
  /** Why rows (all mapped rows, inserted or not) are flagged for review. */
  reviewReasons: Partial<Record<ReviewReason, number>>
  categoryMapping: CategoryMappingCount[]
  /** Sheet slugs with no mapping, with their row counts. */
  unmappedCategories: { sheetSlug: string; rows: number }[]
  unknownGroups: { group: string; rows: number }[]
  conflicts: ConflictDetail[]
  snapshots: SnapshotResult | null
  rules: {
    proposed: ProposedRuleSummary[]
    created: number
    skippedCovered: number
    skippedTooBroad: number
  }
}

/** Rows per INSERT statement. */
const INSERT_CHUNK_SIZE = 500

interface MappedRow {
  source: HistoryTransactionRow
  spec: AccountSpec
  merchant: string | null
  merchantKey: string | null
  categorySlug: string | null
  kind: TransactionKind
  needsReview: boolean
}

export async function importHistory(
  tx: DedupeExecutor,
  input: HistoryImportInput,
): Promise<HistoryImportResult> {
  const specs = input.accountSpecs ?? DEFAULT_ACCOUNT_SPECS
  const mappings = input.categoryMappings ?? DEFAULT_SHEET_CATEGORIES
  const now = input.now ?? new Date()

  const categories = await tx.select().from(categoriesTable)
  if (categories.length === 0) {
    throw new HistoryImportError(
      'No categories found: run `pnpm db:seed` first',
    )
  }
  const categoriesBySlug = new Map(categories.map((c) => [c.slug, c]))
  const categoriesById = new Map(categories.map((c) => [c.id, c]))
  const categoryKinds = new Map(categories.map((c) => [c.slug, c.kind]))

  // 1. Map rows to accounts and categories.
  const specsByCode = new Map(specs.map((s) => [s.code, s]))
  const unmappedCodes = new Map<string, number>()
  const reviewReasons: Partial<Record<ReviewReason, number>> = {}
  const mappingCounts = new Map<string, CategoryMappingCount>()
  const unmappedCategories = new Map<string, number>()
  const unknownGroups = new Map<string, number>()
  const mapped: MappedRow[] = []

  for (const row of input.transactions.rows) {
    const spec = specsByCode.get(row.accountCode)
    if (!spec) {
      increment(unmappedCodes, row.accountCode)
      continue
    }
    const category = mapCategory(row, mappings, categoryKinds)
    const label = normalizeLabel(row.rawLabel, row.amountCents)
    mapped.push({
      source: row,
      spec,
      merchant: label.merchant,
      merchantKey: label.merchantKey,
      categorySlug: category.categorySlug,
      kind: category.kind,
      needsReview: category.needsReview,
    })

    if (category.reviewReason) {
      reviewReasons[category.reviewReason] =
        (reviewReasons[category.reviewReason] ?? 0) + 1
    }
    if (row.categorySlug !== null && !mappings[row.categorySlug]) {
      increment(unmappedCategories, row.categorySlug)
    }
    if (row.unknownGroup !== null) increment(unknownGroups, row.unknownGroup)
    const key = `${row.categorySlug}\n${category.categorySlug}\n${category.kind}`
    const entry = mappingCounts.get(key) ?? {
      sheetSlug: row.categorySlug,
      categorySlug: category.categorySlug,
      kind: category.kind,
      count: 0,
    }
    entry.count++
    mappingCounts.set(key, entry)
  }

  // 2. Accounts that receive rows or balances.
  const neededCodes = new Set(mapped.map((r) => r.spec.code))
  const columnSpecs = new Map<string, AccountSpec>()
  const unmappedColumns: string[] = []
  for (const column of input.balances?.columns ?? []) {
    const hasValues = input.balances!.rows.some((r) =>
      r.values.some((v) => v.column === column),
    )
    const spec = accountForBalanceColumn(specs, column)
    if (!spec) {
      if (hasValues) unmappedColumns.push(column)
      continue
    }
    if (!hasValues) continue
    columnSpecs.set(column, spec)
    neededCodes.add(spec.code)
  }
  const accounts = new Map<string, { id: string; created: boolean }>()
  for (const spec of specs) {
    if (neededCodes.has(spec.code)) {
      accounts.set(spec.code, await findOrCreateAccount(tx, spec))
    }
  }

  // 3. Transactions, account by account.
  const accountResults: AccountImportResult[] = []
  const conflicts: ConflictDetail[] = []
  let needsReview = 0
  for (const spec of specs) {
    const account = accounts.get(spec.code)
    if (!account) continue
    const rows = mapped.filter((r) => r.spec.code === spec.code)
    const result = await importAccountRows(tx, {
      spec,
      account,
      rows,
      categoriesBySlug,
      input,
      now,
      conflicts,
    })
    needsReview += result.needsReview
    accountResults.push(result)
  }

  // 4. Month-end balances.
  const snapshots = input.balances
    ? await upsertSnapshots(tx, input.balances, columnSpecs, accounts, now)
    : null
  if (snapshots) snapshots.unmappedColumns = unmappedColumns

  // 5. Rules from the file rows (inserted or already present).
  const existingRules = await tx.select().from(categorizationRulesTable)
  const bootstrapRows: RuleBootstrapRow[] = mapped.map((r) => ({
    accountId: accounts.get(r.spec.code)!.id,
    rawLabel: r.source.rawLabel,
    merchant: r.merchant,
    merchantKey: r.merchantKey,
    amountCents: r.source.amountCents,
    categoryId:
      r.categorySlug === null ? null : categoriesBySlug.get(r.categorySlug)!.id,
    kind: r.kind,
    needsReview: r.needsReview,
  }))
  const proposal = proposeRules(bootstrapRows, existingRules, categoriesById)
  const created = input.createRules
    ? await createProposedRules(tx, proposal.proposed)
    : []

  return {
    rows: input.transactions.rows.length,
    parseIssues: input.transactions.issues,
    balanceParseIssues: input.balances?.issues ?? [],
    accounts: accountResults,
    unmappedAccountCodes: sortedCounts(unmappedCodes).map(([code, rows]) => ({
      code,
      rows,
    })),
    needsReview,
    reviewReasons,
    categoryMapping: [...mappingCounts.values()].sort(
      (a, b) =>
        b.count - a.count ||
        String(a.sheetSlug).localeCompare(String(b.sheetSlug)),
    ),
    unmappedCategories: sortedCounts(unmappedCategories).map(
      ([sheetSlug, rows]) => ({ sheetSlug, rows }),
    ),
    unknownGroups: sortedCounts(unknownGroups).map(([group, rows]) => ({
      group,
      rows,
    })),
    conflicts,
    snapshots,
    rules: {
      proposed: proposal.proposed.map((p) => ({
        ...p,
        categorySlug: categoriesById.get(p.categoryId)!.slug,
      })),
      created: created.length,
      skippedCovered: proposal.skippedCovered,
      skippedTooBroad: proposal.skippedTooBroad,
    },
  }
}

async function importAccountRows(
  tx: DedupeExecutor,
  ctx: {
    spec: AccountSpec
    account: { id: string; created: boolean }
    rows: MappedRow[]
    categoriesBySlug: Map<string, SelectCategory>
    input: HistoryImportInput
    now: Date
    conflicts: ConflictDetail[]
  },
): Promise<AccountImportResult> {
  const { spec, account, rows, input } = ctx
  const result: AccountImportResult = {
    code: spec.code,
    accountId: account.id,
    name: spec.name,
    created: account.created,
    rows: rows.length,
    new: 0,
    duplicate: 0,
    conflict: 0,
    inserted: 0,
    needsReview: 0,
    importId: null,
    periodStart: null,
    periodEnd: null,
  }
  if (rows.length === 0) return result

  const dates = rows.map((r) => r.source.bookingDate).sort()
  result.periodStart = dates[0]
  result.periodEnd = dates[dates.length - 1]

  const dedupeRows = rows.map((r) => ({
    bookingDate: r.source.bookingDate,
    amountCents: r.source.amountCents,
    rawLabel: r.source.rawLabel,
    merchantKey: r.merchantKey,
  }))
  const hashes = computeDedupeHashes(dedupeRows)
  const existing = await loadExistingForRange(
    tx,
    account.id,
    result.periodStart,
    result.periodEnd,
  )
  const statuses: RowStatus[] = classifyRows(dedupeRows, hashes, existing)

  const toInsert: { row: MappedRow; hash: string; conflict: boolean }[] = []
  statuses.forEach((status, i) => {
    result[status.status]++
    if (status.status === 'duplicate') return
    if (status.status === 'conflict') {
      ctx.conflicts.push({
        accountCode: spec.code,
        lineNumber: rows[i].source.lineNumber,
        existingId: status.existingId,
        reason: status.reason,
        inserted: input.includeConflicts === true,
      })
      if (!input.includeConflicts) return
    }
    toInsert.push({
      row: rows[i],
      hash: hashes[i],
      conflict: status.status === 'conflict',
    })
  })
  if (toInsert.length === 0) return result

  const [created] = await tx
    .insert(importsTable)
    .values({
      accountId: account.id,
      source: 'spreadsheet',
      fileName: input.transactionsFile.name.slice(0, 255),
      fileHash: input.transactionsFile.sha256,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      rowCount: rows.length,
      duplicateCount: result.duplicate,
    })
    .returning({ id: importsTable.id })
  result.importId = created.id

  const values: InsertTransaction[] = toInsert.map(
    ({ row, hash, conflict }) => {
      const needsReview = row.needsReview || conflict
      return {
        accountId: account.id,
        importId: created.id,
        bookingDate: row.source.bookingDate,
        valueDate: null,
        amountCents: row.source.amountCents,
        balanceAfterCents: null,
        rawLabel: row.source.rawLabel,
        merchant: row.merchant,
        kind: row.kind,
        categoryId:
          row.categorySlug === null
            ? null
            : ctx.categoriesBySlug.get(row.categorySlug)!.id,
        ruleId: null,
        needsReview,
        isOneOff: row.source.isOneOff,
        dedupeHash: hash,
      }
    },
  )
  for (let i = 0; i < values.length; i += INSERT_CHUNK_SIZE) {
    const chunk = values.slice(i, i + INSERT_CHUNK_SIZE)
    const inserted = await tx
      .insert(transactionsTable)
      .values(chunk)
      .onConflictDoNothing({
        target: [transactionsTable.accountId, transactionsTable.dedupeHash],
      })
      .returning({ needsReview: transactionsTable.needsReview })
    result.inserted += inserted.length
    result.needsReview += inserted.filter((r) => r.needsReview).length
  }

  await tx
    .update(importsTable)
    .set({ insertedCount: result.inserted, committedAt: ctx.now })
    .where(eq(importsTable.id, created.id))
  return result
}

/**
 * Finds the account by name (case-insensitive), or creates it at the end of
 * the account list.
 *
 * @throws {HistoryImportError} when several accounts have that name, or the
 * one found has another type (the mapping probably points at the wrong one).
 */
async function findOrCreateAccount(
  tx: DedupeExecutor,
  spec: AccountSpec,
): Promise<{ id: string; created: boolean }> {
  const found = await tx
    .select({ id: accountsTable.id, type: accountsTable.type })
    .from(accountsTable)
    .where(sql`lower(${accountsTable.name}) = lower(${spec.name})`)
  if (found.length > 1) {
    throw new HistoryImportError(
      `Several accounts are named "${spec.name}": rename one or map ${spec.code} to another name`,
    )
  }
  if (found.length === 1) {
    if (found[0].type !== spec.type) {
      throw new HistoryImportError(
        `Account "${spec.name}" exists with type ${found[0].type}, not ${spec.type}: fix the mapping of ${spec.code}`,
      )
    }
    return { id: found[0].id, created: false }
  }
  const [{ last }] = await tx
    .select({ last: max(accountsTable.position) })
    .from(accountsTable)
  const [account] = await tx
    .insert(accountsTable)
    .values({
      name: spec.name,
      type: spec.type,
      institution: spec.institution,
      position: (last ?? -1) + 1,
    })
    .returning({ id: accountsTable.id })
  return { id: account.id, created: true }
}

/** Upserts one snapshot per (account, month end); later rows of a month win. */
async function upsertSnapshots(
  tx: DedupeExecutor,
  balances: HistoryBalancesParseResult,
  columnSpecs: Map<string, AccountSpec>,
  accounts: Map<string, { id: string }>,
  now: Date,
): Promise<SnapshotResult> {
  const wanted = new Map<string, Map<string, number>>()
  for (const row of balances.rows) {
    for (const value of row.values) {
      const spec = columnSpecs.get(value.column)
      if (!spec) continue
      const accountId = accounts.get(spec.code)!.id
      const byDate = wanted.get(accountId) ?? new Map<string, number>()
      byDate.set(row.date, value.valueCents)
      wanted.set(accountId, byDate)
    }
  }

  const result: SnapshotResult = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    unmappedColumns: [],
    perAccount: [],
  }
  for (const spec of new Set(columnSpecs.values())) {
    const accountId = accounts.get(spec.code)!.id
    result.perAccount.push({
      code: spec.code,
      name: spec.name,
      snapshots: wanted.get(accountId)?.size ?? 0,
    })
  }
  if (wanted.size === 0) return result

  const existing = await tx
    .select({
      accountId: balanceSnapshotsTable.accountId,
      date: balanceSnapshotsTable.date,
      valueCents: balanceSnapshotsTable.valueCents,
    })
    .from(balanceSnapshotsTable)
    .where(inArray(balanceSnapshotsTable.accountId, [...wanted.keys()]))
  const existingValues = new Map(
    existing.map((s) => [`${s.accountId}\n${s.date}`, s.valueCents]),
  )

  const changes: { accountId: string; date: string; valueCents: number }[] = []
  for (const [accountId, byDate] of wanted) {
    for (const [date, valueCents] of byDate) {
      const current = existingValues.get(`${accountId}\n${date}`)
      if (current === undefined) result.inserted++
      else if (current !== valueCents) result.updated++
      else {
        result.unchanged++
        continue
      }
      changes.push({ accountId, date, valueCents })
    }
  }
  for (let i = 0; i < changes.length; i += INSERT_CHUNK_SIZE) {
    await tx
      .insert(balanceSnapshotsTable)
      .values(changes.slice(i, i + INSERT_CHUNK_SIZE))
      .onConflictDoUpdate({
        target: [balanceSnapshotsTable.accountId, balanceSnapshotsTable.date],
        set: {
          valueCents: sql`excluded.value_cents`,
          updatedAt: now,
        },
      })
  }
  return result
}

const ROLLBACK = Symbol('history-import-rollback')

/**
 * Runs the import in one database transaction (a savepoint when `db` is
 * already a transaction), committed only when `commit` is set: a dry run
 * computes everything (accounts, inserts, rules) and rolls it all back.
 */
export async function runHistoryImport(
  db: DedupeExecutor,
  input: HistoryImportInput,
  { commit }: { commit: boolean },
): Promise<HistoryImportResult> {
  let result: HistoryImportResult | undefined
  try {
    await db.transaction(async (tx) => {
      result = await importHistory(tx, input)
      if (!commit) throw ROLLBACK
    })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }
  return result!
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function sortedCounts(map: Map<string, number>): [string, number][] {
  return [...map.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )
}
