import type { RuleSet } from '#/categories/categorization-rules.service'
import { categorize, defaultKind } from '#/categories/rules/categorize'
import { checkContinuity } from '#/imports/dedupe/continuity'
import {
  classifyRows,
  computeDedupeHashes,
  type ExistingTransaction,
} from '#/imports/dedupe/dedupe'
import { normalizeLabel } from '#/imports/normalize/label'
import type { ParsedRow } from '#/imports/parsers/parsed-row'
import {
  matchManualExpenses,
  unmatchedInPeriod,
} from '#/imports/reconcile/manual-match'
import type { StoredManualExpense } from '#/imports/reconcile/manual-match.repository'
import type {
  ExistingTransactionSummary,
  ImportPreviewData,
  ManualExpenseSummary,
  PreviewCounts,
  PreviewRow,
} from './preview.types'
import { PREVIEW_VERSION } from './preview.types'

export interface BuildPreviewInput {
  accountId: string
  rows: ParsedRow[]
  issues: ImportPreviewData['issues']
  /** Transactions of the account around the file's dates (`loadExistingForRange`). */
  existing: ExistingTransaction[]
  /** Balance the file continues from (`loadPreviousBalance`). */
  previousBalanceCents: number | null
  ruleSet: RuleSet
  /** Expenses noted by hand around the file's dates (`loadManualExpenses`). */
  manual?: StoredManualExpense[]
}

/**
 * Classifies and categorizes parsed rows. Pure: no I/O, no logging (the
 * result holds labels and amounts).
 *
 * For every row, in file order: normalize the label → dedupe hash (occurrence
 * index among identical rows of the file) → classify against the existing
 * transactions (`new` / `duplicate` / `conflict`) → categorize with the
 * ordered rules (no match: `needsReview` with `defaultKind`). A `new` row
 * that matches an expense noted by hand (`matchManualExpenses`) takes its
 * category instead. The running balances are checked against each other and
 * the previous balance.
 */
export function buildPreview(input: BuildPreviewInput): {
  preview: ImportPreviewData
  counts: PreviewCounts
} {
  const { accountId, rows, existing, ruleSet } = input
  const normalized = rows.map((row) =>
    normalizeLabel(row.rawLabel, row.amountCents),
  )
  const hashes = computeDedupeHashes(rows)
  const statuses = classifyRows(
    rows.map((row, i) => ({
      bookingDate: row.bookingDate,
      amountCents: row.amountCents,
      rawLabel: row.rawLabel,
      merchantKey: normalized[i].merchantKey,
      balanceAfterCents: row.balanceAfterCents,
    })),
    hashes,
    existing,
  )
  const existingById = new Map(existing.map((tx) => [tx.id, tx]))
  const manual = input.manual ?? []
  const manualById = new Map(manual.map((m) => [m.id, m]))
  const matches = matchManualExpenses(
    rows.map((row, i) => (statuses[i].status === 'new' ? row : null)),
    manual,
  )

  const previewRows = rows.map((row, i): PreviewRow => {
    const status = statuses[i]
    const merchant = normalized[i].merchant
    const match = categorize(
      {
        accountId,
        rawLabel: row.rawLabel,
        merchant,
        amountCents: row.amountCents,
      },
      ruleSet.rules,
      ruleSet.categoriesById,
    )
    const existingTx =
      status.status === 'new' ? undefined : existingById.get(status.existingId)
    const matched = matches[i] === null ? undefined : manualById.get(matches[i])
    const categorized = matched
      ? {
          categoryId: matched.categoryId,
          ruleId: null,
          kind: matched.kind,
          needsReview: matched.categoryId === null,
        }
      : {
          categoryId: match?.categoryId ?? null,
          ruleId: match?.ruleId ?? null,
          kind: match?.kind ?? defaultKind(row.amountCents),
          needsReview: match === null,
        }
    return {
      index: i,
      lineNumber: row.lineNumber,
      bookingDate: row.bookingDate,
      valueDate: row.valueDate,
      amountCents: row.amountCents,
      balanceAfterCents: row.balanceAfterCents,
      rawLabel: row.rawLabel,
      merchant: match ? match.merchant : merchant,
      dedupeHash: hashes[i],
      status: status.status,
      conflictReason: status.status === 'conflict' ? status.reason : null,
      existing: existingTx ? summarize(existingTx) : null,
      ...categorized,
      manualMatch: matched ? summarizeManual(matched) : null,
    }
  })
  const { periodStart, periodEnd } = periodOf(rows)
  const matchedIds = new Set(matches.filter((id) => id !== null))

  return {
    preview: {
      version: PREVIEW_VERSION,
      previousBalanceCents: input.previousBalanceCents,
      continuity: checkContinuity(rows, input.previousBalanceCents),
      issues: input.issues,
      rows: previewRows,
      unmatchedManual:
        periodStart && periodEnd
          ? unmatchedInPeriod(manual, matchedIds, periodStart, periodEnd).map(
              summarizeManual,
            )
          : [],
    },
    counts: countRows(previewRows, input.issues.length),
  }
}

export function countRows(rows: PreviewRow[], issues: number): PreviewCounts {
  const counts: PreviewCounts = {
    rows: rows.length,
    new: 0,
    duplicates: 0,
    conflicts: 0,
    issues,
  }
  for (const row of rows) {
    if (row.status === 'new') counts.new++
    else if (row.status === 'duplicate') counts.duplicates++
    else counts.conflicts++
  }
  return counts
}

/** First and last booking dates of the rows, or nulls when there are none. */
export function periodOf(rows: Pick<ParsedRow, 'bookingDate'>[]): {
  periodStart: string | null
  periodEnd: string | null
} {
  let periodStart: string | null = null
  let periodEnd: string | null = null
  for (const { bookingDate } of rows) {
    if (periodStart === null || bookingDate < periodStart) {
      periodStart = bookingDate
    }
    if (periodEnd === null || bookingDate > periodEnd) periodEnd = bookingDate
  }
  return { periodStart, periodEnd }
}

function summarizeManual(m: StoredManualExpense): ManualExpenseSummary {
  return {
    id: m.id,
    bookingDate: m.bookingDate,
    amountCents: m.amountCents,
    rawLabel: m.rawLabel,
    categoryId: m.categoryId,
  }
}

function summarize(tx: ExistingTransaction): ExistingTransactionSummary {
  return {
    id: tx.id,
    bookingDate: tx.bookingDate,
    amountCents: tx.amountCents,
    rawLabel: tx.rawLabel,
  }
}
