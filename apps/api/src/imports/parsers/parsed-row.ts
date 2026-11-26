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
  /**
   * The line's cells as written, named by the header's column (#433): what
   * the owner reads to fix the line in the preview. Holds file contents:
   * kept in the pending preview only, never logged, never in `message`.
   * Absent when the line could not be split (an unclosed quote).
   */
  cells?: IssueCell[]
  /**
   * What could be read from the line, each field null when it could not:
   * the fix form starts from it. Same privacy as `cells`.
   */
  draft?: IssueDraft
}

/** The fields of a bank row a cell can feed. */
export type IssueCellField =
  | 'date'
  | 'valueDate'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'label'
  | 'balance'

/** One cell of an unreadable line; `column` is '' past the header's end. */
export interface IssueCell {
  column: string
  value: string
  /** The field the column is read as; null for a column the format ignores. */
  field: IssueCellField | null
}

/** The fields of an unreadable line that could be read (#433). */
export interface IssueDraft {
  bookingDate: string | null
  valueDate: string | null
  amountCents: number | null
  balanceAfterCents: number | null
  rawLabel: string | null
}

/**
 * The cells of a line, named by the header's columns, with the field each
 * column is read as (`fieldsByIndex`: field → column index).
 */
export function issueCells(
  header: string[],
  fields: string[],
  fieldsByIndex: Partial<Record<string, number>>,
): IssueCell[] {
  const fieldAt = new Map<number, IssueCellField>()
  for (const [field, index] of Object.entries(fieldsByIndex)) {
    if (index !== undefined && isIssueCellField(field)) {
      fieldAt.set(index, field)
    }
  }
  return fields.map((value, index) => ({
    column: (header[index] ?? '').trim(),
    value,
    field: fieldAt.get(index) ?? null,
  }))
}

const ISSUE_CELL_FIELDS: readonly string[] = [
  'date',
  'valueDate',
  'amount',
  'debit',
  'credit',
  'label',
  'balance',
]

function isIssueCellField(field: string): field is IssueCellField {
  return ISSUE_CELL_FIELDS.includes(field)
}

export interface ParseResult {
  /** Valid rows, in file order. */
  rows: ParsedRow[]
  /** Skipped lines, in file order. */
  issues: ParseIssue[]
  /**
   * Header columns the parser does not read, by their name in the file
   * (#431): shown in the preview, never imported silently.
   */
  ignoredColumns?: string[]
}
