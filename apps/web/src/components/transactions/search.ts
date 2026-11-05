import { z } from 'zod'
import type {
  TransactionsControllerListData,
  TransactionSort,
} from '#/api/types.gen'
import { currentMonth, isMonth } from '#/lib/calendar'

/**
 * Filters of the transactions page, kept in the URL search params so a
 * reload, the back button or a shared link restore them. Every field is
 * optional: an absent field is the default (current month, everything,
 * newest first). Invalid values are dropped rather than failing the page.
 */

/** `month` value that lifts the month restriction. */
export const ALL_MONTHS = 'all'
/** `category` value for transactions without a category. */
export const UNCATEGORIZED = 'none'

export const SORTS: readonly TransactionSort[] = [
  'date_desc',
  'date_asc',
  'amount_asc',
  'amount_desc',
]
export const SORT_LABELS: Record<TransactionSort, string> = {
  date_desc: 'Plus récentes',
  date_asc: 'Plus anciennes',
  // Signed amounts: ascending puts the biggest debits first.
  amount_asc: 'Débits d’abord',
  amount_desc: 'Crédits d’abord',
}

const SEARCH_MAX = 200

/** The router parses `?q=123` as a number: read it back as text. */
const text = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim().slice(0, SEARCH_MAX))
  .transform((value) => (value === '' ? undefined : value))

/** Only `true` is meaningful for the toggles; anything else is "off". */
const flag = z.literal(true).optional().catch(undefined)

export const transactionsSearchSchema = z.object({
  month: z
    .string()
    .refine((value) => value === ALL_MONTHS || isMonth(value))
    .optional()
    .catch(undefined),
  account: z.guid().optional().catch(undefined),
  category: z
    .union([z.guid(), z.literal(UNCATEGORIZED)])
    .optional()
    .catch(undefined),
  kind: z.enum(['expense', 'income', 'transfer']).optional().catch(undefined),
  q: text.optional().catch(undefined),
  review: flag,
  oneOff: flag,
  sort: z
    .enum(SORTS as [TransactionSort, ...TransactionSort[]])
    .optional()
    .catch(undefined),
})

export type TransactionsSearch = z.infer<typeof transactionsSearchSchema>

/** Router `validateSearch`: keeps the valid params, drops absent ones. */
export function parseTransactionsSearch(
  search: Record<string, unknown>,
): TransactionsSearch {
  return compactSearch(transactionsSearchSchema.parse(search))
}

/** The search without its `undefined` fields (cleaner URLs and keys). */
export function compactSearch(search: TransactionsSearch): TransactionsSearch {
  const entries = Object.entries(search as Record<string, unknown>)
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined))
}

/** Filters sent to `GET /transactions` and `/transactions/summary`. */
export type TransactionFilters = Omit<
  NonNullable<TransactionsControllerListData['query']>,
  'sort' | 'page' | 'limit'
>

/** The API filters a search stands for (`month` defaults to `today`'s). */
export function toFilters(
  search: TransactionsSearch,
  today: string = currentMonth(),
): TransactionFilters {
  const filters: TransactionFilters = {}
  if (search.month !== ALL_MONTHS) filters.month = search.month ?? today
  if (search.account) filters.accountId = search.account
  if (search.category === UNCATEGORIZED) filters.uncategorized = true
  else if (search.category) filters.categoryId = search.category
  if (search.kind) filters.kind = search.kind
  if (search.q) filters.q = search.q
  if (search.review) filters.needsReview = true
  if (search.oneOff) filters.isOneOff = true
  return filters
}

/** Filters set besides the month and the sort (for "Réinitialiser"). */
export function activeFilterCount(search: TransactionsSearch): number {
  return [
    search.account,
    search.category,
    search.kind,
    search.q,
    search.review,
    search.oneOff,
  ].filter((value) => value !== undefined).length
}

/** True when the search differs from the defaults in any way. */
export function isDefaultSearch(search: TransactionsSearch): boolean {
  return Object.keys(compactSearch(search)).length === 0
}
