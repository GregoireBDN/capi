import type { ParseIssue, ParseResult, ParsedRow } from './parsed-row'
import { decodeWindows1252 } from './windows-1252'

/**
 * Thrown when the input is not a CIC CSV export at all (empty file, missing
 * or duplicated header columns, undecodable content). Problems on single rows
 * are never thrown: they are reported as `ParseIssue`s.
 *
 * The message only names columns, never file contents, so it is safe to log
 * and to show to the user.
 */
export class CicCsvFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CicCsvFormatError'
  }
}

const SEPARATOR = ';'
const UTF8_BOM = [0xef, 0xbb, 0xbf] as const

type Column = 'date' | 'valueDate' | 'debit' | 'credit' | 'label' | 'balance'

/** Normalized header name → column. See `normalizeHeader`. */
const HEADER_COLUMNS: Record<string, Column> = {
  date: 'date',
  'date de valeur': 'valueDate',
  debit: 'debit',
  credit: 'credit',
  libelle: 'label',
  solde: 'balance',
}

/** Display names, used in error messages. */
const COLUMN_NAMES: Record<Column, string> = {
  date: 'Date',
  valueDate: 'Date de valeur',
  debit: 'Débit',
  credit: 'Crédit',
  label: 'Libellé',
  balance: 'Solde',
}

const REQUIRED_COLUMNS: readonly Column[] = ['date', 'debit', 'credit', 'label']

type ColumnIndexes = Partial<Record<Column, number>>

interface Line {
  lineNumber: number
  fields: string[]
  unterminatedQuote: boolean
}

/**
 * Parses a CIC account CSV export (`Date;Date de valeur;Débit;Crédit;Libellé;Solde`,
 * Windows-1252, `;`-separated, comma decimals, `dd/mm/yyyy` dates).
 *
 * Pure: no I/O, no logging. Rows are returned in file order. Malformed rows
 * are skipped and reported in `issues` with their line number.
 *
 * @throws {CicCsvFormatError} when the input is not a CIC CSV export.
 */
export function parseCicCsv(input: Buffer): ParseResult {
  const lines = splitLines(decode(input))

  const headerIndex = lines.findIndex((line) => !isBlank(line))
  if (headerIndex === -1) {
    throw new CicCsvFormatError('Not a CIC CSV export: the file is empty')
  }
  const header = parseLine(lines[headerIndex])
  if (header.unterminatedQuote) {
    throw new CicCsvFormatError(
      'Not a CIC CSV export: the header has an unterminated quoted field',
    )
  }
  const columns = matchHeader(header.fields)
  const headerLength = header.fields.length

  const rows: ParsedRow[] = []
  const issues: ParseIssue[] = []
  for (let i = headerIndex + 1; i < lines.length; i++) {
    if (isBlank(lines[i])) continue
    const line: Line = { lineNumber: i + 1, ...parseLine(lines[i]) }
    const result = parseRow(line, columns, headerLength)
    if ('row' in result) rows.push(result.row)
    else issues.push({ lineNumber: line.lineNumber, message: result.error })
  }
  return { rows, issues }
}

/**
 * Parses a French-formatted amount into integer cents, without going through
 * floating point: `"-1 234,56"` → `-123456`, `"12"` → `1200`, `"12,5"` → `1250`.
 *
 * Accepts an optional `+`/`-` sign, spaces (including non-breaking and narrow
 * non-breaking spaces) as thousands separators in groups of three, and a comma
 * followed by one or two decimals.
 *
 * @throws {Error} on anything else. The message does not echo the input.
 */
export function parseFrenchAmountToCents(s: string): number {
  const normalized = s
    .trim()
    // `\s` covers regular, non-breaking (U+00A0) and narrow non-breaking
    // (U+202F) spaces, all used as French thousands separators.
    .replace(/\s/g, ' ')
    .replace(/\u2212/g, '-')
  const match = /^([+-]?) ?(\d{1,3}(?: \d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(
    normalized,
  )
  if (!match) throw new Error('Invalid amount')
  const [, sign, integerPart, decimals = ''] = match
  const units = Number(integerPart.replace(/ /g, ''))
  const cents = units * 100 + Number(decimals.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) throw new Error('Amount out of range')
  if (cents === 0) return 0
  return sign === '-' ? -cents : cents
}

/**
 * Parses a `dd/mm/yyyy` calendar date into `YYYY-MM-DD` (no time zone
 * involved). Rejects dates that do not exist, such as `31/02/2026`.
 *
 * @throws {Error} on anything else. The message does not echo the input.
 */
export function parseFrenchDate(s: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim())
  if (!match) throw new Error('Invalid date')
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    throw new Error('Invalid date')
  }
  if (day > daysInMonth(year, month)) throw new Error('Invalid date')
  return `${match[3]}-${pad2(month)}-${pad2(day)}`
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return leap ? 29 : 28
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Windows-1252 by default; UTF-8 when the file starts with a UTF-8 BOM. */
function decode(input: Buffer): string {
  const hasUtf8Bom =
    input.length >= 3 && UTF8_BOM.every((byte, i) => input[i] === byte)
  if (!hasUtf8Bom) return decodeWindows1252(input)
  try {
    // Strips the BOM (ignoreBOM defaults to false).
    return new TextDecoder('utf-8', { fatal: true }).decode(input)
  } catch {
    throw new CicCsvFormatError(
      'Not a CIC CSV export: the file starts with a UTF-8 BOM but is not valid UTF-8',
    )
  }
}

function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/)
}

function isBlank(line: string): boolean {
  return line.replaceAll(SEPARATOR, '').trim() === ''
}

/**
 * Splits one line on `;`, honouring standard double-quoted fields (`""` is an
 * escaped quote). Quoted fields cannot span lines: an unclosed quote is
 * reported on its own line instead of swallowing the rest of the file.
 */
function parseLine(line: string): Omit<Line, 'lineNumber'> {
  const fields: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch !== '"') field += ch
      else if (line[i + 1] === '"') {
        field += '"'
        i++
      } else inQuotes = false
    } else if (ch === '"' && field.trim() === '') {
      field = ''
      inQuotes = true
    } else if (ch === SEPARATOR) {
      fields.push(field)
      field = ''
    } else {
      field += ch
    }
  }
  fields.push(field)
  return { fields, unterminatedQuote: inQuotes }
}

/** Case-, accent- and whitespace-insensitive header name. */
function normalizeHeader(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function matchHeader(fields: string[]): ColumnIndexes {
  const columns: ColumnIndexes = {}
  fields.forEach((name, index) => {
    const column = HEADER_COLUMNS[normalizeHeader(name)]
    if (!column) return
    if (columns[column] !== undefined) {
      throw new CicCsvFormatError(
        `Not a CIC CSV export: duplicated column ${COLUMN_NAMES[column]}`,
      )
    }
    columns[column] = index
  })
  const missing = REQUIRED_COLUMNS.filter((c) => columns[c] === undefined)
  if (missing.length > 0) {
    throw new CicCsvFormatError(
      `Not a CIC CSV export: missing column(s) ${missing.map((c) => COLUMN_NAMES[c]).join(', ')}`,
    )
  }
  return columns
}

type RowResult = { row: ParsedRow } | { error: string }

function parseRow(
  line: Line,
  columns: ColumnIndexes,
  headerLength: number,
): RowResult {
  if (line.unterminatedQuote) return { error: 'Unterminated quoted field' }
  const { fields } = line
  if (fields.length < headerLength) {
    return {
      error: `Expected ${headerLength} fields, found ${fields.length}`,
    }
  }
  if (fields.slice(headerLength).some((f) => f.trim() !== '')) {
    return {
      error: `Expected ${headerLength} fields, found ${fields.length}`,
    }
  }

  const cell = (column: Column): string => {
    const index = columns[column]
    return index === undefined ? '' : fields[index].trim()
  }
  const errors: string[] = []

  const bookingDate = tryParse(cell('date'), parseFrenchDate)
  if (bookingDate === undefined) errors.push('Invalid or missing date')

  const valueDateCell = cell('valueDate')
  const valueDate =
    valueDateCell === '' ? null : tryParse(valueDateCell, parseFrenchDate)
  if (valueDate === undefined) errors.push('Invalid value date')

  const amountCents = parseAmount(cell('debit'), cell('credit'), errors)

  const balanceCell = cell('balance')
  const balanceAfterCents =
    balanceCell === '' ? null : tryParse(balanceCell, parseFrenchAmountToCents)
  if (balanceAfterCents === undefined) errors.push('Invalid balance')

  const rawLabel = cell('label').replace(/\s+/g, ' ')
  if (rawLabel === '') errors.push('Missing label')

  if (
    errors.length > 0 ||
    bookingDate === undefined ||
    valueDate === undefined ||
    amountCents === undefined ||
    balanceAfterCents === undefined
  ) {
    return { error: errors.join('; ') }
  }
  return {
    row: {
      lineNumber: line.lineNumber,
      bookingDate,
      valueDate,
      amountCents,
      balanceAfterCents,
      rawLabel,
    },
  }
}

/**
 * Exactly one of debit/credit must be filled. A debit is money out whatever
 * its written sign (CIC writes `-12,00`, but `12,00` is tolerated). A credit
 * written with a minus sign is contradictory and rejected.
 */
function parseAmount(
  debit: string,
  credit: string,
  errors: string[],
): number | undefined {
  if (debit !== '' && credit !== '') {
    errors.push('Both debit and credit are filled')
    return undefined
  }
  if (debit === '' && credit === '') {
    errors.push('Neither debit nor credit is filled')
    return undefined
  }
  if (debit !== '') {
    const cents = tryParse(debit, parseFrenchAmountToCents)
    if (cents === undefined) {
      errors.push('Invalid debit amount')
      return undefined
    }
    return cents === 0 ? 0 : -Math.abs(cents)
  }
  const cents = tryParse(credit, parseFrenchAmountToCents)
  if (cents === undefined) {
    errors.push('Invalid credit amount')
    return undefined
  }
  if (cents < 0) {
    errors.push('Negative credit amount')
    return undefined
  }
  return cents
}

function tryParse<T>(value: string, parse: (s: string) => T): T | undefined {
  try {
    return parse(value)
  } catch {
    return undefined
  }
}
