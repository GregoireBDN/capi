/**
 * Source of EUR crypto prices, behind an interface so the provider can be
 * swapped. Privacy: implementations only ever receive asset ids (and the
 * search text), never quantities or values.
 */

export interface CryptoAsset {
  /** Provider asset id, e.g. `bitcoin`. */
  id: string
  /** Ticker, upper case, e.g. `BTC`. */
  symbol: string
  name: string
  /** Market-cap rank when the provider knows it. */
  rank: number | null
}

export interface PriceProvider {
  /**
   * EUR prices of the given assets as exact decimal strings, in one request.
   * Assets the provider does not know are missing from the map.
   */
  fetchEurPrices(assetIds: readonly string[]): Promise<Map<string, string>>
  searchAssets(query: string): Promise<CryptoAsset[]>
}

export type PriceProviderFailure =
  | 'timeout'
  | 'network'
  | 'rate_limited'
  | 'http'
  | 'malformed'

export class PriceProviderError extends Error {
  constructor(
    readonly reason: PriceProviderFailure,
    readonly status?: number,
  ) {
    super(`Price provider failure: ${reason}${status ? ` (${status})` : ''}`)
    this.name = 'PriceProviderError'
  }
}

/** Nest token of the `CryptoPriceOptions` object. */
export const CRYPTO_PRICE_OPTIONS = Symbol('CRYPTO_PRICE_OPTIONS')

export interface CryptoPriceOptions {
  /** Null when the price API is disabled: only manual prices are used. */
  provider: PriceProvider | null
  /** How long a fetched price is fresh. */
  ttlMs: number
}
