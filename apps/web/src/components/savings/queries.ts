import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { savingsControllerOverview, savingsControllerSetTarget } from '#/api'
import { unwrap } from '#/lib/queries'

/** Months in the savings chart (current one included). */
export const SAVINGS_MONTHS = 12

export const savingsKeys = {
  all: ['savings'] as const,
  overview: (months: number, month: string | null) =>
    ['savings', 'overview', months, month] as const,
}

/**
 * Monthly savings, averages, target and stock; the headline figures for
 * `month` (absent: the month the API picks). Always refetched on mount.
 */
export function savingsOverviewQuery(month?: string, months = SAVINGS_MONTHS) {
  return queryOptions({
    queryKey: savingsKeys.overview(months, month ?? null),
    queryFn: () =>
      unwrap(
        savingsControllerOverview({
          query: { months, ...(month ? { month } : {}) },
          throwOnError: false,
        }),
      ),
    staleTime: 0,
  })
}

/** Sets the monthly savings target (null clears it). */
export function saveTarget(monthlyTargetCents: number | null) {
  return unwrap(
    savingsControllerSetTarget({
      body: { monthlyTargetCents },
      throwOnError: false,
    }),
  )
}

/** The target feeds every savings view: refetch them all. */
export function afterSavingsChanged(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: savingsKeys.all })
}
