import { z } from 'zod'
import { isMonth } from '#/lib/calendar'
import { VIEWS } from './kinds'

/**
 * Filters of the spending page, kept in the URL search params so a reload,
 * the back button or a shared link restore them. An absent field is the
 * default: Dépenses, current month, one-offs left out, every account,
 * trend of the top categories, category rows compared with
 * the previous month. Invalid values are dropped.
 */

/** `trend` value for the rows without a category (or account, Épargne). */
export const UNCATEGORIZED = 'none'

/**
 * Full months the averages cover (#410: the owner fixed it at 12, no
 * choice).
 */
export const AVERAGE_MONTHS = 12

export const spendingSearchSchema = z.object({
  /** The part shown (#410): Revenus or Épargne; Dépenses when absent. */
  vue: z.enum(VIEWS).optional().catch(undefined),
  month: z
    .string()
    .refine((value) => isMonth(value))
    .optional()
    .catch(undefined),
  oneOffs: z.literal(true).optional().catch(undefined),
  account: z.guid().optional().catch(undefined),
  /** Category (account, in Épargne) shown alone in the trend. */
  trend: z
    .union([z.guid(), z.literal(UNCATEGORIZED)])
    .optional()
    .catch(undefined),
  /** Category rows compared with the average rather than the month before. */
  cmp: z.literal('avg').optional().catch(undefined),
})

export type SpendingSearch = z.infer<typeof spendingSearchSchema>

/** The search without its `undefined` fields (cleaner URLs and keys). */
export function compactSearch(search: SpendingSearch): SpendingSearch {
  const entries = Object.entries(search as Record<string, unknown>)
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined))
}

/** Router `validateSearch`: keeps the valid params, drops the others. */
export function parseSpendingSearch(
  search: Record<string, unknown>,
): SpendingSearch {
  return compactSearch(spendingSearchSchema.parse(search))
}
