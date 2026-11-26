import {
  INVESTMENT_MOVEMENT_KINDS,
  type InvestmentMovementKind,
} from '#/database/schema/domain-enums'
import { headerKey } from '#/imports/crypto/parsers/common'
import {
  issueCells,
  type IssueDraft,
  type ParseIssue,
  type ParseResult,
  type ParsedRow,
} from '#/imports/parsers/parsed-row'
import { isValidIsin, normalizeIsin } from '#/positions/isin'
import type { CsvProfile } from './profile.types'
import {
  CsvFormatError,
  type CsvTable,
  readCsvTable,
  unusedColumns,
} from './read-table'
import {
  parseAmountToCents,
  parseDateWithFormat,
  parseExactDecimal,
} from './values'

/**
 * Reads a CSV through a profile (#431): the standard formats and the saved
 * profiles alike. Pure: no I/O, no logging. Bad lines are skipped and
 * reported with their line number; the header's columns the profile does not
 * read are reported in `ignoredColumns`.
 */

/** Longest label kept, as for a bank row (`transactions.raw_label` is text). */
const MAX_LABEL_LENGTH = 500
const MAX_ASSET_LENGTH = 200

/** Sign of each kind's cash effect on the account. */
export const INVESTMENT_KIND_SIGN: Record<InvestmentMovementKind, 1 | -1> = {
  buy: -1,
  sell: 1,
  deposit: 1,
  withdrawal: -1,
  dividend: 1,
  interest: 1,
  fee: -1,
  tax: -1,
}

/** Kinds that name a security or an asset. */
const KINDS_WITH_INSTRUMENT: readonly InvestmentMovementKind[] = [
  'buy',
  'sell',
  'dividend',
]
/** Kinds that move a quantity. */
const KINDS_WITH_QUANTITY: readonly InvestmentMovementKind[] = ['buy', 'sell']

/** French names of the kinds, read by every investment profile. */
const FRENCH_KINDS: Record<string, InvestmentMovementKind> = {
  achat: 'buy',
  vente: 'sell',
  versement: 'deposit',
  depot: 'deposit',
  retrait: 'withdrawal',
  dividende: 'dividend',
  interets: 'interest',
  frais: 'fee',
  impot: 'tax',
  taxe: 'tax',
}

/** One investment movement of the standard investment format. */
export interface ParsedMovement {
  lineNumber: number
  /** `YYYY-MM-DD`. */
  date: string
  kind: InvestmentMovementKind
  /** Normalized, check digit verified. */
  isin: string | null
  /** Asset name or ticker, when there is no ISIN (or beside it). */
  asset: string | null
  /** Exact decimal string, > 0, on buys and sales. */
  quantity: string | null
  /** Exact EUR unit price, when given. */
  priceEur: string | null
  /** Fees in cents (≥ 0), when given; included in `amountCents`. */
  feesCents: number | null
  /** Signed cash effect in cents, its sign the kind's. */
  amountCents: number
  label: string | null
}

export interface InvestmentParseResult {
  rows: ParsedMovement[]
  issues: ParseIssue[]
  ignoredColumns: string[]
}

/** Profile columns resolved to header positions. */
type Columns = Partial<Record<string, number>>

/**
 * Bank rows of a cash profile.
 *
 * @throws {CsvFormatError} when the file is empty, not decodable, or lacks a
 *   column the profile maps.
 */
export function parseCashCsv(bytes: Buffer, profile: CsvProfile): ParseResult {
  if (profile.target !== 'cash') {
    throw new CsvFormatError('This profile does not read bank rows')
  }
  const table = readCsvTable(bytes, profile)
  const columns = resolveColumns(table, profile)
  const rows: ParsedRow[] = []
  const issues = unterminatedIssues(table)
  for (const record of table.records) {
    const cells = cellReader(table, record.fields, columns)
    if (!cells) {
      issues.push({
        ...tooManyFields(table, record),
        cells: issueCells(table.header.fields, record.fields, columns),
      })
      continue
    }
    const result = cashRow(cells, profile)
    if ('error' in result) {
      issues.push({
        lineNumber: record.lineNumber,
        message: result.error,
        cells: issueCells(table.header.fields, record.fields, columns),
        draft: result.draft,
      })
    } else {
      rows.push({ lineNumber: record.lineNumber, ...result.row })
    }
  }
  issues.sort((a, b) => a.lineNumber - b.lineNumber)
  return { rows, issues, ignoredColumns: ignored(table, columns) }
}

/**
 * Movements of an investment profile. A line whose kind is not recognised
 * is reported, never guessed.
 *
 * @throws {CsvFormatError} as `parseCashCsv`.
 */
export function parseInvestmentCsv(
  bytes: Buffer,
  profile: CsvProfile,
): InvestmentParseResult {
  if (profile.target !== 'investment') {
    throw new CsvFormatError('This profile does not read investment movements')
  }
  const table = readCsvTable(bytes, profile)
  const columns = resolveColumns(table, profile)
  const rows: ParsedMovement[] = []
  const issues = unterminatedIssues(table)
  for (const record of table.records) {
    const cells = cellReader(table, record.fields, columns)
    if (!cells) {
      issues.push(tooManyFields(table, record))
      continue
    }
    const result = movement(cells, profile)
    if ('error' in result) {
      issues.push({ lineNumber: record.lineNumber, message: result.error })
    } else {
      rows.push({ lineNumber: record.lineNumber, ...result.row })
    }
  }
  issues.sort((a, b) => a.lineNumber - b.lineNumber)
  return { rows, issues, ignoredColumns: ignored(table, columns) }
}

// --- Columns ------------------------------------------------------------------

function resolveColumns(table: CsvTable, profile: CsvProfile): Columns {
  const columns: Columns = {}
  const missing: string[] = []
  for (const [field, name] of Object.entries(profile.columns)) {
    if (name === undefined) continue
    const index = table.headerKeys.indexOf(headerKey(name))
    if (index === -1) missing.push(name)
    else columns[field] = index
  }
  if (missing.length > 0) {
    throw new CsvFormatError(`Missing column(s) ${missing.join(', ')}`)
  }
  return columns
}

function ignored(table: CsvTable, columns: Columns): string[] {
  return unusedColumns(
    table,
    new Set(Object.values(columns).filter((i) => i !== undefined)),
  )
}

function unterminatedIssues(table: CsvTable): ParseIssue[] {
  return table.unterminatedLines
    .filter((line) => line > table.header.lineNumber)
    .map((lineNumber) => ({
      lineNumber,
      message: 'Unterminated quoted field',
    }))
}

function tooManyFields(
  table: CsvTable,
  record: { lineNumber: number; fields: string[] },
): ParseIssue {
  return {
    lineNumber: record.lineNumber,
    message: `Expected ${table.header.fields.length} fields, found ${record.fields.length}`,
  }
}

type Cells = (field: string) => string

/**
 * The trimmed cell of a field ('' when unmapped or past the line's end), or
 * null when the line holds more non-empty fields than the header.
 */
function cellReader(
  table: CsvTable,
  fields: string[],
  columns: Columns,
): Cells | null {
  if (fields.slice(table.header.fields.length).some((f) => f.trim() !== '')) {
    return null
  }
  return (field) => {
    const index = columns[field]
    return index === undefined ? '' : (fields[index] ?? '').trim()
  }
}

// --- Bank rows ----------------------------------------------------------------

type CashRow = Omit<ParsedRow, 'lineNumber'>

function cashRow(
  cell: Cells,
  profile: CsvProfile,
): { row: CashRow } | { error: string; draft: IssueDraft } {
  const errors: string[] = []
  const date = (text: string) => parseDateWithFormat(text, profile.dateFormat)
  const amount = (text: string) =>
    parseAmountToCents(text, profile.decimalSeparator)

  const bookingDate = tryParse(cell('date'), date)
  if (bookingDate === undefined) errors.push('Invalid or missing date')

  const valueDateCell = cell('valueDate')
  const valueDate = valueDateCell === '' ? null : tryParse(valueDateCell, date)
  if (valueDate === undefined) errors.push('Invalid value date')

  const amountCents =
    profile.columns.amount !== undefined
      ? signedAmount(cell('amount'), amount, errors)
      : debitCredit(cell('debit'), cell('credit'), amount, errors)

  const balanceCell = cell('balance')
  const balanceAfterCents =
    balanceCell === '' ? null : tryParse(balanceCell, amount)
  if (balanceAfterCents === undefined) errors.push('Invalid balance')

  const rawLabel = cell('label').replace(/\s+/g, ' ').slice(0, MAX_LABEL_LENGTH)
  if (rawLabel === '') errors.push('Missing label')

  if (
    errors.length > 0 ||
    bookingDate === undefined ||
    valueDate === undefined ||
    amountCents === undefined ||
    balanceAfterCents === undefined
  ) {
    return {
      error: errors.join('; '),
      draft: {
        bookingDate: bookingDate ?? null,
        valueDate: valueDate ?? null,
        amountCents: amountCents ?? null,
        balanceAfterCents: balanceAfterCents ?? null,
        rawLabel: rawLabel === '' ? null : rawLabel,
      },
    }
  }
  return {
    row: { bookingDate, valueDate, amountCents, balanceAfterCents, rawLabel },
  }
}

function signedAmount(
  text: string,
  parse: (s: string) => number,
  errors: string[],
): number | undefined {
  if (text === '') {
    errors.push('Missing amount')
    return undefined
  }
  const cents = tryParse(text, parse)
  if (cents === undefined) errors.push('Invalid amount')
  return cents
}

/**
 * Exactly one of debit / credit filled (a 0 counts as empty, as some banks
 * write `0,00` in the other column). A debit is money out whatever its
 * written sign; a credit written negative is refused.
 */
function debitCredit(
  debitText: string,
  creditText: string,
  parse: (s: string) => number,
  errors: string[],
): number | undefined {
  const debit = debitText === '' ? null : tryParse(debitText, parse)
  const credit = creditText === '' ? null : tryParse(creditText, parse)
  if (debit === undefined) errors.push('Invalid debit amount')
  if (credit === undefined) errors.push('Invalid credit amount')
  if (debit === undefined || credit === undefined) return undefined
  const hasDebit = debit !== null && debit !== 0
  const hasCredit = credit !== null && credit !== 0
  if (hasDebit && hasCredit) {
    errors.push('Both debit and credit are filled')
    return undefined
  }
  if (hasCredit) {
    if (credit < 0) {
      errors.push('Negative credit amount')
      return undefined
    }
    return credit
  }
  if (hasDebit) return -Math.abs(debit)
  if (debit === null && credit === null) {
    errors.push('Neither debit nor credit is filled')
    return undefined
  }
  return 0
}

// --- Investment movements -----------------------------------------------------

type Movement = Omit<ParsedMovement, 'lineNumber'>

/** The standard kind of a cell: standard name, French name or profile value. */
export function movementKind(
  text: string,
  kindValues: CsvProfile['kindValues'],
): InvestmentMovementKind | null {
  const key = headerKey(text)
  const own = kindValues?.[key]
  if (own) return own
  if ((INVESTMENT_MOVEMENT_KINDS as readonly string[]).includes(key)) {
    return key as InvestmentMovementKind
  }
  return FRENCH_KINDS[key] ?? null
}

function movement(
  cell: Cells,
  profile: CsvProfile,
): { row: Movement } | { error: string } {
  const errors: string[] = []
  const decimal = (text: string) =>
    parseExactDecimal(text, profile.decimalSeparator)

  const date = tryParse(cell('date'), (text) =>
    parseDateWithFormat(text, profile.dateFormat),
  )
  if (date === undefined) errors.push('Invalid or missing date')

  const kindCell = cell('kind')
  const kind =
    kindCell === '' ? null : movementKind(kindCell, profile.kindValues)
  if (kindCell === '') errors.push('Missing kind')
  else if (kind === null) errors.push('Unrecognised kind')

  const isinCell = cell('isin')
  const isin = isinCell === '' ? null : normalizeIsin(isinCell)
  if (isin !== null && !isValidIsin(isin)) errors.push('Invalid ISIN')
  const asset = cell('asset').replace(/\s+/g, ' ').slice(0, MAX_ASSET_LENGTH)

  const quantityCell = cell('quantity')
  const quantity = quantityCell === '' ? null : tryParse(quantityCell, decimal)
  if (quantity === undefined || quantity === '0')
    errors.push('Invalid quantity')

  const priceCell = cell('price')
  const priceEur = priceCell === '' ? null : tryParse(priceCell, decimal)
  if (priceEur === undefined) errors.push('Invalid price')

  const feesCell = cell('fees')
  const feesCents =
    feesCell === ''
      ? null
      : tryParse(feesCell, (text) =>
          Math.abs(parseAmountToCents(text, profile.decimalSeparator)),
        )
  if (feesCents === undefined) errors.push('Invalid fees')

  const amountCents = signedAmount(
    cell('amount'),
    (text) => parseAmountToCents(text, profile.decimalSeparator),
    errors,
  )

  if (kind) {
    if (KINDS_WITH_INSTRUMENT.includes(kind) && isin === null && asset === '') {
      errors.push('Missing ISIN or asset')
    }
    if (KINDS_WITH_QUANTITY.includes(kind) && quantityCell === '') {
      errors.push('Missing quantity')
    }
    if (amountCents === 0) errors.push('Zero amount')
    else if (
      amountCents !== undefined &&
      Math.sign(amountCents) !== INVESTMENT_KIND_SIGN[kind]
    ) {
      errors.push('Amount sign does not match the kind')
    }
  }

  const label = cell('label').replace(/\s+/g, ' ').slice(0, MAX_LABEL_LENGTH)
  if (
    errors.length > 0 ||
    date === undefined ||
    kind === null ||
    quantity === undefined ||
    priceEur === undefined ||
    feesCents === undefined ||
    amountCents === undefined
  ) {
    return { error: errors.join('; ') }
  }
  return {
    row: {
      date,
      kind,
      isin,
      asset: asset === '' ? null : asset,
      quantity,
      priceEur,
      feesCents,
      amountCents,
      label: label === '' ? null : label,
    },
  }
}

function tryParse<T>(value: string, parse: (s: string) => T): T | undefined {
  try {
    return parse(value)
  } catch {
    return undefined
  }
}
