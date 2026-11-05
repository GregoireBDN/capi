import type { TransactionKind } from '#/database/schema/domain-enums'
import { toEpochDay } from '#/imports/dedupe/calendar-date'
import {
  parseFrenchAmountToCents,
  parseFrenchDate,
} from '#/imports/parsers/cic-csv.parser'
import type { ParseIssue } from '#/imports/parsers/parsed-row'
import { type CsvRecord, isBlankRecord, readCsv } from './csv'

/**
 * Parsers for the CSV export of the owner's spreadsheet history (#13): the
 * `Transactions` tab and the `Soldes` tab (month-end balances). Google Sheets
 * exports UTF-8, `,`-separated, RFC 4180 quoting, with the cells' formatted
 * values (`30/06/2023`, `-1 234,56 €`).
 *
 * Pure: no I/O, no logging. Columns are matched by name, ignoring case,
 * accents, spacing and a `(€)` unit. A malformed row is skipped and reported
 * in `issues` (messages never contain labels or amounts); only an input that
 * is not such an export at all throws a `HistoryCsvFormatError`.
 */
export class HistoryCsvFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HistoryCsvFormatError'
  }
}

// --- Shared cell parsing ----------------------------------------------------

/**
 * Case-, accent-, spacing- and unit-insensitive header name:
 * `Montant (€)` → `montant`, `Libellé` → `libelle`.
 */
export function normalizeHeader(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\((?:€|eur|euros?)\)|€/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Header as displayed, without its `(€)` unit: `Livret A (€)` → `Livret A`. */
function displayHeader(name: string): string {
  return name
    .replace(/\((?:€|eur|euros?)\)|€/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Euro amount as Sheets formats it, into integer cents: `-1 234,56 €`,
 * `120,00 €`, `−3,5`, with regular, non-breaking or narrow non-breaking
 * spaces as thousands separators. Never goes through floating point.
 *
 * @throws {Error} on anything else. The message does not echo the input.
 */
export function parseEuroAmountToCents(s: string): number {
  const withoutUnit = s
    .replace(/\s/g, ' ')
    .trim()
    .replace(/^€ ?| ?€$/g, '')
    .replace(/ ?EUR$/i, '')
  return parseFrenchAmountToCents(withoutUnit)
}

/**
 * `dd/mm/yyyy` or `YYYY-MM-DD` calendar date into `YYYY-MM-DD`.
 *
 * @throws {Error} on anything else. The message does not echo the input.
 */
export function parseHistoryDate(s: string): string {
  const value = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    try {
      toEpochDay(value)
    } catch {
      throw new Error('Invalid date')
    }
    return value
  }
  return parseFrenchDate(value)
}

/**
 * Last day of the month of a `MM/YYYY`, `YYYY-MM`, `dd/mm/yyyy` or
 * `YYYY-MM-DD` cell, as `YYYY-MM-DD`.
 *
 * @throws {Error} on anything else. The message does not echo the input.
 */
export function parseMonthEnd(s: string): string {
  const value = s.trim()
  let year: number
  let month: number
  let m: RegExpExecArray | null
  if ((m = /^(\d{1,2})\/(\d{4})$/.exec(value))) {
    month = Number(m[1])
    year = Number(m[2])
  } else if ((m = /^(\d{4})-(\d{1,2})$/.exec(value))) {
    year = Number(m[1])
    month = Number(m[2])
  } else {
    const date = parseHistoryDate(value)
    year = Number(date.slice(0, 4))
    month = Number(date.slice(5, 7))
  }
  if (year < 1 || month < 1 || month > 12) throw new Error('Invalid month')
  // Day 0 of the next month is the last day of this one (UTC: no time zone).
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

/** Values of the `Ponctuel` column that mean "no"; any other mark means yes. */
const FALSE_MARKS = new Set(['', '0', 'non', 'no', 'n', 'false', 'faux', '-'])

export function parseOneOffMark(s: string): boolean {
  return !FALSE_MARKS.has(normalizeHeader(s))
}

/** `Groupe` column → transaction kind. */
const GROUPS: Record<string, TransactionKind> = {
  depense: 'expense',
  depenses: 'expense',
  revenu: 'income',
  revenus: 'income',
  mouvement: 'transfer',
  mouvements: 'transfer',
}

/**
 * Category cell as a snake_case slug: `Restaurants cafés` and
 * `restaurants_cafes` both give `restaurants_cafes`.
 */
export function toSheetSlug(s: string): string {
  return normalizeHeader(s)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function tryParse<T>(value: string, parse: (s: string) => T): T | undefined {
  try {
    return parse(value)
  } catch {
    return undefined
  }
}

function readRecords(text: string, what: string) {
  const { records, unterminatedLines } = readCsv(text)
  const issues: ParseIssue[] = unterminatedLines.map((lineNumber) => ({
    lineNumber,
    message: 'Unterminated quoted field',
  }))
  const headerIndex = records.findIndex((r) => !isBlankRecord(r))
  if (headerIndex === -1) {
    throw new HistoryCsvFormatError(`Not a ${what} export: the file is empty`)
  }
  return {
    header: records[headerIndex],
    body: records.slice(headerIndex + 1).filter((r) => !isBlankRecord(r)),
    issues,
  }
}

function sortIssues(issues: ParseIssue[]): ParseIssue[] {
  return issues.sort((a, b) => a.lineNumber - b.lineNumber)
}

// --- Transactions tab -------------------------------------------------------

export interface HistoryTransactionRow {
  /** 1-based physical line the row starts on (the header is line 1). */
  lineNumber: number
  /** `YYYY-MM-DD` booking date. */
  bookingDate: string
  /** Signed integer cents: negative = money out. */
  amountCents: number
  /** `Libellé`, trimmed, internal whitespace collapsed. */
  rawLabel: string
  /** `Compte`, uppercased (`CC`, `LA`, ...). */
  accountCode: string
  /** `Catégorie` as a snake_case slug; null when empty. */
  categorySlug: string | null
  /** Kind given by `Groupe`; null when empty or not recognized. */
  group: TransactionKind | null
  /** `Groupe` as written (trimmed) when it is not recognized, else null. */
  unknownGroup: string | null
  /** `Ponctuel` is marked. */
  isOneOff: boolean
}

export interface HistoryTransactionsParseResult {
  rows: HistoryTransactionRow[]
  issues: ParseIssue[]
}

type TxColumn =
  | 'date'
  | 'month'
  | 'account'
  | 'label'
  | 'amount'
  | 'category'
  | 'group'
  | 'statement'
  | 'oneOff'

const TX_HEADERS: Record<string, TxColumn> = {
  date: 'date',
  mois: 'month',
  compte: 'account',
  libelle: 'label',
  montant: 'amount',
  categorie: 'category',
  groupe: 'group',
  releve: 'statement',
  ponctuel: 'oneOff',
}

const TX_COLUMN_NAMES: Record<TxColumn, string> = {
  date: 'Date',
  month: 'Mois',
  account: 'Compte',
  label: 'Libellé',
  amount: 'Montant (€)',
  category: 'Catégorie',
  group: 'Groupe',
  statement: 'Relevé',
  oneOff: 'Ponctuel',
}

const TX_REQUIRED: readonly TxColumn[] = ['date', 'account', 'label', 'amount']

/**
 * Parses the `Transactions` tab:
 * `Date,Mois,Compte,Libellé,Montant (€),Catégorie,Groupe,Relevé,Ponctuel`.
 * `Mois` and `Relevé` are derived columns and are ignored.
 *
 * @throws {HistoryCsvFormatError} when required columns are missing.
 */
export function parseHistoryTransactionsCsv(
  text: string,
): HistoryTransactionsParseResult {
  const { header, body, issues } = readRecords(text, 'spreadsheet transactions')
  const columns = matchColumns(
    header,
    TX_HEADERS,
    TX_COLUMN_NAMES,
    TX_REQUIRED,
    'spreadsheet transactions',
  )

  const rows: HistoryTransactionRow[] = []
  for (const record of body) {
    const result = parseTransactionRecord(record, columns, header.fields.length)
    if ('row' in result) rows.push(result.row)
    else issues.push({ lineNumber: record.lineNumber, message: result.error })
  }
  return { rows, issues: sortIssues(issues) }
}

function matchColumns<C extends string>(
  header: CsvRecord,
  known: Record<string, C>,
  displayNames: Record<C, string>,
  required: readonly C[],
  what: string,
): Partial<Record<C, number>> {
  const columns: Partial<Record<C, number>> = {}
  header.fields.forEach((name, index) => {
    const column = known[normalizeHeader(name)]
    if (!column) return
    if (columns[column] !== undefined) {
      throw new HistoryCsvFormatError(
        `Not a ${what} export: duplicated column ${displayNames[column]}`,
      )
    }
    columns[column] = index
  })
  const missing = required.filter((c) => columns[c] === undefined)
  if (missing.length > 0) {
    throw new HistoryCsvFormatError(
      `Not a ${what} export: missing column(s) ${missing.map((c) => displayNames[c]).join(', ')}`,
    )
  }
  return columns
}

type TxResult = { row: HistoryTransactionRow } | { error: string }

function parseTransactionRecord(
  record: CsvRecord,
  columns: Partial<Record<TxColumn, number>>,
  headerLength: number,
): TxResult {
  const { fields } = record
  // Sheets writes every row as wide as the header: anything else means
  // shifted columns (e.g. an unquoted comma), whose cells cannot be trusted.
  if (fields.length !== headerLength) {
    return { error: `Expected ${headerLength} fields, found ${fields.length}` }
  }
  const cell = (column: TxColumn): string => {
    const index = columns[column]
    return index === undefined ? '' : fields[index].trim()
  }
  const errors: string[] = []

  const bookingDate = tryParse(cell('date'), parseHistoryDate)
  if (bookingDate === undefined) errors.push('Invalid or missing date')

  const amountCell = cell('amount')
  const amountCents =
    amountCell === '' ? undefined : tryParse(amountCell, parseEuroAmountToCents)
  if (amountCents === undefined) errors.push('Invalid or missing amount')

  const accountCode = cell('account').toUpperCase()
  if (accountCode === '') errors.push('Missing account')

  const rawLabel = cell('label').replace(/\s+/g, ' ')
  if (rawLabel === '') errors.push('Missing label')

  if (
    errors.length > 0 ||
    bookingDate === undefined ||
    amountCents === undefined
  ) {
    return { error: errors.join('; ') }
  }

  const groupCell = cell('group')
  const group = GROUPS[normalizeHeader(groupCell)] ?? null
  const categorySlug = toSheetSlug(cell('category'))
  return {
    row: {
      lineNumber: record.lineNumber,
      bookingDate,
      amountCents,
      rawLabel,
      accountCode,
      categorySlug: categorySlug === '' ? null : categorySlug,
      group,
      unknownGroup: group === null && groupCell !== '' ? groupCell : null,
      isOneOff: parseOneOffMark(cell('oneOff')),
    },
  }
}

// --- Balances tab -----------------------------------------------------------

export interface HistoryBalanceValue {
  /** Balance column, without its unit (`Compte courant`, `Livret A`). */
  column: string
  valueCents: number
}

export interface HistoryBalanceRow {
  lineNumber: number
  /** Last day of the month, `YYYY-MM-DD`. */
  date: string
  /** Filled cells only. */
  values: HistoryBalanceValue[]
}

export interface HistoryBalancesParseResult {
  /** Balance columns in file order, `Total …` columns excluded. */
  columns: string[]
  rows: HistoryBalanceRow[]
  issues: ParseIssue[]
}

const MONTH_HEADERS = new Set(['fin de mois', 'mois', 'date'])

/**
 * Parses the `Soldes` tab: a month column (`Fin de mois`, `07/2023`) then one
 * balance column per account (`Compte courant (€)`, `Livret A (€)`, ...).
 * Columns named `Total …` are sums and are ignored. Empty cells are skipped;
 * an invalid cell is reported and the other cells of its row are kept.
 *
 * @throws {HistoryCsvFormatError} when there is no month column or no balance column.
 */
export function parseHistoryBalancesCsv(
  text: string,
): HistoryBalancesParseResult {
  const { header, body, issues } = readRecords(text, 'spreadsheet balances')

  const monthIndexes = header.fields
    .map((name, index) =>
      MONTH_HEADERS.has(normalizeHeader(name)) ? index : -1,
    )
    .filter((index) => index !== -1)
  if (monthIndexes.length === 0) {
    throw new HistoryCsvFormatError(
      'Not a spreadsheet balances export: missing column Fin de mois',
    )
  }
  if (monthIndexes.length > 1) {
    throw new HistoryCsvFormatError(
      'Not a spreadsheet balances export: several month columns',
    )
  }
  const [monthIndex] = monthIndexes

  const balanceColumns: { index: number; name: string }[] = []
  const seen = new Set<string>()
  header.fields.forEach((raw, index) => {
    const normalized = normalizeHeader(raw)
    if (index === monthIndex || normalized === '') return
    if (normalized.startsWith('total')) return
    if (seen.has(normalized)) {
      throw new HistoryCsvFormatError(
        `Not a spreadsheet balances export: duplicated column ${displayHeader(raw)}`,
      )
    }
    seen.add(normalized)
    balanceColumns.push({ index, name: displayHeader(raw) })
  })
  if (balanceColumns.length === 0) {
    throw new HistoryCsvFormatError(
      'Not a spreadsheet balances export: no balance column',
    )
  }

  const rows: HistoryBalanceRow[] = []
  for (const record of body) {
    const { fields, lineNumber } = record
    if (fields.length !== header.fields.length) {
      issues.push({
        lineNumber,
        message: `Expected ${header.fields.length} fields, found ${fields.length}`,
      })
      continue
    }
    const date = tryParse(fields[monthIndex], parseMonthEnd)
    if (date === undefined) {
      issues.push({ lineNumber, message: 'Invalid or missing month' })
      continue
    }
    const values: HistoryBalanceValue[] = []
    for (const column of balanceColumns) {
      const value = fields[column.index].trim()
      if (value === '') continue
      const valueCents = tryParse(value, parseEuroAmountToCents)
      if (valueCents === undefined) {
        issues.push({
          lineNumber,
          message: `Invalid amount in column ${column.name}`,
        })
        continue
      }
      values.push({ column: column.name, valueCents })
    }
    rows.push({ lineNumber, date, values })
  }

  return {
    columns: balanceColumns.map((c) => c.name),
    rows,
    issues: sortIssues(issues),
  }
}

/** Strict UTF-8 decoding (BOM stripped); Sheets always exports UTF-8. */
export function decodeUtf8(input: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(input)
  } catch {
    throw new HistoryCsvFormatError('The file is not valid UTF-8')
  }
}
