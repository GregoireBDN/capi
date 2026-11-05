import type { TransactionKind } from '#/database/schema/domain-enums'
import type { ContinuityReport } from '#/imports/dedupe/continuity'
import type { ParseIssue } from '#/imports/parsers/parsed-row'

/**
 * Shape of `imports.preview` (jsonb): everything the commit needs, so the
 * file is not uploaded twice. Holds labels and amounts: never log it.
 */

export type PreviewRowStatus = 'new' | 'duplicate' | 'conflict'

/** The stored transaction an incoming row duplicates or conflicts with. */
export interface ExistingTransactionSummary {
  id: string
  bookingDate: string
  amountCents: number
  rawLabel: string
}

export interface PreviewRow {
  /** 0-based position among the parsed rows, in file order. */
  index: number
  lineNumber: number
  bookingDate: string
  valueDate: string | null
  amountCents: number
  balanceAfterCents: number | null
  rawLabel: string
  merchant: string | null
  dedupeHash: string
  status: PreviewRowStatus
  /** Why the row was flagged as a probable duplicate (no private data). */
  conflictReason: string | null
  existing: ExistingTransactionSummary | null
  /** Proposed by the rules; null when no rule matched. */
  categoryId: string | null
  ruleId: string | null
  kind: TransactionKind
  needsReview: boolean
}

export interface PreviewCounts {
  rows: number
  new: number
  duplicates: number
  conflicts: number
  issues: number
}

export interface ImportPreviewData {
  /** Bump when the shape changes; pending previews of an older shape are discarded. */
  version: 1
  previousBalanceCents: number | null
  continuity: ContinuityReport
  issues: ParseIssue[]
  rows: PreviewRow[]
}

export const PREVIEW_VERSION = 1
