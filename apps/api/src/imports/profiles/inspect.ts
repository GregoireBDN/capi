import type {
  CashField,
  ColumnMapping,
  CsvDelimiter,
  CsvEncoding,
  DateFormat,
  DecimalSeparator,
} from './profile.types'
import { readCsvTable } from './read-table'
import { readsAsDate } from './values'

/**
 * What the owner needs to map an unknown file (#431): its encoding,
 * delimiter, header and first lines, and a guessed mapping. Pure. The sample
 * holds the owner's data: it goes back to their own session only, never to
 * a log.
 */
export interface CsvInspection {
  encoding: CsvEncoding
  delimiter: CsvDelimiter
  /** Header names as written (trimmed), trailing blank ones left out. */
  headers: string[]
  /** First lines after the header, cut to the header's width. */
  sample: string[][]
  /** Lines after the header. */
  lineCount: number
  suggestion: {
    decimalSeparator: DecimalSeparator
    dateFormat: DateFormat | null
    columns: ColumnMapping<CashField>
  }
}

const SAMPLE_LINES = 5
/** Lines read to guess the date format and the decimal mark. */
const GUESS_LINES = 50

/**
 * Header keys (see `headerKey`) that name a cash field, tried in this order;
 * a column goes to one field only.
 */
const CASH_HINTS: [CashField, (key: string) => boolean][] = [
  ['valueDate', (k) => k.includes('valeur') || k.includes('value date')],
  [
    'date',
    (k) => k.startsWith('date') || k === 'jour' || k.includes('booking'),
  ],
  ['debit', (k) => k.includes('debit')],
  ['credit', (k) => k.includes('credit')],
  ['amount', (k) => k.includes('montant') || k.includes('amount')],
  ['balance', (k) => k.includes('solde') || k.includes('balance')],
  [
    'label',
    (k) =>
      [
        'libelle',
        'label',
        'description',
        'intitule',
        'detail',
        'operation',
      ].some((word) => k.includes(word)),
  ],
]

/** Guess order: French layouts first, the US one last. */
const DATE_GUESS_ORDER: readonly DateFormat[] = [
  'dd/mm/yyyy',
  'yyyy-mm-dd',
  'dd-mm-yyyy',
  'dd.mm.yyyy',
  'dd/mm/yy',
  'mm/dd/yyyy',
]

/** @throws {CsvFormatError} when the file is empty or not decodable. */
export function inspectCsv(bytes: Buffer): CsvInspection {
  const table = readCsvTable(bytes, { encoding: null, delimiter: null })
  const headers = table.header.fields.map((name) => name.trim())
  while (headers.length > 0 && headers[headers.length - 1] === '') {
    headers.pop()
  }
  const keys = table.headerKeys.slice(0, headers.length)

  const columns: ColumnMapping<CashField> = {}
  const taken = new Set<number>()
  for (const [field, matches] of CASH_HINTS) {
    const index = keys.findIndex((key, i) => !taken.has(i) && matches(key))
    if (index === -1) continue
    columns[field] = headers[index]
    taken.add(index)
  }
  // One signed amount, or a debit and a credit column: never a mix.
  if (columns.debit && columns.credit) delete columns.amount
  else {
    delete columns.debit
    delete columns.credit
  }

  const lines = table.records.slice(0, GUESS_LINES)
  const cellsOf = (name: string | undefined) => {
    if (name === undefined) return []
    const index = headers.indexOf(name)
    return lines
      .map((record) => (record.fields[index] ?? '').trim())
      .filter((cell) => cell !== '')
  }

  const dates = cellsOf(columns.date)
  // The layout reading the most of them (a bad line does not spoil it).
  let dateFormat: DateFormat | null = null
  let best = 0
  for (const format of DATE_GUESS_ORDER) {
    const read = dates.filter((cell) => readsAsDate(cell, format)).length
    if (read > best) {
      dateFormat = format
      best = read
    }
  }

  const amounts = [
    ...cellsOf(columns.amount),
    ...cellsOf(columns.debit),
    ...cellsOf(columns.credit),
    ...cellsOf(columns.balance),
  ]
  const decimalSeparator: DecimalSeparator =
    !amounts.some((cell) => /,\d{1,2}\s*(€|EUR)?$/i.test(cell)) &&
    amounts.some((cell) => /\.\d{1,2}\s*(€|EUR)?$/i.test(cell))
      ? '.'
      : ','

  return {
    encoding: table.encoding,
    delimiter: table.delimiter,
    headers,
    sample: table.records
      .slice(0, SAMPLE_LINES)
      .map((record) => headers.map((_, i) => (record.fields[i] ?? '').trim())),
    lineCount: table.records.length,
    suggestion: { decimalSeparator, dateFormat, columns },
  }
}
