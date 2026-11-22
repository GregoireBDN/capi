import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  dividendsControllerCreate,
  dividendsControllerList,
  dividendsControllerRemove,
  dividendsControllerUpdate,
  positionsControllerGet,
  positionsControllerRemoveLine,
  positionsControllerRemoveStatement,
  positionsControllerSetCash,
  positionsControllerUpsertLine,
  securitiesControllerList,
  securitiesControllerSetPrice,
} from '#/api'
import type { SaveDividendDto, UpsertLineDto } from '#/api/types.gen'
import { afterSnapshotsChanged } from '#/components/accounts/queries'
import { referenceKeys, unwrap } from '#/lib/queries'

/** A PEA's lines (ADR 0006): under the account's key, refreshed with it. */
export const positionKeys = {
  account: (id: string) =>
    [...referenceKeys.accounts, id, 'positions'] as const,
  securities: ['securities'] as const,
  dividends: (id: string) =>
    [...referenceKeys.accounts, id, 'dividends'] as const,
}

export function positionsQuery(accountId: string) {
  return queryOptions({
    queryKey: positionKeys.account(accountId),
    queryFn: () =>
      unwrap(
        positionsControllerGet({
          path: { id: accountId },
          throwOnError: false,
        }),
      ),
    staleTime: 0,
  })
}

export const securitiesQuery = queryOptions({
  queryKey: positionKeys.securities,
  queryFn: () => unwrap(securitiesControllerList({ throwOnError: false })),
})

export function upsertLine(
  accountId: string,
  isin: string,
  body: UpsertLineDto,
) {
  return unwrap(
    positionsControllerUpsertLine({
      path: { id: accountId, isin },
      body,
      throwOnError: false,
    }),
  )
}

export function removeLine(accountId: string, isin: string) {
  return unwrap(
    positionsControllerRemoveLine({
      path: { id: accountId, isin },
      throwOnError: false,
    }),
  )
}

export function setCash(accountId: string, cashCents: number) {
  return unwrap(
    positionsControllerSetCash({
      path: { id: accountId },
      body: { cashCents },
      throwOnError: false,
    }),
  )
}

export function removeStatement(accountId: string, asOf: string) {
  return unwrap(
    positionsControllerRemoveStatement({
      path: { id: accountId, asOf },
      throwOnError: false,
    }),
  )
}

export function setPrice(isin: string, day: string, priceEur: string) {
  return unwrap(
    securitiesControllerSetPrice({
      path: { isin, day },
      body: { priceEur },
      throwOnError: false,
    }),
  )
}

/**
 * Lines and prices change the account's computed values: its performance,
 * the lists, the net worth and Épargne (the account keys cover the lines).
 */
export function afterPositionsChanged(queryClient: QueryClient) {
  return Promise.all([
    afterSnapshotsChanged(queryClient),
    queryClient.invalidateQueries({ queryKey: positionKeys.securities }),
  ])
}

/** A compte-titres' dividends (#414), information only. */
export function dividendsQuery(accountId: string) {
  return queryOptions({
    queryKey: positionKeys.dividends(accountId),
    queryFn: () =>
      unwrap(
        dividendsControllerList({
          path: { id: accountId },
          throwOnError: false,
        }),
      ),
  })
}

export function createDividend(accountId: string, body: SaveDividendDto) {
  return unwrap(
    dividendsControllerCreate({
      path: { id: accountId },
      body,
      throwOnError: false,
    }),
  )
}

export function updateDividend(
  accountId: string,
  dividendId: string,
  body: SaveDividendDto,
) {
  return unwrap(
    dividendsControllerUpdate({
      path: { id: accountId, dividendId },
      body,
      throwOnError: false,
    }),
  )
}

export function removeDividend(accountId: string, dividendId: string) {
  return unwrap(
    dividendsControllerRemove({
      path: { id: accountId, dividendId },
      throwOnError: false,
    }),
  )
}
