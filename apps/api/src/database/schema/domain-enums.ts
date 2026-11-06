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

export const RECURRING_CADENCES = [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
] as const
export type RecurringCadence = (typeof RECURRING_CADENCES)[number]

/** `debit` = money out (subscriptions, rent), `credit` = money in (salary). */
export const RECURRING_DIRECTIONS = ['debit', 'credit'] as const
export type RecurringDirection = (typeof RECURRING_DIRECTIONS)[number]

/** `fixed` = same price every time (±1 % or ±1 €), `variable` otherwise. */
export const RECURRING_AMOUNT_TYPES = ['fixed', 'variable'] as const
export type RecurringAmountType = (typeof RECURRING_AMOUNT_TYPES)[number]

/** Detected items start `suggested`; `dismissed` ones are never suggested again. */
export const RECURRING_STATUSES = [
  'suggested',
  'confirmed',
  'dismissed',
] as const
export type RecurringStatus = (typeof RECURRING_STATUSES)[number]
