import type {
  CashField,
  ColumnMapping,
  CsvProfile,
  InvestmentField,
} from './profile.types'

/**
 * The app's standard CSV formats (#431, `docs/domain/import-formats.md`):
 * one for cash accounts, one for investment movements. They are built-in
 * profiles whose columns are found by name (English, or the French names
 * below), in any order; UTF-8 (Windows-1252 tolerated), `;` `,` or tab,
 * signed amounts with `.` or `,` as decimal mark, `YYYY-MM-DD` or
 * `dd/mm/yyyy` dates.
 */

/** Accepted header names per field, normalized with `headerKey`. */
export const STANDARD_CASH_COLUMNS: Record<
  Exclude<CashField, 'debit' | 'credit'>,
  readonly string[]
> = {
  date: ['date'],
  valueDate: ['value date', 'date de valeur'],
  label: ['label', 'libelle'],
  amount: ['amount', 'montant'],
  balance: ['balance', 'solde'],
}

export const STANDARD_INVESTMENT_COLUMNS: Record<
  InvestmentField,
  readonly string[]
> = {
  date: ['date'],
  kind: ['kind'],
  isin: ['isin'],
  asset: ['asset', 'actif'],
  quantity: ['quantity', 'quantite'],
  price: ['price', 'prix'],
  fees: ['fees', 'frais'],
  amount: ['amount', 'montant'],
  label: ['label', 'libelle'],
}

const REQUIRED_CASH: readonly CashField[] = ['date', 'label', 'amount']
const REQUIRED_INVESTMENT: readonly InvestmentField[] = [
  'date',
  'kind',
  'amount',
]

/**
 * The standard profile matching a header (fields normalized with
 * `headerKey`), or null when the header is not the standard format: every
 * required column found, the investment format when a `kind` column is
 * there. A column named twice (`label` and `libelle`) is not the standard.
 */
export function standardProfileFor(headerKeys: string[]): CsvProfile | null {
  const investment = findColumns(headerKeys, STANDARD_INVESTMENT_COLUMNS)
  if (investment && REQUIRED_INVESTMENT.every((f) => investment[f])) {
    return standardProfile('investment', investment)
  }
  const cash = findColumns(headerKeys, STANDARD_CASH_COLUMNS)
  if (cash && REQUIRED_CASH.every((f) => cash[f as keyof typeof cash])) {
    return standardProfile('cash', cash)
  }
  return null
}

function standardProfile(
  target: CsvProfile['target'],
  columns: ColumnMapping,
): CsvProfile {
  return {
    target,
    encoding: null,
    delimiter: null,
    decimalSeparator: null,
    dateFormat: null,
    columns,
  }
}

/** Field → header key found, or null when a field is named twice. */
function findColumns<F extends string>(
  headerKeys: string[],
  aliases: Record<F, readonly string[]>,
): ColumnMapping<F> | null {
  const found: ColumnMapping<F> = {}
  for (const field of Object.keys(aliases) as F[]) {
    const names = headerKeys.filter((key) => aliases[field].includes(key))
    if (names.length > 1) return null
    if (names.length === 1) found[field] = names[0]
  }
  return found
}
