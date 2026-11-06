import { z } from 'zod'
import {
  decimalFromJsonNumber,
  JSON_NUMBER_MARK,
  quoteJsonNumbers,
} from './decimal'
import {
  type CryptoAsset,
  type PriceProvider,
  PriceProviderError,
} from './price-provider'

export const DEFAULT_PRICE_API_URL = 'https://api.coingecko.com/api/v3'
/** Requests are abandoned after this long. */
export const PRICE_API_TIMEOUT_MS = 5_000
const MAX_BODY_LENGTH = 1_000_000
const SEARCH_LIMIT = 10

/** A JSON number, quoted by `quoteJsonNumbers`: its exact literal text. */
const jsonNumber = z
  .string()
  .startsWith(JSON_NUMBER_MARK)
  .transform((value) => value.slice(JSON_NUMBER_MARK.length))
const pricesSchema = z.record(
  z.string(),
  z.looseObject({ eur: jsonNumber.optional() }),
)
const searchSchema = z.looseObject({
  coins: z.array(
    z.looseObject({
      id: z.string().min(1),
      symbol: z.string(),
      name: z.string(),
      market_cap_rank: jsonNumber.nullish(),
    }),
  ),
})

interface CoinGeckoOptions {
  baseUrl?: string
  timeoutMs?: number
  /** Injected in tests; the global `fetch` otherwise. */
  fetch?: typeof fetch
}

/**
 * Key-less CoinGecko public API: `simple/price` for EUR prices (all assets in
 * one call, `precision=full`) and `search` for the asset picker. Prices are
 * read from the JSON text into exact decimal strings, never floats.
 */
export class CoinGeckoPriceProvider implements PriceProvider {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchFn: typeof fetch

  constructor(options: CoinGeckoOptions = {}) {
    const base = options.baseUrl ?? DEFAULT_PRICE_API_URL
    this.baseUrl = base.endsWith('/') ? base : `${base}/`
    this.timeoutMs = options.timeoutMs ?? PRICE_API_TIMEOUT_MS
    this.fetchFn = options.fetch ?? fetch
  }

  async fetchEurPrices(
    assetIds: readonly string[],
  ): Promise<Map<string, string>> {
    const prices = new Map<string, string>()
    if (assetIds.length === 0) return prices
    const body = await this.getJson('simple/price', {
      ids: assetIds.join(','),
      vs_currencies: 'eur',
      precision: 'full',
    })
    const parsed = pricesSchema.safeParse(body)
    if (!parsed.success) throw new PriceProviderError('malformed')
    for (const id of assetIds) {
      const literal = parsed.data[id]?.eur
      if (literal === undefined) continue
      const price = decimalFromJsonNumber(literal)
      if (price === null) throw new PriceProviderError('malformed')
      prices.set(id, price)
    }
    return prices
  }

  async searchAssets(query: string): Promise<CryptoAsset[]> {
    const body = await this.getJson('search', { query })
    const parsed = searchSchema.safeParse(body)
    if (!parsed.success) throw new PriceProviderError('malformed')
    return parsed.data.coins.slice(0, SEARCH_LIMIT).map((coin) => {
      const rank = coin.market_cap_rank ? Number(coin.market_cap_rank) : NaN
      return {
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        rank: Number.isSafeInteger(rank) ? rank : null,
      }
    })
  }

  private async getJson(
    path: string,
    params: Record<string, string>,
  ): Promise<unknown> {
    const url = new URL(path, this.baseUrl)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
    let text: string
    try {
      const response = await this.fetchFn(url, {
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (response.status === 429) {
        throw new PriceProviderError('rate_limited', 429)
      }
      if (!response.ok) throw new PriceProviderError('http', response.status)
      text = await response.text()
    } catch (error) {
      if (error instanceof PriceProviderError) throw error
      const name = (error as { name?: string } | null)?.name
      throw new PriceProviderError(
        name === 'TimeoutError' || name === 'AbortError'
          ? 'timeout'
          : 'network',
      )
    }
    if (text.length > MAX_BODY_LENGTH) throw new PriceProviderError('malformed')
    try {
      return JSON.parse(quoteJsonNumbers(text)) as unknown
    } catch {
      throw new PriceProviderError('malformed')
    }
  }
}
