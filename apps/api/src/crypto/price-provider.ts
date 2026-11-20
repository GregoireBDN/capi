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

/** A provider price with its change over 24 hours, exact decimal strings. */
export interface EurQuote {
  priceEur: string
  /** Signed percent (`"-1.25"`), null when the provider has none. */
  change24hPercent: string | null
}

/** A price at an instant, from the provider's daily history (#366). */
export interface PricePoint {
  at: Date
  /** Exact decimal string. */
  priceEur: string
}

export interface PriceProvider {
  /**
   * EUR prices of the given assets as exact decimal strings, in one request.
   * Assets the provider does not know are missing from the map.
   */
  fetchEurPrices(assetIds: readonly string[]): Promise<Map<string, string>>
  /**
   * The same request, each price with its change over 24 hours (#295) when
   * the provider gives it. Optional: without it, prices have no change.
   */
  fetchEurQuotes?(assetIds: readonly string[]): Promise<Map<string, EurQuote>>
  searchAssets(query: string): Promise<CryptoAsset[]>
  /**
   * EUR prices of one asset over the last `days` days (#366), one per day
   * (00:00 UTC) plus the current one last, oldest first. Only the asset id
   * is sent. Optional: without it, the daily close uses the stored prices.
   */
  fetchEurHistory?(assetId: string, days: number): Promise<PricePoint[]>
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
  /** Minimum spacing of two daily-history requests (#366); 0 by default. */
  historyIntervalMs?: number
}
