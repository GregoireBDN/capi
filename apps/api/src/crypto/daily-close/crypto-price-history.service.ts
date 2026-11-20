import { Inject, Injectable, Logger } from '@nestjs/common'
import { and, gte, inArray, lte, sql } from 'drizzle-orm'
import { DatabaseService } from '#/database/database.service'
import { cryptoPriceHistoryTable, cryptoPricesTable } from '#/database/schema'
import type { CryptoPriceSource } from '#/database/schema/domain-enums'
import { addDays } from '#/imports/dedupe/calendar-date'
import { daysBetween, parisToday } from '#/investments/days'
import { PRICE_HISTORY_MAX_DAYS } from '../coingecko.provider'
import { isContractAssetId } from '../contract-assets'
import { fitsNumeric, formatDecimal, parseDecimal, rescale } from '../decimal'
import {
  CRYPTO_PRICE_OPTIONS,
  type CryptoPriceOptions,
  PriceProviderError,
} from '../price-provider'
import { closingPrices } from './daily-values'

const ph = cryptoPriceHistoryTable
const PRICE_SCALE = 12
const PRICE_INTEGER_DIGITS = 26
const CHUNK = 500

export interface DayPrices {
  /** Asset id → day → EUR price (exact decimal string). */
  prices: Map<string, Map<string, string>>
  /** A provider request failed: the days it left without a price are retried. */
  failed: boolean
}

/**
 * The EUR price of an asset at the end of each day (#366), kept in
 * `crypto_price_history`: read from the table, else from the provider's
 * daily history (one request per asset, only its id sent, as far back as
 * `PRICE_HISTORY_MAX_DAYS`), else — with the price API off, or for an asset
 * it does not know — the manual price, for the days from the one it was
 * set. A failed request leaves the days without a price (retried by the
 * next close), never an error.
 *
 * Privacy: the provider only receives asset ids; nothing about quantities or
 * values is sent or logged.
 */
@Injectable()
export class CryptoPriceHistoryService {
  private readonly logger = new Logger(CryptoPriceHistoryService.name)
  private lastRequestAt = 0

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CRYPTO_PRICE_OPTIONS) private readonly options: CryptoPriceOptions,
  ) {}

  private get db() {
    return this.database.db
  }

  /** The closing prices of the days asked per asset (only closed days). */
  async dayPrices(
    needs: ReadonlyMap<string, ReadonlySet<string>>,
    now: Date = new Date(),
  ): Promise<DayPrices> {
    const today = parisToday(now)
    const wanted = new Map<string, string[]>()
    for (const [assetId, days] of needs) {
      const closed = [...days].filter((day) => day < today).sort()
      // Tokens known by their contract only have no price to look for.
      if (closed.length > 0 && !isContractAssetId(assetId)) {
        wanted.set(assetId, closed)
      }
    }
    const prices = await this.stored(wanted)
    const missing = (assetId: string) =>
      wanted.get(assetId)!.filter((day) => !prices.get(assetId)?.has(day))

    let failed = false
    const provider = this.options.provider
    if (provider?.fetchEurHistory) {
      const oldest = addDays(today, -(PRICE_HISTORY_MAX_DAYS - 1))
      for (const assetId of [...wanted.keys()].sort()) {
        const days = missing(assetId).filter((day) => day >= oldest)
        if (days.length === 0) continue
        await this.pace()
        let closes: Map<string, string>
        try {
          // One more day than the oldest missing one, and the current price.
          const points = await provider.fetchEurHistory(
            assetId,
            daysBetween(days[0], today) + 1,
          )
          closes = closingPrices(points, days)
        } catch (error) {
          // An asset the provider does not know (404) is no failure: its
          // manual price, if any, is used below.
          if (error instanceof PriceProviderError && error.status === 404) {
            continue
          }
          failed = true
          const reason =
            error instanceof PriceProviderError ? error.reason : 'unexpected'
          this.logger.warn(
            `Price history failed (${reason}); the days left without a price are retried`,
          )
          // A rate limit holds for every asset: ask again at the next close.
          if (reason === 'rate_limited') break
          continue
        }
        await this.save(assetId, closes, 'provider', now, prices)
      }
    }

    // The manual price of the day: the current price, for the days from the
    // one it was set, when the API is off or does not know the asset.
    const fallback = await this.db
      .select({
        assetId: cryptoPricesTable.assetId,
        priceEur: cryptoPricesTable.priceEur,
        source: cryptoPricesTable.source,
        fetchedAt: cryptoPricesTable.fetchedAt,
      })
      .from(cryptoPricesTable)
      .where(
        wanted.size > 0
          ? inArray(cryptoPricesTable.assetId, [...wanted.keys()])
          : sql`false`,
      )
    for (const row of fallback) {
      if (provider !== null && row.source !== 'manual') continue
      const since = parisToday(row.fetchedAt)
      const days = missing(row.assetId).filter((day) => day >= since)
      if (days.length === 0) continue
      const price = canonicalPrice(row.priceEur)
      if (price === null) continue
      await this.save(
        row.assetId,
        new Map(days.map((day) => [day, price])),
        'manual',
        now,
        prices,
      )
    }
    return { prices, failed }
  }

  private async stored(
    wanted: ReadonlyMap<string, readonly string[]>,
  ): Promise<Map<string, Map<string, string>>> {
    const prices = new Map<string, Map<string, string>>()
    if (wanted.size === 0) return prices
    const all = [...wanted.values()].flat().sort()
    const rows = await this.db
      .select({ assetId: ph.assetId, day: ph.day, priceEur: ph.priceEur })
      .from(ph)
      .where(
        and(
          inArray(ph.assetId, [...wanted.keys()]),
          gte(ph.day, all[0]),
          lte(ph.day, all[all.length - 1]),
        ),
      )
    for (const row of rows) {
      const byDay = prices.get(row.assetId) ?? new Map<string, string>()
      byDay.set(row.day, formatDecimal(parseDecimal(row.priceEur)!))
      prices.set(row.assetId, byDay)
    }
    return prices
  }

  private async save(
    assetId: string,
    closes: ReadonlyMap<string, string>,
    source: CryptoPriceSource,
    now: Date,
    into: Map<string, Map<string, string>>,
  ) {
    const rows = [...closes]
      .map(([day, price]) => ({ day, priceEur: canonicalPrice(price) }))
      .filter((row): row is { day: string; priceEur: string } => !!row.priceEur)
    for (let i = 0; i < rows.length; i += CHUNK) {
      await this.db
        .insert(ph)
        .values(
          rows
            .slice(i, i + CHUNK)
            .map((row) => ({ assetId, ...row, source, updatedAt: now })),
        )
        .onConflictDoUpdate({
          target: [ph.assetId, ph.day],
          set: {
            priceEur: sql`excluded.price_eur`,
            source,
            updatedAt: now,
          },
        })
    }
    const byDay = into.get(assetId) ?? new Map<string, string>()
    for (const row of rows) {
      byDay.set(row.day, formatDecimal(parseDecimal(row.priceEur)!))
    }
    into.set(assetId, byDay)
  }

  /** Spaces provider requests (`historyIntervalMs`): the key-less API is rate limited. */
  private async pace() {
    const interval = this.options.historyIntervalMs ?? 0
    const wait = this.lastRequestAt + interval - Date.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    this.lastRequestAt = Date.now()
  }
}

/** Price rounded half to even to 12 decimals, or null if it does not fit. */
function canonicalPrice(price: string): string | null {
  const parsed = parseDecimal(price)
  if (!parsed) return null
  const text = formatDecimal(rescale(parsed, PRICE_SCALE))
  return fitsNumeric(text, PRICE_INTEGER_DIGITS, PRICE_SCALE) ? text : null
}
