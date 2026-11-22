import type {
  ImportProfileTarget,
  InvestmentMovementKind,
} from '#/database/schema/domain-enums'

/**
 * How to read a CSV file (#431, ADR 0007): the app's standard formats are
 * built-in profiles, and the owner saves one per other source. Pure data,
 * shared by the parsers, the database rows and the DTOs.
 */

export const CSV_ENCODINGS = ['utf-8', 'windows-1252'] as const
export type CsvEncoding = (typeof CSV_ENCODINGS)[number]

/** Column separators (`\t` for tab-separated exports). */
export const CSV_DELIMITERS = [';', ',', '\t'] as const
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number]

export const DECIMAL_SEPARATORS = [',', '.'] as const
export type DecimalSeparator = (typeof DECIMAL_SEPARATORS)[number]

/**
 * Date layouts a profile can name. `yyyy-mm-dd` also reads a time after the
 * date (`2026-03-01 10:22:00`, `2026-03-01T10:22:00Z`): the calendar date as
 * written is kept, never shifted through a time zone.
 */
export const DATE_FORMATS = [
  'yyyy-mm-dd',
  'dd/mm/yyyy',
  'dd-mm-yyyy',
  'dd.mm.yyyy',
  'dd/mm/yy',
  'mm/dd/yyyy',
] as const
export type DateFormat = (typeof DATE_FORMATS)[number]

/**
 * Fields of a bank row. `amount` (signed, negative = money out) or both
 * `debit` and `credit` (a debit is money out whatever its written sign).
 */
export const CASH_FIELDS = [
  'date',
  'valueDate',
  'label',
  'amount',
  'debit',
  'credit',
  'balance',
] as const
export type CashField = (typeof CASH_FIELDS)[number]

/** Fields of an investment movement (see `docs/domain/import-formats.md`). */
export const INVESTMENT_FIELDS = [
  'date',
  'kind',
  'isin',
  'asset',
  'quantity',
  'price',
  'fees',
  'amount',
  'label',
] as const
export type InvestmentField = (typeof INVESTMENT_FIELDS)[number]

/** Field → header name as written in the file. */
export type ColumnMapping<F extends string = string> = Partial<
  Record<F, string>
>

export interface CsvProfile {
  target: ImportProfileTarget
  /** Null: UTF-8 when the bytes are valid UTF-8, Windows-1252 otherwise. */
  encoding: CsvEncoding | null
  /** Null: detected from the header line. */
  delimiter: CsvDelimiter | null
  /** Null: the standard format's lenient amounts (`.` or `,`, no thousands). */
  decimalSeparator: DecimalSeparator | null
  /** Null: `yyyy-mm-dd` or `dd/mm/yyyy`, told apart by the year's place. */
  dateFormat: DateFormat | null
  columns: ColumnMapping
  /**
   * Investment profiles: the file's kind values (normalized with
   * `headerKey`) → standard kind, on top of the standard names.
   */
  kindValues?: Record<string, InvestmentMovementKind> | null
}

/** A saved profile, as the parsers need it. */
export interface StoredCsvProfile extends CsvProfile {
  id: string
  name: string
  encoding: CsvEncoding
  delimiter: CsvDelimiter
  decimalSeparator: DecimalSeparator
  dateFormat: DateFormat
  /** Header fields normalized with `headerKey`, in file order. */
  headers: string[]
}
