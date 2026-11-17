import { queryOptions } from '@tanstack/react-query'
import { coverageControllerCoverage } from '#/api'
import type { CoverageDto } from '#/api/types.gen'
import { unwrap } from '#/lib/queries'

/**
 * How far the data goes (`GET /coverage`): the month pages open on without a
 * `month` in the URL and the months that have transactions, for the month
 * navigators. Always refetched on mount: an import or a manual transaction
 * moves it, and it is cheap.
 */
export const coverageQuery = queryOptions({
  queryKey: ['coverage'] as const,
  queryFn: (): Promise<CoverageDto> => unwrap(coverageControllerCoverage()),
  staleTime: 0,
})

/**
 * The month to offer from an empty one: the latest month with data before
 * `month`, else the earliest after it; null when no month has data.
 */
export function nearestMonthWithData(
  months: readonly string[],
  month: string,
): string | null {
  const before = months.filter((m) => m < month)
  if (before.length > 0) return before[before.length - 1]
  return months.find((m) => m > month) ?? null
}
