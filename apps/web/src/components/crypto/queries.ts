import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  accountHoldingsControllerCreate,
  accountHoldingsControllerList,
  accountHoldingsControllerRemove,
  accountHoldingsControllerUpdate,
  accountHoldingsControllerValuate,
  cryptoControllerSearch,
  cryptoControllerSetPrice,
  cryptoControllerSummary,
  cryptoControllerValuate,
  walletKeysControllerAdd,
  walletKeysControllerList,
  walletKeysControllerRemove,
} from '#/api'
import type { SaveHoldingDto, WalletKeyInputDto } from '#/api/types.gen'
import { afterSnapshotsChanged } from '#/components/accounts/queries'
import { unwrap } from '#/lib/queries'

export const cryptoKeys = {
  all: ['crypto'] as const,
  holdings: (accountId: string) => ['crypto', 'holdings', accountId] as const,
  assets: (query: string) => ['crypto', 'assets', query] as const,
  summary: ['crypto', 'summary'] as const,
  walletKeys: (accountId: string) =>
    ['crypto', 'wallet-keys', accountId] as const,
}

/** Every open crypto account with its valued holdings (the Crypto page). */
export const cryptoSummaryQuery = queryOptions({
  queryKey: cryptoKeys.summary,
  queryFn: () => unwrap(cryptoControllerSummary({ throwOnError: false })),
  // Price ages depend on "now"; the API rate-limits the actual refreshes.
  staleTime: 0,
})

/** "Actualiser les cours" of every crypto account, one batched request. */
export function refreshAllPrices() {
  return unwrap(cryptoControllerValuate({ throwOnError: false }))
}

export function holdingsQuery(accountId: string) {
  return queryOptions({
    queryKey: cryptoKeys.holdings(accountId),
    queryFn: () =>
      unwrap(
        accountHoldingsControllerList({
          path: { id: accountId },
          throwOnError: false,
        }),
      ),
    // Price ages depend on "now"; the API rate-limits the actual refreshes.
    staleTime: 0,
  })
}

export function assetSearchQuery(query: string) {
  return queryOptions({
    queryKey: cryptoKeys.assets(query),
    queryFn: () =>
      unwrap(
        cryptoControllerSearch({ query: { q: query }, throwOnError: false }),
      ),
    enabled: query.length >= 2,
    staleTime: 5 * 60_000,
  })
}

export function saveHolding(
  accountId: string,
  holdingId: string | undefined,
  body: SaveHoldingDto,
) {
  return unwrap(
    holdingId
      ? accountHoldingsControllerUpdate({
          path: { id: accountId, holdingId },
          body,
          throwOnError: false,
        })
      : accountHoldingsControllerCreate({
          path: { id: accountId },
          body,
          throwOnError: false,
        }),
  )
}

export function removeHolding(accountId: string, holdingId: string) {
  return unwrap(
    accountHoldingsControllerRemove({
      path: { id: accountId, holdingId },
      throwOnError: false,
    }),
  )
}

export function refreshPrices(accountId: string) {
  return unwrap(
    accountHoldingsControllerValuate({
      path: { id: accountId },
      throwOnError: false,
    }),
  )
}

export function setManualPrice(assetId: string, priceEur: string) {
  return unwrap(
    cryptoControllerSetPrice({
      path: { assetId },
      body: { priceEur },
      throwOnError: false,
    }),
  )
}

/**
 * Holdings changes and valuations write today's snapshot: refresh the
 * holdings and everything that reads snapshots.
 */
export function afterHoldingsChanged(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: cryptoKeys.all }),
    afterSnapshotsChanged(queryClient),
  ])
}

/** Public keys of a wallet account (session only, never cached for long). */
export function walletKeysQuery(accountId: string) {
  return queryOptions({
    queryKey: cryptoKeys.walletKeys(accountId),
    queryFn: () =>
      unwrap(
        walletKeysControllerList({
          path: { id: accountId },
          throwOnError: false,
        }),
      ),
  })
}

export function addWalletKey(accountId: string, body: WalletKeyInputDto) {
  return unwrap(
    walletKeysControllerAdd({
      path: { id: accountId },
      body,
      throwOnError: false,
    }),
  )
}

export function removeWalletKey(accountId: string, keyId: string) {
  return unwrap(
    walletKeysControllerRemove({
      path: { id: accountId, keyId },
      throwOnError: false,
    }),
  )
}
