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
