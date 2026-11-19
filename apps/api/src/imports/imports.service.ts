import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
} from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { createHash } from 'node:crypto'
import { isBankAccount } from '#/accounts/accounts.service'
import { CategorizationRulesService } from '#/categories/categorization-rules.service'
import { defaultKind } from '#/categories/rules/categorize'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  categorizationRulesTable,
  importsTable,
  type InsertTransaction,
  type SelectImport,
  transactionSplitsTable,
  transactionsTable,
} from '#/database/schema'
import {
  loadExistingForRange,
  loadPreviousBalance,
} from '#/imports/dedupe/dedupe.repository'
import {
  CicCsvFormatError,
  parseCicCsv,
} from '#/imports/parsers/cic-csv.parser'
import type { ParseResult } from '#/imports/parsers/parsed-row'
import {
  matchManualExpenses,
  unmatchedInPeriod,
} from '#/imports/reconcile/manual-match'
import {
  loadManualExpenses,
  noteFromManual,
  type StoredManualExpense,
} from '#/imports/reconcile/manual-match.repository'
import { RecurringService } from '#/recurring/recurring.service'
import { buildPreview, periodOf } from '#/imports/preview/build-preview'
import {
  PREVIEW_VERSION,
  type PreviewRow,
} from '#/imports/preview/preview.types'
import type {
  CommitImportDto,
  DeleteImportResultDto,
  ImportDetailDto,
  ImportSummaryDto,
  UploadSource,
} from './dto/import.dto'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** The database or an open transaction. */
type Executor = Db | Tx

/** Pending previews older than this are discarded when the next one is made. */
export const PENDING_PREVIEW_TTL_MS = 24 * 60 * 60 * 1000

/** Rows per `INSERT` on commit (well below the bind-parameter limit). */
const INSERT_CHUNK_SIZE = 500

const FILE_NAME_MAX = 255

export interface PreviewImportInput {
  accountId: string
  source?: UploadSource
  fileName: string
  buffer: Buffer
}

/** Import row without the (large) preview column. */
type ImportRecord = Omit<SelectImport, 'preview'>

const { preview: _preview, ...importColumns } = getTableColumns(importsTable)

/**
 * Import pipeline: upload → preview (nothing written but the pending import)
 * → commit (transactions written atomically) → optional undo.
 *
 * Never logs labels, amounts or balances: errors carry line numbers and
 * column names only.
 */
@Injectable()
export class ImportsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly rulesService: CategorizationRulesService,
    // Optional so the service can be built without it (tests, scripts).
    @Optional() private readonly recurringService?: RecurringService,
  ) {}

  private get db(): Db {
    return this.database.db
  }

  /**
   * Parses, classifies and categorizes a bank export and stores the result as
   * a pending import. No transaction is written.
   */
  async preview(input: PreviewImportInput): Promise<ImportDetailDto> {
    const source = input.source ?? 'cic_csv'
    const account = await this.findAccountForImport(input.accountId)

    const parsed = this.parse(source, input.buffer)
    const fileHash = createHash('sha256').update(input.buffer).digest('hex')
    const { periodStart, periodEnd } = periodOf(parsed.rows)

    const [existing, manual, previousBalanceCents, ruleSet] = await Promise.all(
      [
        periodStart && periodEnd
          ? loadExistingForRange(this.db, account.id, periodStart, periodEnd)
          : [],
        periodStart && periodEnd
          ? loadManualExpenses(this.db, account.id, periodStart, periodEnd)
          : [],
        periodStart
          ? loadPreviousBalance(this.db, account.id, periodStart)
          : null,
        this.rulesService.loadRuleSet(),
      ],
    )
    const { preview, counts } = buildPreview({
      accountId: account.id,
      rows: parsed.rows,
      issues: parsed.issues,
      existing,
      previousBalanceCents,
      ruleSet,
      manual,
    })

    const created = await this.db.transaction(async (tx) => {
      await this.discardStalePreviews(tx)
      const [row] = await tx
        .insert(importsTable)
        .values({
          accountId: account.id,
          source,
          fileName: cleanFileName(input.fileName),
          fileHash,
          periodStart,
          periodEnd,
          rowCount: counts.rows,
          newCount: counts.new,
          duplicateCount: counts.duplicates,
          conflictCount: counts.conflicts,
          issueCount: counts.issues,
          preview,
        })
        .returning()
      return row
    })
    return this.toDetail(created, account.name, this.db)
  }

  /**
   * Writes the rows the preview proposed, in one database transaction:
   * `new` rows, and `conflict` rows resolved as `import` (the others are
   * skipped). Rows stored by another import since the preview are counted as
   * duplicates (`ON CONFLICT DO NOTHING` on the dedupe hash).
   *
   * Expenses noted by hand are reconciled again against their current state
   * (one may have been noted, edited or deleted since the preview): a `new`
   * row matching one replaces it, keeping its category and note, and the
   * unmatched ones of the period are flagged for review.
   */
  async commit(id: string, dto: CommitImportDto): Promise<ImportDetailDto> {
    const detail = await this.db.transaction(async (tx) => {
      // Locks the import: a concurrent commit or undo waits, then sees the result.
      const [record] = await tx
        .select()
        .from(importsTable)
        .where(eq(importsTable.id, id))
        .for('update')
      if (!record) throw new NotFoundException('Import not found')
      if (record.committedAt) {
        throw new ConflictException('This import was already committed')
      }
      const preview = record.preview
      if (!preview || preview.version !== PREVIEW_VERSION) {
        throw new ConflictException(
          'This preview is outdated: upload the file again',
        )
      }

      const rows = preview.rows
      const resolutions = indexByRow(
        dto.conflictResolutions ?? [],
        rows.length,
        'conflictResolutions',
      )
      for (const [rowIndex] of resolutions) {
        if (rows[rowIndex].status !== 'conflict') {
          throw new BadRequestException(
            `conflictResolutions: row ${rowIndex} is not a conflict`,
          )
        }
      }
      const overrides = indexByRow(
        dto.categoryOverrides ?? [],
        rows.length,
        'categoryOverrides',
      )

      const toInsert = rows.filter(
        (row) =>
          row.status === 'new' ||
          (row.status === 'conflict' &&
            resolutions.get(row.index)?.action === 'import'),
      )
      const skipped = rows.filter(
        (row) =>
          row.status === 'conflict' &&
          resolutions.get(row.index)?.action !== 'import',
      ).length

      const manual =
        record.periodStart && record.periodEnd
          ? await loadManualExpenses(
              tx,
              record.accountId,
              record.periodStart,
              record.periodEnd,
              { lock: true },
            )
          : []
      const manualById = new Map(manual.map((m) => [m.id, m]))
      const matches = matchManualExpenses(
        toInsert.map((row) => (row.status === 'new' ? row : null)),
        manual,
      )
      const replaced = new Map<number, StoredManualExpense>()
      toInsert.forEach((row, k) => {
        const id = matches[k]
        if (id !== null) replaced.set(row.index, manualById.get(id)!)
      })

      const values = await this.transactionValues(
        tx,
        record,
        toInsert,
        new Map([...overrides].map(([i, o]) => [i, o.categoryId])),
        replaced,
      )
      // Bank row (by dedupe hash) replacing each manual transaction.
      const replacing = new Map<string, string>()
      toInsert.forEach((row) => {
        const manualRow = replaced.get(row.index)
        if (manualRow) replacing.set(row.dedupeHash, manualRow.id)
      })
      let inserted = 0
      for (let start = 0; start < values.length; start += INSERT_CHUNK_SIZE) {
        const written = await tx
          .insert(transactionsTable)
          .values(values.slice(start, start + INSERT_CHUNK_SIZE))
          .onConflictDoNothing({
            target: [transactionsTable.accountId, transactionsTable.dedupeHash],
          })
          .returning({
            id: transactionsTable.id,
            dedupeHash: transactionsTable.dedupeHash,
          })
        inserted += written.length
        // The split of a manual transaction moves to its bank row (same
        // amount, so the parts still sum to it).
        for (const row of written) {
          const manualId = replacing.get(row.dedupeHash)
          if (manualId === undefined) continue
          await tx
            .update(transactionSplitsTable)
            .set({ transactionId: row.id })
            .where(eq(transactionSplitsTable.transactionId, manualId))
        }
      }

      await this.settleManualExpenses(tx, record, manual, replaced)

      const previewDuplicates = rows.filter(
        (row) => row.status === 'duplicate',
      ).length
      const [committed] = await tx
        .update(importsTable)
        .set({
          insertedCount: inserted,
          duplicateCount: previewDuplicates + (values.length - inserted),
          skippedCount: skipped,
          committedAt: new Date(),
          preview: null,
        })
        .where(eq(importsTable.id, id))
        .returning()
      const accountName = await this.accountName(tx, committed.accountId)
      return this.toDetail(committed, accountName, tx)
    })
    // New transactions may start, continue or end recurring series.
    this.recurringService?.detectInBackground()
    return detail
  }

  /** Every import, newest first, without rows. */
  async list(): Promise<ImportSummaryDto[]> {
    const rows = await this.db
      .select({ ...importColumns, accountName: accountsTable.name })
      .from(importsTable)
      .innerJoin(accountsTable, eq(accountsTable.id, importsTable.accountId))
      .orderBy(desc(importsTable.createdAt), desc(importsTable.id))
    return rows.map(({ accountName, ...record }) =>
      toSummary(record, accountName),
    )
  }

  async findOne(id: string): Promise<ImportDetailDto> {
    const [row] = await this.db
      .select({
        ...getTableColumns(importsTable),
        accountName: accountsTable.name,
      })
      .from(importsTable)
      .innerJoin(accountsTable, eq(accountsTable.id, importsTable.accountId))
      .where(eq(importsTable.id, id))
    if (!row) throw new NotFoundException('Import not found')
    const { accountName, ...record } = row
    return this.toDetail(record, accountName, this.db)
  }

  /**
   * Discards a pending import, or undoes a committed one: the import and the
   * transactions it wrote are deleted.
   */
  async remove(id: string): Promise<DeleteImportResultDto> {
    const result = await this.db.transaction(async (tx) => {
      const [record] = await tx
        .select({ id: importsTable.id, committedAt: importsTable.committedAt })
        .from(importsTable)
        .where(eq(importsTable.id, id))
        .for('update')
      if (!record) throw new NotFoundException('Import not found')

      // Explicit rather than through the cascade, to count them.
      const removed = await tx
        .delete(transactionsTable)
        .where(eq(transactionsTable.importId, id))
        .returning({ id: transactionsTable.id })
      await tx.delete(importsTable).where(eq(importsTable.id, id))
      return {
        id,
        result: record.committedAt
          ? ('undone' as const)
          : ('discarded' as const),
        removedTransactions: removed.length,
      }
    })
    // Removed transactions may end or shorten recurring series.
    if (result.result === 'undone') this.recurringService?.detectInBackground()
    return result
  }

  // --- Helpers --------------------------------------------------------------

  private async findAccountForImport(accountId: string) {
    const [account] = await this.db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.id, accountId))
      .limit(1)
    if (!account) {
      throw new BadRequestException('accountId does not match any account')
    }
    if (!isBankAccount(account)) {
      throw new BadRequestException(
        'Bank exports can only be imported into a checking or savings account',
      )
    }
    if (account.archivedAt) {
      throw new BadRequestException('Cannot import into an archived account')
    }
    return account
  }

  private parse(source: UploadSource, buffer: Buffer): ParseResult {
    switch (source) {
      case 'cic_csv':
        try {
          return parseCicCsv(buffer)
        } catch (error) {
          // The message names columns only, never file contents.
          if (error instanceof CicCsvFormatError) {
            throw new BadRequestException(error.message)
          }
          throw error
        }
    }
  }

  /** Lazy clean-up: pending previews nobody committed within the TTL. */
  private async discardStalePreviews(executor: Executor): Promise<void> {
    await executor
      .delete(importsTable)
      .where(
        and(
          isNull(importsTable.committedAt),
          lt(
            importsTable.createdAt,
            new Date(Date.now() - PENDING_PREVIEW_TTL_MS),
          ),
        ),
      )
  }

  /**
   * Deletes the manual expenses replaced by bank rows and flags for review
   * the ones of the period left unmatched (`unmatchedInPeriod`).
   */
  private async settleManualExpenses(
    tx: Tx,
    record: SelectImport,
    manual: StoredManualExpense[],
    replaced: Map<number, StoredManualExpense>,
  ): Promise<void> {
    const replacedIds = new Set([...replaced.values()].map((m) => m.id))
    if (replacedIds.size > 0) {
      await tx
        .delete(transactionsTable)
        .where(
          and(
            inArray(transactionsTable.id, [...replacedIds]),
            eq(transactionsTable.manual, true),
          ),
        )
    }
    if (!record.periodStart || !record.periodEnd) return
    const unmatched = unmatchedInPeriod(
      manual,
      replacedIds,
      record.periodStart,
      record.periodEnd,
    )
    if (unmatched.length > 0) {
      await tx
        .update(transactionsTable)
        .set({ needsReview: true })
        .where(
          inArray(
            transactionsTable.id,
            unmatched.map((m) => m.id),
          ),
        )
    }
  }

  /**
   * Transactions to insert. A row replacing a manual expense takes its
   * category, kind, note and one-off flag. A category chosen in the preview
   * replaces the proposed one and clears the review flag. A category or rule deleted since
   * the preview is dropped (the row goes back to the review queue) rather
   * than failing the commit on its foreign key.
   */
  private async transactionValues(
    tx: Tx,
    record: SelectImport,
    rows: PreviewRow[],
    overrides: Map<number, string>,
    replaced: Map<number, StoredManualExpense> = new Map(),
  ): Promise<InsertTransaction[]> {
    const categoryIds = new Set<string>(overrides.values())
    const ruleIds = new Set<string>()
    for (const row of rows) {
      if (row.categoryId) categoryIds.add(row.categoryId)
      if (row.ruleId) ruleIds.add(row.ruleId)
    }
    const [categories, rules] = await Promise.all([
      categoryIds.size > 0
        ? tx
            .select({ id: categoriesTable.id, kind: categoriesTable.kind })
            .from(categoriesTable)
            .where(inArray(categoriesTable.id, [...categoryIds]))
        : [],
      ruleIds.size > 0
        ? tx
            .select({ id: categorizationRulesTable.id })
            .from(categorizationRulesTable)
            .where(inArray(categorizationRulesTable.id, [...ruleIds]))
        : [],
    ])
    const kinds = new Map(categories.map((c) => [c.id, c.kind]))
    const knownRules = new Set(rules.map((r) => r.id))
    for (const categoryId of new Set(overrides.values())) {
      if (!kinds.has(categoryId)) {
        throw new BadRequestException(
          'categoryOverrides: categoryId does not match any category',
        )
      }
    }

    return rows.map((row) => {
      const manual = replaced.get(row.index)
      const base = {
        accountId: record.accountId,
        importId: record.id,
        bookingDate: row.bookingDate,
        valueDate: row.valueDate,
        amountCents: row.amountCents,
        balanceAfterCents: row.balanceAfterCents,
        rawLabel: row.rawLabel,
        merchant: row.merchant,
        dedupeHash: row.dedupeHash,
        ...(manual
          ? { note: noteFromManual(manual), isOneOff: manual.isOneOff }
          : {}),
      }
      const override = overrides.get(row.index)
      if (override) {
        return {
          ...base,
          categoryId: override,
          ruleId: null,
          kind: kinds.get(override)!,
          needsReview: false,
        }
      }
      if (manual) {
        // The category is the manual expense's current one (it is a foreign
        // key: it exists, or was deleted and is null).
        return {
          ...base,
          categoryId: manual.categoryId,
          ruleId: null,
          kind: manual.kind,
          needsReview: manual.categoryId === null,
        }
      }
      if (row.categoryId && !kinds.has(row.categoryId)) {
        return {
          ...base,
          categoryId: null,
          ruleId: null,
          kind: defaultKind(row.amountCents),
          needsReview: true,
        }
      }
      return {
        ...base,
        categoryId: row.categoryId,
        ruleId: row.ruleId && knownRules.has(row.ruleId) ? row.ruleId : null,
        kind: row.kind,
        needsReview: row.needsReview,
      }
    })
  }

  private async accountName(executor: Executor, accountId: string) {
    const [account] = await executor
      .select({ name: accountsTable.name })
      .from(accountsTable)
      .where(eq(accountsTable.id, accountId))
    return account.name
  }

  private async toDetail(
    record: SelectImport,
    accountName: string,
    executor: Executor,
  ): Promise<ImportDetailDto> {
    const [previous] = await executor
      .select({ id: importsTable.id, committedAt: importsTable.committedAt })
      .from(importsTable)
      .where(
        and(
          eq(importsTable.accountId, record.accountId),
          eq(importsTable.fileHash, record.fileHash),
          isNotNull(importsTable.committedAt),
          ne(importsTable.id, record.id),
        ),
      )
      .orderBy(desc(importsTable.committedAt))
      .limit(1)

    const preview = record.preview
    return {
      ...toSummary(record, accountName),
      alreadyImported: previous?.committedAt
        ? { importId: previous.id, committedAt: previous.committedAt }
        : null,
      preview: preview
        ? {
            previousBalanceCents: preview.previousBalanceCents,
            continuity: preview.continuity,
            issues: preview.issues,
            rows: preview.rows.map(({ dedupeHash: _hash, ...row }) => ({
              ...row,
              manualMatch: row.manualMatch ?? null,
            })),
            unmatchedManual: preview.unmatchedManual ?? [],
          }
        : null,
    }
  }
}

function toSummary(
  record: ImportRecord,
  accountName: string,
): ImportSummaryDto {
  return {
    id: record.id,
    accountId: record.accountId,
    accountName,
    source: record.source,
    fileName: record.fileName,
    status: record.committedAt ? 'committed' : 'pending',
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    counts: {
      rows: record.rowCount,
      new: record.newCount,
      duplicates: record.duplicateCount,
      conflicts: record.conflictCount,
      issues: record.issueCount,
      inserted: record.insertedCount,
      skipped: record.skippedCount,
    },
    createdAt: record.createdAt,
    committedAt: record.committedAt,
  }
}

/** Entries by row index; rejects out-of-range and repeated indexes. */
function indexByRow<T extends { rowIndex: number }>(
  entries: T[],
  rowCount: number,
  field: string,
): Map<number, T> {
  const byRow = new Map<number, T>()
  for (const entry of entries) {
    if (entry.rowIndex >= rowCount) {
      throw new BadRequestException(
        `${field}: row ${entry.rowIndex} does not exist`,
      )
    }
    if (byRow.has(entry.rowIndex)) {
      throw new BadRequestException(
        `${field}: row ${entry.rowIndex} is listed twice`,
      )
    }
    byRow.set(entry.rowIndex, entry)
  }
  return byRow
}

/** Base name only (browsers may send a path), bounded to the column size. */
function cleanFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop()?.trim() ?? ''
  return (base === '' ? 'upload.csv' : base).slice(0, FILE_NAME_MAX)
}
