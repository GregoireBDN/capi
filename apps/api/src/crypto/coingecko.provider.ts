import { z } from 'zod'
import {
  decimalFromJsonNumber,
  JSON_NUMBER_MARK,
  quoteJsonNumbers,
  signedDecimalFromJsonNumber,
} from '#/common/decimal'
import {
  type CryptoAsset,
  type EurQuote,
  type PricePoint,
  type PriceProvider,
  PriceProviderError,
} from './price-provider'
import type {
  EvmChain,
  TokenContractProvider,
  TokenDeployment,
} from './wallet-sync/chain-provider'
import { chainOfPlatform } from './wallet-sync/chains'

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
  z.looseObject({
    eur: jsonNumber.optional(),
    // Read leniently: a change we cannot read never drops the prices.
    eur_24h_change: z.unknown().optional(),
  }),
)
const historySchema = z.looseObject({
  prices: z.array(z.tuple([jsonNumber, jsonNumber.nullable()])),
})
/** The key-less API serves at most the last 365 days of history. */
export const PRICE_HISTORY_MAX_DAYS = 365

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

const platformsSchema = z.looseObject({
  detail_platforms: z
    .record(
      z.string(),
      z
        .looseObject({
          decimal_place: jsonNumber.nullish(),
          contract_address: z.string().nullish(),
        })
        .nullable(),
    )
    .nullish(),
})
const CONTRACT_ADDRESS = /^0x[0-9a-fA-F]{40}$/
/** Token decimals beyond this are not ERC-20 tokens we can hold exactly. */
const MAX_TOKEN_DECIMALS = 36

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
export class CoinGeckoPriceProvider
  implements PriceProvider, TokenContractProvider
{
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
    const quotes = await this.fetchEurQuotes(assetIds)
    return new Map([...quotes].map(([id, quote]) => [id, quote.priceEur]))
  }

  /**
   * EUR prices with their change over 24 hours (`include_24hr_change`, same
   * single request: only the asset ids are sent).
   */
  async fetchEurQuotes(
    assetIds: readonly string[],
  ): Promise<Map<string, EurQuote>> {
    const quotes = new Map<string, EurQuote>()
    if (assetIds.length === 0) return quotes
    const body = await this.getJson('simple/price', {
      ids: assetIds.join(','),
      vs_currencies: 'eur',
      precision: 'full',
      include_24hr_change: 'true',
    })
    const parsed = pricesSchema.safeParse(body)
    if (!parsed.success) throw new PriceProviderError('malformed')
    for (const id of assetIds) {
      const entry = parsed.data[id]
      const literal = entry?.eur
      if (literal === undefined) continue
      const price = decimalFromJsonNumber(literal)
      if (price === null) throw new PriceProviderError('malformed')
      const change = entry.eur_24h_change
      quotes.set(id, {
        priceEur: price,
        change24hPercent:
          typeof change === 'string' && change.startsWith(JSON_NUMBER_MARK)
            ? signedDecimalFromJsonNumber(change.slice(JSON_NUMBER_MARK.length))
            : null,
      })
    }
    return quotes
  }

  /**
   * Daily EUR prices of one asset (`coins/:id/market_chart`, `interval=daily`,
   * at most `PRICE_HISTORY_MAX_DAYS` days on the key-less API): one point per
   * day at 00:00 UTC, then the current price. Only the asset id is sent.
   */
  async fetchEurHistory(assetId: string, days: number): Promise<PricePoint[]> {
    const span = Math.max(1, Math.min(PRICE_HISTORY_MAX_DAYS, Math.ceil(days)))
    const body = await this.getJson(
      `coins/${encodeURIComponent(assetId)}/market_chart`,
      {
        vs_currency: 'eur',
        days: String(span),
        interval: 'daily',
        precision: 'full',
      },
    )
    const parsed = historySchema.safeParse(body)
    if (!parsed.success) throw new PriceProviderError('malformed')
    const points: PricePoint[] = []
    for (const [time, price] of parsed.data.prices) {
      const ms = Number(time)
      if (!Number.isSafeInteger(ms) || price === null) continue
      const priceEur = decimalFromJsonNumber(price)
      if (priceEur === null) continue
      points.push({ at: new Date(ms), priceEur })
    }
    return points.sort((a, b) => a.at.getTime() - b.at.getTime())
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

  /**
   * Contract address and decimals of a token on each supported EVM chain
   * (`coins/:id` platforms). Only the asset id is sent.
   */
  async tokenDeployments(
    assetId: string,
  ): Promise<Partial<Record<EvmChain, TokenDeployment>>> {
    const body = await this.getJson(`coins/${encodeURIComponent(assetId)}`, {
      localization: 'false',
      tickers: 'false',
      market_data: 'false',
      community_data: 'false',
      developer_data: 'false',
      sparkline: 'false',
    })
    const parsed = platformsSchema.safeParse(body)
    if (!parsed.success) throw new PriceProviderError('malformed')
    const deployments: Partial<Record<EvmChain, TokenDeployment>> = {}
    for (const [platform, detail] of Object.entries(
      parsed.data.detail_platforms ?? {},
    )) {
      const chain = chainOfPlatform(platform)
      const address = detail?.contract_address
      const decimals = Number(detail?.decimal_place ?? NaN)
      if (
        !chain ||
        !address ||
        !CONTRACT_ADDRESS.test(address) ||
        !Number.isInteger(decimals) ||
        decimals < 0 ||
        decimals > MAX_TOKEN_DECIMALS
      ) {
        continue
      }
      deployments[chain] = { address, decimals }
    }
    return deployments
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
