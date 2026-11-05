/**
 * Bank-agnostic output of a statement parser. Later import steps
 * (normalization, deduplication, categorization) build on these types.
 */
export interface ParsedRow {
  /** 1-based physical line in the file (the header is line 1). */
  lineNumber: number
  /** Booking date, `YYYY-MM-DD` calendar date. */
  bookingDate: string
  /** Value date, `YYYY-MM-DD` calendar date, when the file provides one. */
  valueDate: string | null
  /** Signed integer cents: debit negative, credit positive. */
  amountCents: number
  /** Running balance after this row, in integer cents, when provided. */
  balanceAfterCents: number | null
  /** Label as exported: trimmed, internal whitespace collapsed. */
  rawLabel: string
}

/**
 * A problem found on one line. `message` must never contain amounts, balances
 * or labels (it may end up in logs or in the UI).
 */
export interface ParseIssue {
  lineNumber: number
  message: string
}

export interface ParseResult {
  /** Valid rows, in file order. */
  rows: ParsedRow[]
  /** Skipped lines, in file order. */
  issues: ParseIssue[]
}
