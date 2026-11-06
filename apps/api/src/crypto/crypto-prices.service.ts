import { Inject, Injectable, Logger } from '@nestjs/common'
import { inArray, sql } from 'drizzle-orm'
import { DatabaseService } from '#/database/database.service'
import { cryptoPricesTable } from '#/database/schema'
import type { CryptoPriceSource } from '#/database/schema/domain-enums'
import { searchBuiltinAssets } from './builtin-assets'
import { fitsNumeric, formatDecimal, parseDecimal, rescale } from './decimal'
import type { CryptoPriceDto } from './dto/crypto.dto'
import {
  CRYPTO_PRICE_OPTIONS,
  type CryptoAsset,
  type CryptoPriceOptions,
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

const p = cryptoPricesTable

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
    let refreshFailed = false
    if (ids.length > 0 && mode !== 'none' && this.enabled) {
      refreshFailed = await this.serialized(() => this.refresh(ids, mode, now))
    }
    return { quotes: await this.load(ids), refreshFailed }
  }

  /** Sets a price by hand (used when the price API is disabled or lacks it). */
  async setManualPrice(
    assetId: string,
    priceEur: string,
    now: Date = new Date(),
  ): Promise<CryptoPriceDto> {
    const [row] = await this.upsert(
      [{ assetId, priceEur: canonicalPrice(priceEur)! }],
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
    const maxAge = mode === 'force' ? 0 : this.ttlMs
    const retryAfter = mode === 'force' ? FORCE_MIN_INTERVAL_MS : this.ttlMs
    const at = now.getTime()
    const due = ids.filter((id) => {
      const quote = known.get(id)
      if (quote && at - quote.fetchedAt.getTime() <= maxAge) return false
      const attempt = this.attempts.get(id)
      return attempt === undefined || at - attempt >= retryAfter
    })
    if (due.length === 0) return false
    for (const id of due) this.attempts.set(id, at)

    let prices: Map<string, string>
    try {
      prices = await this.options.provider!.fetchEurPrices(due)
    } catch (error) {
      this.logger.warn(
        `Price refresh failed (${failureReason(error)}) for ${due.length} asset(s); keeping the last known prices`,
      )
      return true
    }
    const rows = [...prices]
      .map(([assetId, price]) => ({ assetId, priceEur: canonicalPrice(price) }))
      .filter(
        (row): row is { assetId: string; priceEur: string } =>
          row.priceEur !== null,
      )
    if (rows.length > 0) await this.upsert(rows, 'provider', now)
    return false
  }

  private upsert(
    rows: { assetId: string; priceEur: string }[],
    source: CryptoPriceSource,
    now: Date,
  ) {
    return this.database.db
      .insert(p)
      .values(rows.map((row) => ({ ...row, source, fetchedAt: now })))
      .onConflictDoUpdate({
        target: p.assetId,
        set: {
          priceEur: sql`excluded.price_eur`,
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

function failureReason(error: unknown): string {
  return error instanceof PriceProviderError ? error.reason : 'unexpected'
}
