/**
 * CSV writing for the app's exports (French spreadsheets: `;` separated,
 * decimal comma, CRLF lines). Every export goes through these helpers.
 *
 * Text cells may hold third-party text (a bank label, a SEPA reference): a
 * cell starting with `=`, `+`, `-`, `@`, a tab or a carriage return would be
 * evaluated as a formula by Excel, LibreOffice or Numbers (CSV injection), so
 * it is prefixed with `'` and quoted (OWASP). Amount cells are numbers built by
 * the app and keep their minus sign.
 */

const FORMULA_START = /^[=+\-@\t\r]/
const NEEDS_QUOTES = /[;"\n\r]/

const quote = (value: string) => `"${value.replaceAll('"', '""')}"`

/** A text cell: neutralised when it could start a formula, quoted if needed. */
export function csvText(value: string): string {
  if (FORMULA_START.test(value)) return quote(`'${value}`)
  return NEEDS_QUOTES.test(value) ? quote(value) : value
}

/** `-123456` → `-1234,56` (integer arithmetic, French decimal comma). */
export function csvAmount(cents: number | null): string {
  if (cents === null) return ''
  if (!Number.isSafeInteger(cents)) throw new RangeError('Amount not in cents')
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

/** A cell already encoded by `csvText` or `csvAmount`. */
export type CsvCell = string & { readonly __csvCell: unique symbol }

export const text = (value: string) => csvText(value) as CsvCell
export const amount = (cents: number | null) => csvAmount(cents) as CsvCell

/** Joins encoded rows: `;` between cells, CRLF after each line. */
export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map((row) => row.join(';')).join('\r\n') + '\r\n'
}
