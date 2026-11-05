/**
 * Domain value lists backing the Postgres enums. The web app gets them through
 * the generated OpenAPI client. Changing a list requires a new migration.
 */

export const ACCOUNT_TYPES = [
  'checking',
  'savings',
  'brokerage',
  'life_insurance',
  'employee_savings',
  'crypto',
] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

/** Fed by imports; balance comes from transactions. */
export const TRANSACTIONAL_ACCOUNT_TYPES = [
  'checking',
  'savings',
] as const satisfies readonly AccountType[]

/** Tracked by dated value snapshots. */
export const INVESTMENT_ACCOUNT_TYPES = [
  'brokerage',
  'life_insurance',
  'employee_savings',
  'crypto',
] as const satisfies readonly AccountType[]

/** `transfer` = move between the user's own accounts, never counted as income or expense. */
export const TRANSACTION_KINDS = ['expense', 'income', 'transfer'] as const
export type TransactionKind = (typeof TRANSACTION_KINDS)[number]

export const RULE_MATCH_TYPES = ['contains', 'regex'] as const
export type RuleMatchType = (typeof RULE_MATCH_TYPES)[number]

export const IMPORT_SOURCES = ['cic_csv', 'spreadsheet'] as const
export type ImportSource = (typeof IMPORT_SOURCES)[number]
