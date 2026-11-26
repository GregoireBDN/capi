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
  lte,
  ne,
} from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { createHash } from 'node:crypto'
import { isBankAccount } from '#/accounts/accounts.service'
import { CategorizationRulesService } from '#/categories/categorization-rules.service'
import { defaultKind } from '#/categories/rules/categorize'
import { DatabaseService } from '#/database/database.service'
import { PREPAID_SUGGESTION_MIN_CENTS } from '#/recurring/prepaid'
import { prepaidSuggestions } from '#/recurring/prepaid-suggestions'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  importProfilesTable,
  categorizationRulesTable,
  importsTable,
  type InsertTransaction,
  type SelectImport,
  receivablePaymentsTable,
  receivablesTable,
  envelopeMovementsTable,
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
import type {
  ParseIssue,
  ParseResult,
  ParsedRow,
} from '#/imports/parsers/parsed-row'
import { detectFormat } from '#/imports/profiles/detect-format'
import { ImportProfilesService } from '#/imports/profiles/import-profiles.service'
import { parseCashCsv } from '#/imports/profiles/parse-with-profile'
import type { CsvProfile } from '#/imports/profiles/profile.types'
import { CsvFormatError, readCsvTable } from '#/imports/profiles/read-table'
import { standardProfileFor } from '#/imports/profiles/standard-format'
import {
  matchManualExpenses,
  unmatchedInPeriod,
} from '#/imports/reconcile/manual-match'
import {
  loadManualExpenses,
  noteFromManual,
  type StoredManualExpense,
} from '#/imports/reconcile/manual-match.repository'
import { restoreAbsorbedManual, undoImpact } from '#/imports/undo/import-undo'
import { deletePaymentsOfShares } from '#/owed/settled'
import { RecurringService } from '#/recurring/recurring.service'
import { linkMatchingTransfers } from '#/transactions/transfer-links/link-transfers'
import { buildPreview, periodOf } from '#/imports/preview/build-preview'
import {
  type ImportPreviewData,
  PREVIEW_VERSION,
  type PreviewRow,
} from '#/imports/preview/preview.types'
import type {
  CommitImportDto,
  FixImportLineDto,
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
  /** Omitted: recognised from the header (saved profile, CIC, standard). */
  source?: UploadSource
  /** A saved profile to read the file with (#431). */
  profileId?: string
  fileName: string
  buffer: Buffer
}

/** Start of the 400 message for a file no reader recognises. */
export const UNRECOGNISED_FORMAT_MESSAGE = 'Unrecognised CSV format'

/** The reader a file goes through. */
type Reader =
  | { source: 'cic_csv' }
  | { source: 'standard_csv'; profile: CsvProfile }
  | {
      source: 'csv_profile'
      profile: CsvProfile & { id: string; name: string }
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
    private readonly profilesService: ImportProfilesService,
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
    const account = await this.findAccountForImport(input.accountId)
    const reader = await this.readerFor(input)
    const source = reader.source
    const profileId = reader.source === 'csv_profile' ? reader.profile.id : null

    const parsed = this.parse(reader, input.buffer)
    const fileHash = createHash('sha256').update(input.buffer).digest('hex')
    const { periodStart, periodEnd } = periodOf(parsed.rows)

    const { preview, counts } = await this.classify(
      this.db,
      account.id,
      parsed.rows,
      parsed.issues,
    )
    preview.ignoredColumns = parsed.ignoredColumns ?? []

    const created = await this.db.transaction(async (tx) => {
      await this.discardStalePreviews(tx)
      if (profileId) {
        await tx
          .update(importProfilesTable)
          .set({ lastUsedAt: new Date() })
          .where(eq(importProfilesTable.id, profileId))
      }
      const [row] = await tx
        .insert(importsTable)
        .values({
          accountId: account.id,
          source,
          profileId,
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
      const insertedIds: string[] = []
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
        insertedIds.push(...written.map((row) => row.id))
        // The split of a manual transaction moves to its bank row (same
        // amount, so the parts still sum to it).
        for (const row of written) {
          const manualId = replacing.get(row.dedupeHash)
          if (manualId === undefined) continue
          await tx
            .update(transactionSplitsTable)
            .set({ transactionId: row.id })
            .where(eq(transactionSplitsTable.transactionId, manualId))
          // So do what is owed on it and the repayments linked to it (#359).
          await tx
            .update(receivablesTable)
            .set({ transactionId: row.id })
            .where(eq(receivablesTable.transactionId, manualId))
          await tx
            .update(receivablePaymentsTable)
            .set({ transactionId: row.id })
            .where(eq(receivablePaymentsTable.transactionId, manualId))
          // And what an envelope paid of it or carried with it (ADR 0008).
          await tx
            .update(envelopeMovementsTable)
            .set({ transactionId: row.id })
            .where(eq(envelopeMovementsTable.transactionId, manualId))
        }
      }

      await this.settleManualExpenses(tx, record, manual, replaced)
      // The other side of a transfer between two cash accounts (#296).
      await linkMatchingTransfers(tx, insertedIds)
      await this.flagYearlyFees(tx, insertedIds)

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

  /**
   * Types a line of a pending import that could not be read (#433), or
   * types again a line fixed before, then checks the whole file again:
   * dedupe (the occurrence index counts in file order), continuity,
   * reconciliation with manual expenses and the rules. Only unreadable
   * lines can be typed: a read row typed differently would get another
   * dedupe hash, and re-importing the file would bring it back twice.
   * Nothing is written but the pending import.
   */
  async fixLine(
    id: string,
    lineNumber: number,
    dto: FixImportLineDto,
  ): Promise<ImportDetailDto> {
    const rawLabel = dto.rawLabel.trim().replace(/\s+/g, ' ')
    if (rawLabel === '') {
      throw new BadRequestException('rawLabel must not be empty')
    }
    return this.reviseLines(id, (preview) => {
      const issue =
        preview.issues.find((i) => i.lineNumber === lineNumber) ??
        preview.rows.find((row) => row.lineNumber === lineNumber)?.fixedFrom
      if (!issue) throw this.notFixable(preview, lineNumber)
      return {
        drop: lineNumber,
        add: {
          row: {
            lineNumber,
            bookingDate: dto.bookingDate,
            valueDate: dto.valueDate ?? null,
            amountCents: dto.amountCents,
            balanceAfterCents: dto.balanceAfterCents ?? null,
            rawLabel,
          },
          fixedFrom: issue,
        },
      }
    })
  }

  /**
   * Puts a line typed in the preview back as unreadable (#433): it is left
   * out of the import again, and the file is checked again.
   */
  async unfixLine(id: string, lineNumber: number): Promise<ImportDetailDto> {
    return this.reviseLines(id, (preview) => {
      const row = preview.rows.find((r) => r.lineNumber === lineNumber)
      if (!row?.fixedFrom) {
        throw new NotFoundException(`Line ${lineNumber} was not typed by hand`)
      }
      return { drop: lineNumber, restore: row.fixedFrom }
    })
  }

  private notFixable(preview: ImportPreviewData, lineNumber: number) {
    return preview.rows.some((row) => row.lineNumber === lineNumber)
      ? new BadRequestException(
          `Line ${lineNumber} was read: only unreadable lines can be typed`,
        )
      : new NotFoundException(`No unreadable line ${lineNumber}`)
  }

  /**
   * Changes the lines of a pending import and classifies them again, under
   * the import's lock. `drop` leaves a line out of the rows and the issues;
   * `add` puts a typed row in; `restore` puts an issue back.
   */
  private async reviseLines(
    id: string,
    change: (preview: ImportPreviewData) => {
      drop: number
      add?: { row: ParsedRow; fixedFrom: ParseIssue }
      restore?: ParseIssue
    },
  ): Promise<ImportDetailDto> {
    return this.db.transaction(async (tx) => {
      const [record] = await tx
        .select()
        .from(importsTable)
        .where(eq(importsTable.id, id))
        .for('update')
      if (!record) throw new NotFoundException('Import not found')
      if (record.committedAt) {
        throw new ConflictException('This import was already committed')
      }
      const current = record.preview
      if (!current || current.version !== PREVIEW_VERSION) {
        throw new ConflictException(
          'This preview is outdated: upload the file again',
        )
      }
      const { drop, add, restore } = change(current)

      const fixedFrom = new Map<number, ParseIssue>()
      const rows: ParsedRow[] = []
      for (const row of current.rows) {
        if (row.lineNumber === drop) continue
        rows.push(toParsedRow(row))
        if (row.fixedFrom) fixedFrom.set(row.lineNumber, row.fixedFrom)
      }
      if (add) {
        rows.push(add.row)
        fixedFrom.set(add.row.lineNumber, add.fixedFrom)
      }
      rows.sort((a, b) => a.lineNumber - b.lineNumber)
      const issues = current.issues.filter((i) => i.lineNumber !== drop)
      if (restore) issues.push(restore)
      issues.sort((a, b) => a.lineNumber - b.lineNumber)

      const { preview, counts } = await this.classify(
        tx,
        record.accountId,
        rows,
        issues,
      )
      preview.ignoredColumns = current.ignoredColumns ?? []
      for (const row of preview.rows) {
        row.fixedFrom = fixedFrom.get(row.lineNumber) ?? null
      }
      const { periodStart, periodEnd } = periodOf(rows)
      const [updated] = await tx
        .update(importsTable)
        .set({
          periodStart,
          periodEnd,
          rowCount: counts.rows,
          newCount: counts.new,
          duplicateCount: counts.duplicates,
          conflictCount: counts.conflicts,
          issueCount: counts.issues,
          preview,
        })
        .where(eq(importsTable.id, id))
        .returning()
      return this.toDetail(
        updated,
        await this.accountName(tx, record.accountId),
        tx,
      )
    })
  }

  /**
   * Classifies parsed rows against the account as it is now: the stored
   * transactions around their dates, the balance they continue from, the
   * manual expenses to reconcile and the rules.
   */
  private async classify(
    executor: Executor,
    accountId: string,
    rows: ParsedRow[],
    issues: ParseIssue[],
  ) {
    const { periodStart, periodEnd } = periodOf(rows)
    const [existing, manual, previousBalanceCents, ruleSet] = await Promise.all(
      [
        periodStart && periodEnd
          ? loadExistingForRange(executor, accountId, periodStart, periodEnd)
          : [],
        periodStart && periodEnd
          ? loadManualExpenses(executor, accountId, periodStart, periodEnd)
          : [],
        periodStart
          ? loadPreviousBalance(executor, accountId, periodStart)
          : null,
        this.rulesService.loadRuleSet(),
      ],
    )
    return buildPreview({
      accountId,
      rows,
      issues,
      existing,
      previousBalanceCents,
      ruleSet,
      manual,
    })
  }

  /** Every import, newest first, without rows. */
  async list(): Promise<ImportSummaryDto[]> {
    const rows = await this.db
      .select({
        ...importColumns,
        accountName: accountsTable.name,
        profileName: importProfilesTable.name,
      })
      .from(importsTable)
      .innerJoin(accountsTable, eq(accountsTable.id, importsTable.accountId))
      .leftJoin(
        importProfilesTable,
        eq(importProfilesTable.id, importsTable.profileId),
      )
      .orderBy(desc(importsTable.createdAt), desc(importsTable.id))
    return rows.map(({ accountName, profileName, ...record }) =>
      toSummary(record, accountName, profileName),
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
   * transactions it wrote are deleted, with what was done on them by hand
   * (counted beforehand in the detail's `undo`). The manual transactions its
   * rows absorbed on reconciliation are put back first (#371).
   */
  async remove(id: string): Promise<DeleteImportResultDto> {
    const result = await this.db.transaction(async (tx) => {
      const [record] = await tx
        .select({ id: importsTable.id, committedAt: importsTable.committedAt })
        .from(importsTable)
        .where(eq(importsTable.id, id))
        .for('update')
      if (!record) throw new NotFoundException('Import not found')

      const restoredManual = record.committedAt
        ? await restoreAbsorbedManual(tx, id)
        : 0
      // Shares on the rows go with them, repayments included (counted in
      // the warning); the database refuses that anywhere else (#438).
      await deletePaymentsOfShares(
        tx,
        tx
          .select({ id: transactionsTable.id })
          .from(transactionsTable)
          .where(eq(transactionsTable.importId, id)),
      )
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
        restoredManual,
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

  /**
   * The reader of an upload: the profile asked for, the source asked for, or
   * the format recognised from the header (a saved profile first, then the
   * CIC export, then the standard format).
   */
  private async readerFor(input: PreviewImportInput): Promise<Reader> {
    if (input.profileId !== undefined) {
      if (input.source !== undefined && input.source !== 'csv_profile') {
        throw new BadRequestException(
          'profileId goes with the csv_profile source only',
        )
      }
      const profile = await this.profilesService.findStored(input.profileId)
      return { source: 'csv_profile', profile }
    }
    switch (input.source) {
      case 'cic_csv':
        return { source: 'cic_csv' }
      case 'csv_profile':
        throw new BadRequestException(
          'The csv_profile source needs a profileId',
        )
      case 'standard_csv': {
        const profile = this.standardProfile(input.buffer)
        if (!profile) {
          throw new BadRequestException(
            'Not the standard format: the header needs date, amount and label columns',
          )
        }
        return { source: 'standard_csv', profile }
      }
      case undefined: {
        const detected = detectFormat(
          input.buffer,
          await this.profilesService.loadAll(),
        )
        if (!detected) {
          throw new BadRequestException(
            `${UNRECOGNISED_FORMAT_MESSAGE}: neither a CIC export, the standard format nor a saved profile`,
          )
        }
        return detected
      }
    }
  }

  private standardProfile(buffer: Buffer): CsvProfile | null {
    try {
      const table = readCsvTable(buffer, { encoding: null, delimiter: null })
      return standardProfileFor(table.headerKeys)
    } catch (error) {
      if (error instanceof CsvFormatError) {
        throw new BadRequestException(error.message)
      }
      throw error
    }
  }

  /** Parses with the reader; format errors become 400s naming columns only. */
  private parse(reader: Reader, buffer: Buffer): ParseResult {
    try {
      if (reader.source === 'cic_csv') return parseCicCsv(buffer)
      if (reader.profile.target !== 'cash') {
        throw new BadRequestException(
          'This file holds investment movements: it cannot be imported into a bank account',
        )
      }
      return parseCashCsv(buffer, reader.profile)
    } catch (error) {
      // The messages name columns only, never file contents.
      if (
        error instanceof CicCsvFormatError ||
        error instanceof CsvFormatError
      ) {
        throw new BadRequestException(error.message)
      }
      throw error
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
   * Flags for review the new large debits whose merchant was charged once
   * about a year before (#439): a yearly fee's second charge, offered as
   * « Prépayé 12 mois ? » in the review queue.
   */
  private async flagYearlyFees(tx: Tx, insertedIds: string[]): Promise<void> {
    if (insertedIds.length === 0) return
    const rows = await tx
      .select({
        id: transactionsTable.id,
        accountId: transactionsTable.accountId,
        bookingDate: transactionsTable.bookingDate,
        amountCents: transactionsTable.amountCents,
        rawLabel: transactionsTable.rawLabel,
        kind: transactionsTable.kind,
        prepaidItemId: transactionsTable.prepaidItemId,
      })
      .from(transactionsTable)
      .where(
        and(
          inArray(transactionsTable.id, insertedIds),
          eq(transactionsTable.kind, 'expense'),
          lte(transactionsTable.amountCents, -PREPAID_SUGGESTION_MIN_CENTS),
        ),
      )
    const suggestions = await prepaidSuggestions(tx, rows)
    const renewals = [...suggestions]
      .filter(([, suggestion]) => suggestion.kind === 'renewal')
      .map(([id]) => id)
    if (renewals.length === 0) return
    await tx
      .update(transactionsTable)
      .set({ needsReview: true })
      .where(inArray(transactionsTable.id, renewals))
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
            .select({
              id: categorizationRulesTable.id,
              counterpartAccountId:
                categorizationRulesTable.counterpartAccountId,
            })
            .from(categorizationRulesTable)
            .where(inArray(categorizationRulesTable.id, [...ruleIds]))
        : [],
    ])
    const kinds = new Map(categories.map((c) => [c.id, c.kind]))
    const knownRules = new Map(rules.map((r) => [r.id, r.counterpartAccountId]))
    /** A rule's destination account, on a transfer to another account. */
    const ruleCounterpart = (ruleId: string | null, kind: string) => {
      const counterpart = ruleId ? knownRules.get(ruleId) : null
      return kind === 'transfer' &&
        counterpart &&
        counterpart !== record.accountId
        ? counterpart
        : null
    }
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
          ? {
              note: noteFromManual(manual),
              isOneOff: manual.isOneOff,
              absorbedManual: {
                bookingDate: manual.bookingDate,
                rawLabel: manual.rawLabel,
                note: manual.note,
              },
            }
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
          counterpartAccountId:
            manual.kind === 'transfer' ? manual.counterpartAccountId : null,
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
      const ruleId =
        row.ruleId && knownRules.has(row.ruleId) ? row.ruleId : null
      return {
        ...base,
        categoryId: row.categoryId,
        ruleId,
        kind: row.kind,
        needsReview: row.needsReview,
        counterpartAccountId: ruleCounterpart(ruleId, row.kind),
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

    const [profile] = record.profileId
      ? await executor
          .select({ name: importProfilesTable.name })
          .from(importProfilesTable)
          .where(eq(importProfilesTable.id, record.profileId))
      : []

    const preview = record.preview
    return {
      ...toSummary(record, accountName, profile?.name ?? null),
      alreadyImported: previous?.committedAt
        ? { importId: previous.id, committedAt: previous.committedAt }
        : null,
      undo: record.committedAt
        ? await undoImpact(executor, record.id, record.source)
        : null,
      preview: preview
        ? {
            previousBalanceCents: preview.previousBalanceCents,
            continuity: preview.continuity,
            issues: preview.issues.map(issueDto),
            ignoredColumns: preview.ignoredColumns ?? [],
            rows: preview.rows.map(({ dedupeHash: _hash, ...row }) => ({
              ...row,
              manualMatch: row.manualMatch ?? null,
              fixedFrom: row.fixedFrom ? issueDto(row.fixedFrom) : null,
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
  profileName: string | null,
): ImportSummaryDto {
  return {
    id: record.id,
    accountId: record.accountId,
    accountName,
    source: record.source,
    profileId: record.profileId,
    profileName,
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

/** An issue with its optional parts as nulls (previews made before #433). */
function issueDto(issue: ParseIssue) {
  return {
    lineNumber: issue.lineNumber,
    message: issue.message,
    cells: issue.cells ?? null,
    draft: issue.draft ?? null,
  }
}

/** A preview row back to the parsed row it was built from. */
function toParsedRow(row: PreviewRow): ParsedRow {
  return {
    lineNumber: row.lineNumber,
    bookingDate: row.bookingDate,
    valueDate: row.valueDate,
    amountCents: row.amountCents,
    balanceAfterCents: row.balanceAfterCents,
    rawLabel: row.rawLabel,
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
