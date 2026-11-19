import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  accountsControllerChangeCryptoSource,
  accountHoldingsControllerCreate,
  accountHoldingsControllerList,
  accountHoldingsControllerRemove,
  accountHoldingsControllerSync,
  accountHoldingsControllerUpdate,
  accountHoldingsControllerValuate,
  cryptoControllerPortfolio,
  cryptoControllerRefreshPortfolio,
  cryptoControllerSearch,
  cryptoControllerSetPrice,
  cryptoControllerSettings,
  walletKeysControllerAdd,
  walletKeysControllerList,
  walletKeysControllerRemove,
  walletKeysControllerUpdate,
  walletTokensControllerAdd,
  walletTokensControllerList,
  walletTokensControllerRemove,
} from '#/api'
import type {
  AddWalletTokenDto,
  ChangeCryptoSourceDto,
  SaveHoldingDto,
  WalletKeyAddressTypeChoice,
  WalletKeyInputDto,
} from '#/api/types.gen'
import { afterSnapshotsChanged } from '#/components/accounts/queries'
import { unwrap } from '#/lib/queries'

export const cryptoKeys = {
  all: ['crypto'] as const,
  holdings: (accountId: string) => ['crypto', 'holdings', accountId] as const,
  assets: (query: string) => ['crypto', 'assets', query] as const,
  portfolio: ['crypto', 'portfolio'] as const,
  settings: ['crypto', 'settings'] as const,
  walletKeys: (accountId: string) =>
    ['crypto', 'wallet-keys', accountId] as const,
  walletTokens: (accountId: string) =>
    ['crypto', 'wallet-tokens', accountId] as const,
}

/** The Crypto page (#295): every asset summed over the accounts. */
export const cryptoPortfolioQuery = queryOptions({
  queryKey: cryptoKeys.portfolio,
  queryFn: () => unwrap(cryptoControllerPortfolio({ throwOnError: false })),
  // Price ages depend on "now"; the API rate-limits the actual refreshes.
  staleTime: 0,
})

/** « Actualiser » of the section: the wallets' chains, then the prices. */
export function refreshPortfolio() {
  return unwrap(cryptoControllerRefreshPortfolio({ throwOnError: false }))
}

/** What this server reads by itself (price API, wallet sync). */
export const cryptoSettingsQuery = queryOptions({
  queryKey: cryptoKeys.settings,
  queryFn: () => unwrap(cryptoControllerSettings({ throwOnError: false })),
  staleTime: 5 * 60_000,
})

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

/** Turns a manual crypto account into an exchange or a wallet (#207). */
export function changeCryptoSource(
  accountId: string,
  body: ChangeCryptoSourceDto,
) {
  return unwrap(
    accountsControllerChangeCryptoSource({
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

/** Sets the address type of an xpub (or asks to detect it). */
export function updateWalletKeyAddressType(
  accountId: string,
  keyId: string,
  addressType: WalletKeyAddressTypeChoice,
) {
  return unwrap(
    walletKeysControllerUpdate({
      path: { id: accountId, keyId },
      body: { addressType },
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

/** "Synchroniser": reads the wallet on chain, then values the account. */
export function syncWallet(accountId: string) {
  return unwrap(
    accountHoldingsControllerSync({
      path: { id: accountId },
      throwOnError: false,
    }),
  )
}

/** Tokens a wallet account reads on its EVM chains ("Ajouter un jeton"). */
export function walletTokensQuery(accountId: string) {
  return queryOptions({
    queryKey: cryptoKeys.walletTokens(accountId),
    queryFn: () =>
      unwrap(
        walletTokensControllerList({
          path: { id: accountId },
          throwOnError: false,
        }),
      ),
  })
}

export function addWalletToken(accountId: string, body: AddWalletTokenDto) {
  return unwrap(
    walletTokensControllerAdd({
      path: { id: accountId },
      body,
      throwOnError: false,
    }),
  )
}

export function removeWalletToken(accountId: string, tokenId: string) {
  return unwrap(
    walletTokensControllerRemove({
      path: { id: accountId, tokenId },
      throwOnError: false,
    }),
  )
}
