import { z } from 'zod'
import { isMonth } from '#/lib/calendar'

/**
 * Filters of the spending page, kept in the URL search params so a reload,
 * the back button or a shared link restore them. An absent field is the
 * default: current month, one-offs left out, every account, 6-month average,
 * trend of the top categories, category rows compared with the previous
 * month. Invalid values are dropped.
 */

/** `trend` value for the expenses without a category. */
export const UNCATEGORIZED = 'none'

/** Average windows offered, in full months before the selected one. */
export const AVERAGE_PERIODS = [3, 6, 12] as const
export type AveragePeriod = (typeof AVERAGE_PERIODS)[number]
export const DEFAULT_AVERAGE_PERIOD: AveragePeriod = 6

export const spendingSearchSchema = z.object({
  month: z
    .string()
    .refine((value) => isMonth(value))
    .optional()
    .catch(undefined),
  oneOffs: z.literal(true).optional().catch(undefined),
  account: z.guid().optional().catch(undefined),
  /** Category shown alone in the trend. */
  trend: z
    .union([z.guid(), z.literal(UNCATEGORIZED)])
    .optional()
    .catch(undefined),
  avg: z
    .union([z.literal(3), z.literal(12)])
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
