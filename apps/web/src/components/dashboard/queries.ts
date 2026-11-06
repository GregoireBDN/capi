import { queryOptions } from '@tanstack/react-query'
import { dashboardControllerHistory, dashboardControllerOverview } from '#/api'
import { unwrap } from '#/lib/queries'

/** Months of history shown by the charts and the net worth sparkline. */
export const HISTORY_MONTHS = 12

export const dashboardKeys = {
  all: ['dashboard'] as const,
  overview: ['dashboard', 'overview'] as const,
  history: (months: number) => ['dashboard', 'history', months] as const,
}

/**
 * Net worth, accounts and the current month (Europe/Paris, decided by the
 * API). Refetched on mount: imports and corrections change it elsewhere.
 */
export const dashboardOverviewQuery = queryOptions({
  queryKey: dashboardKeys.overview,
  queryFn: () => unwrap(dashboardControllerOverview({ throwOnError: false })),
  staleTime: 0,
})

export function dashboardHistoryQuery(months = HISTORY_MONTHS) {
  return queryOptions({
    queryKey: dashboardKeys.history(months),
    queryFn: () =>
      unwrap(
        dashboardControllerHistory({ query: { months }, throwOnError: false }),
      ),
    staleTime: 0,
  })
}
