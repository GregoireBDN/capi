import { Inject, Injectable, Logger } from '@nestjs/common'
import { inArray, sql } from 'drizzle-orm'
import { DatabaseService } from '#/database/database.service'
import { cryptoPricesTable } from '#/database/schema'
import type { CryptoPriceSource } from '#/database/schema/domain-enums'
import { searchBuiltinAssets } from './builtin-assets'
import { isContractAssetId } from './contract-assets'
import { fitsNumeric, formatDecimal, parseDecimal, rescale } from '#/common/decimal'
import type { CryptoPriceDto } from './dto/crypto.dto'
import {
  CRYPTO_PRICE_OPTIONS,
  type CryptoAsset,
  type CryptoPriceOptions,
  type EurQuote,
  PriceProviderError,
} from './price-provider'
import type { Quote } from './valuation'

/**
 * `none`: read the stored prices only. `auto`: ask the provider for prices
 * older than the TTL. `force`: ask for every price ("Actualiser les cours").
 */
export type RefreshMode = 'none' | 'auto' | 'force'

/** A forced refresh asks again for the same asset at most this often. */
export const FORCE_MIN_INTERVAL_MS = 15_000
const PRICE_SCALE = 12
const PRICE_INTEGER_DIGITS = 26
/** `numeric(12, 4)`: the change over 24 hours, in percent. */
const CHANGE_SCALE = 4
const CHANGE_INTEGER_DIGITS = 8

const p = cryptoPricesTable

interface PriceRow {
  assetId: string
  priceEur: string
  change24hPercent: string | null
}

/**
 * EUR prices of crypto assets. `crypto_prices` is both the cache (a price is
 * fresh for the TTL) and the last known price kept when the provider fails.
 * Provider calls batch every due asset in one request, are serialized, and
 * each asset is asked again at most once per TTL (`auto`) or per
 * `FORCE_MIN_INTERVAL_MS` (`force`), failures included.
 *
 * Privacy: the provider only receives asset ids; nothing about quantities or
 * values is sent or logged.
 */
@Injectable()
export class CryptoPricesService {
  private readonly logger = new Logger(CryptoPricesService.name)
  /** Last provider attempt per asset (epoch ms), successful or not. */
  private readonly attempts = new Map<string, number>()
  private queue: Promise<unknown> = Promise.resolve()

  // Explicit tokens: esbuild-based runners (tsx, used by the spec generator)
  // drop the reflected type of a parameter next to a decorated one.
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CRYPTO_PRICE_OPTIONS) private readonly options: CryptoPriceOptions,
  ) {}

  get enabled(): boolean {
    return this.options.provider !== null
  }

  get ttlMs(): number {
    return this.options.ttlMs
  }

  /** Stored prices of the assets, refreshed first according to `mode`. */
  async quotes(
    assetIds: readonly string[],
    mode: RefreshMode,
    now: Date = new Date(),
  ): Promise<{ quotes: Map<string, Quote>; refreshFailed: boolean }> {
    const ids = [...new Set(assetIds)]
    // Tokens known by their contract only have no provider id (#269).
    const priced = ids.filter((id) => !isContractAssetId(id))
    let refreshFailed = false
    if (priced.length > 0 && mode !== 'none' && this.enabled) {
      refreshFailed = await this.serialized(() =>
        this.refresh(priced, mode, now),
      )
    }
    return { quotes: await this.load(ids), refreshFailed }
  }

  /**
   * Whether an `auto` refresh would ask the provider for any of these
   * assets (#381): a price missing or older than the TTL, not asked within
   * the TTL. Read from the stored quotes and memory: no request.
   */
  refreshDue(
    assetIds: readonly string[],
    quotes: ReadonlyMap<string, Quote>,
    now: Date = new Date(),
  ): boolean {
    if (!this.enabled) return false
    const at = now.getTime()
    return assetIds.some(
      (id) =>
        !isContractAssetId(id) && this.isDue(id, quotes.get(id), 'auto', at),
    )
  }

  /** Sets a price by hand (used when the price API is disabled or lacks it). */
  async setManualPrice(
    assetId: string,
    priceEur: string,
    now: Date = new Date(),
  ): Promise<CryptoPriceDto> {
    const [row] = await this.upsert(
      // A price typed by hand has no change over 24 hours.
      [
        {
          assetId,
          priceEur: canonicalPrice(priceEur)!,
          change24hPercent: null,
        },
      ],
      'manual',
      now,
    )
    return {
      assetId: row.assetId,
      priceEur: formatDecimal(parseDecimal(row.priceEur)!),
      source: row.source,
      fetchedAt: row.fetchedAt.toISOString(),
    }
  }

  /** Provider search, or the built-in list when it is disabled or fails. */
  async search(query: string): Promise<CryptoAsset[]> {
    const provider = this.options.provider
    if (provider) {
      try {
        return await provider.searchAssets(query)
      } catch (error) {
        this.logger.warn(`Asset search failed (${failureReason(error)})`)
      }
    }
    return searchBuiltinAssets(query)
  }

  private async refresh(
    ids: string[],
    mode: 'auto' | 'force',
    now: Date,
  ): Promise<boolean> {
    const known = await this.load(ids)
    const at = now.getTime()
    const due = ids.filter((id) => this.isDue(id, known.get(id), mode, at))
    if (due.length === 0) return false
    for (const id of due) this.attempts.set(id, at)

    const provider = this.options.provider!
    let prices: Map<string, EurQuote>
    try {
      prices = provider.fetchEurQuotes
        ? await provider.fetchEurQuotes(due)
        : new Map(
            [...(await provider.fetchEurPrices(due))].map(([id, priceEur]) => [
              id,
              { priceEur, change24hPercent: null },
            ]),
          )
    } catch (error) {
      this.logger.warn(
        `Price refresh failed (${failureReason(error)}) for ${due.length} asset(s); keeping the last known prices`,
      )
      return true
    }
    const rows = [...prices]
      .map(([assetId, quote]) => ({
        assetId,
        priceEur: canonicalPrice(quote.priceEur),
        change24hPercent: canonicalChange(quote.change24hPercent),
      }))
      .filter((row): row is PriceRow => row.priceEur !== null)
    if (rows.length > 0) await this.upsert(rows, 'provider', now)
    return false
  }

  private isDue(
    id: string,
    quote: Quote | undefined,
    mode: 'auto' | 'force',
    at: number,
  ): boolean {
    const maxAge = mode === 'force' ? 0 : this.ttlMs
    if (quote && at - quote.fetchedAt.getTime() <= maxAge) return false
    const retryAfter = mode === 'force' ? FORCE_MIN_INTERVAL_MS : this.ttlMs
    const attempt = this.attempts.get(id)
    return attempt === undefined || at - attempt >= retryAfter
  }

  private upsert(rows: PriceRow[], source: CryptoPriceSource, now: Date) {
    // Rows in one order (by asset id), so that two concurrent upserts lock
    // them in the same order and never deadlock.
    const sorted = [...rows].sort((x, y) =>
      x.assetId < y.assetId ? -1 : x.assetId > y.assetId ? 1 : 0,
    )
    return this.database.db
      .insert(p)
      .values(sorted.map((row) => ({ ...row, source, fetchedAt: now })))
      .onConflictDoUpdate({
        target: p.assetId,
        set: {
          priceEur: sql`excluded.price_eur`,
          change24hPercent: sql`excluded.change_24h_percent`,
          source,
          fetchedAt: now,
          updatedAt: now,
        },
      })
      .returning()
  }

  private async load(ids: string[]): Promise<Map<string, Quote>> {
    if (ids.length === 0) return new Map()
    const rows = await this.database.db
      .select()
      .from(p)
      .where(inArray(p.assetId, ids))
    return new Map(
      rows.map((row) => [
        row.assetId,
        {
          priceEur: formatDecimal(parseDecimal(row.priceEur)!),
          fetchedAt: row.fetchedAt,
          source: row.source,
          change24hPercent:
            row.change24hPercent === null
              ? null
              : signedCanonical(row.change24hPercent),
        },
      ]),
    )
  }

  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => undefined)
    return run
  }
}

/** Price rounded half to even to 12 decimals, or null if it does not fit. */
function canonicalPrice(price: string): string | null {
  const parsed = parseDecimal(price)
  if (!parsed) return null
  const text = formatDecimal(rescale(parsed, PRICE_SCALE))
  return fitsNumeric(text, PRICE_INTEGER_DIGITS, PRICE_SCALE) ? text : null
}

/** A signed decimal string in canonical form (`"-1.2500"` → `"-1.25"`). */
function signedCanonical(text: string): string | null {
  const negative = text.startsWith('-')
  const parsed = parseDecimal(negative ? text.slice(1) : text)
  if (!parsed) return null
  const value = formatDecimal(parsed)
  return negative && value !== '0' ? `-${value}` : value
}

/** Change rounded half to even to 4 decimals, or null if it does not fit. */
function canonicalChange(change: string | null): string | null {
  if (change === null) return null
  const negative = change.startsWith('-')
  const parsed = parseDecimal(negative ? change.slice(1) : change)
  if (!parsed) return null
  const text = formatDecimal(rescale(parsed, CHANGE_SCALE))
  if (!fitsNumeric(text, CHANGE_INTEGER_DIGITS, CHANGE_SCALE)) return null
  return negative && text !== '0' ? `-${text}` : text
}

function failureReason(error: unknown): string {
  return error instanceof PriceProviderError ? error.reason : 'unexpected'
}
