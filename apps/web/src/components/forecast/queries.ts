import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { forecastControllerForecast } from '#/api'
import { unwrap } from '#/lib/queries'

export interface ForecastParams {
  /** Selected accounts; undefined lets the API pick the checking accounts. */
  accountIds?: readonly string[]
  thresholdCents: number
  includeVariable: boolean
}

export const forecastKeys = {
  all: ['forecast'] as const,
  detail: ({ accountIds, thresholdCents, includeVariable }: ForecastParams) =>
    [
      'forecast',
      accountIds ? [...accountIds].sort().join(',') : 'default',
      thresholdCents,
      includeVariable,
    ] as const,
}

/**
 * End-of-month projection (today and the month in Europe/Paris, decided by
 * the API). Refetched on mount: imports and recurring items change it
 * elsewhere. The previous projection stays on screen while a new setting
 * loads.
 */
export function forecastQuery(params: ForecastParams) {
  return queryOptions({
    queryKey: forecastKeys.detail(params),
    queryFn: () =>
      unwrap(
        forecastControllerForecast({
          query: {
            accountIds: params.accountIds?.join(','),
            threshold: params.thresholdCents,
            includeVariable: params.includeVariable,
          },
          throwOnError: false,
        }),
      ),
    staleTime: 0,
    placeholderData: keepPreviousData,
  })
}
