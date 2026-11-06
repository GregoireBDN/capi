import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { spendingControllerByCategory, spendingControllerTrend } from '#/api'
import type {
  SpendingControllerByCategoryData,
  SpendingControllerTrendData,
} from '#/api/types.gen'
import { unwrap } from '#/lib/queries'

export type ByCategoryFilters = NonNullable<
  SpendingControllerByCategoryData['query']
>
export type TrendFilters = NonNullable<SpendingControllerTrendData['query']>

export const spendingKeys = {
  all: ['spending'] as const,
  byCategory: (filters: ByCategoryFilters) =>
    ['spending', 'by-category', filters] as const,
  trend: (filters: TrendFilters) => ['spending', 'trend', filters] as const,
}

export function spendingByCategoryQuery(filters: ByCategoryFilters) {
  return queryOptions({
    queryKey: spendingKeys.byCategory(filters),
    queryFn: () =>
      unwrap(
        spendingControllerByCategory({ query: filters, throwOnError: false }),
      ),
    // Changing month or filter keeps the page in place until the new figures
    // arrive, instead of flashing placeholders.
    placeholderData: keepPreviousData,
  })
}

export function spendingTrendQuery(filters: TrendFilters) {
  return queryOptions({
    queryKey: spendingKeys.trend(filters),
    queryFn: () =>
      unwrap(spendingControllerTrend({ query: filters, throwOnError: false })),
    placeholderData: keepPreviousData,
  })
}
