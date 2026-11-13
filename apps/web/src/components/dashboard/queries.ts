import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import {
  dashboardControllerHistory,
  dashboardControllerOverview,
  dashboardControllerReview,
} from '#/api'
import { unwrap } from '#/lib/queries'

/** Months of history shown by the charts and the net worth sparkline. */
export const HISTORY_MONTHS = 12

export const dashboardKeys = {
  all: ['dashboard'] as const,
  overview: (month: string | undefined) =>
    ['dashboard', 'overview', month ?? 'default'] as const,
  history: (months: number) => ['dashboard', 'history', months] as const,
  review: (month: string | undefined) =>
    ['dashboard', 'review', month ?? 'default'] as const,
}

/**
 * Net worth, accounts and `month`; without it, the month the API picks (the
 * current one when it has data, else the month the data stops in).
 * Refetched on mount: imports and corrections change it elsewhere.
 */
export function dashboardOverviewQuery(month?: string) {
  return queryOptions({
    queryKey: dashboardKeys.overview(month),
    queryFn: () =>
      unwrap(
        dashboardControllerOverview({
          ...(month ? { query: { month } } : {}),
          throwOnError: false,
        }),
      ),
    staleTime: 0,
    // Switching month keeps the page in place until the new figures arrive.
    placeholderData: keepPreviousData,
  })
}

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

/**
 * Review of `month`; without it, the previous calendar month (decided by the
 * API in Europe/Paris).
 */
export function dashboardReviewQuery(month?: string) {
  return queryOptions({
    queryKey: dashboardKeys.review(month),
    queryFn: () =>
      unwrap(
        dashboardControllerReview({
          ...(month ? { query: { month } } : {}),
          throwOnError: false,
        }),
      ),
    staleTime: 0,
    placeholderData: keepPreviousData,
  })
}
