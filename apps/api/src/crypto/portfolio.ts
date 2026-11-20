import type { CryptoPriceSource } from '#/database/schema/domain-enums'
import { FIAT_TICKERS } from '#/imports/crypto/assets'
import { isContractAssetId } from './contract-assets'
import { divideHalfEven, formatDecimal, parseDecimal, rescale } from './decimal'

/*
 * The Crypto page as a portfolio (#295): every open crypto account's valued
 * lines summed per asset (price id), whatever account and location holds
 * them. Pure: the service values the accounts first.
 */

/** One valued line of an account, as the valuation returns it. */
export interface PortfolioLine {
  assetId: string
  symbol: string
  name: string
  /** Exact decimal string. */
  quantity: string
  investedCents: number | null
  priceEur: string | null
  priceSource: CryptoPriceSource | null
  priceFetchedAt: string | null
  priceStale: boolean
  priceChange24hPercent: string | null
  /** quantity × price, rounded half to even; null without a price. */
  valueCents: number | null
}

export interface PortfolioAccountLines {
  accountId: string
  name: string
  lines: readonly PortfolioLine[]
  /**
   * What the account as a whole had invested (#358: a wallet's invested
   * base, the coins linked to it), when known: its lines' own invested
   * amounts are then left aside in the totals.
   */
  investedCents?: number | null
}

/** Where an asset is held: one account, its locations summed. */
export interface PortfolioPlace {
  accountId: string
  name: string
  quantity: string
  valueCents: number | null
}

export interface PortfolioAsset {
  assetId: string
  symbol: string
  name: string
  /** Exact sum over every account. */
  quantity: string
  priceEur: string | null
  priceSource: CryptoPriceSource | null
  priceFetchedAt: string | null
  priceStale: boolean
  change24hPercent: string | null
  /** Sum of its lines' values (each rounded); null without a price. */
  valueCents: number | null
  /** What the value moved over 24 hours, from the price's change. */
  change24hCents: number | null
  /** Sum of the invested amounts, only when every line has one. */
  investedCents: number | null
  gainCents: number | null
  /**
   * False for a token known by its contract only: it never gets a price and
   * waits for none (« sans cours »).
   */
  priceable: boolean
  /** Largest value first. */
  places: PortfolioPlace[]
}

export interface PortfolioTotals {
  /** Sum over the assets that have a price. */
  valueCents: number
  /** Sum of the change over 24 hours of the assets that have one; null if none. */
  change24hCents: number | null
  /** Invested in the priced assets whose cost is known (null if none). */
  investedCents: number | null
  /** Their value minus that invested amount (null if none). */
  gainCents: number | null
  /** Priced assets whose invested amount is unknown (left out of the gain). */
  withoutInvestedCount: number
  /** Their tickers, largest value first. */
  withoutInvestedSymbols: string[]
  /** Assets waiting for a price (contract-only tokens are not counted). */
  missingPriceCount: number
  staleCount: number
}

export interface Portfolio {
  assets: PortfolioAsset[]
  totals: PortfolioTotals
}

/** Exact sum of non-negative decimal strings. */
export function sumDecimals(values: readonly string[]): string {
  const parsed = values.map((value) => {
    const decimal = parseDecimal(value)
    if (!decimal) throw new Error('Not a decimal')
    return decimal
  })
  const scale = Math.max(0, ...parsed.map((decimal) => decimal.scale))
  const digits = parsed.reduce(
    (sum, decimal) => sum + rescale(decimal, scale).digits,
    0n,
  )
  return formatDecimal({ digits, scale })
}

/** A signed decimal string × 10^scale as a bigint, or null if malformed. */
function signedDigits(text: string, scale: number): bigint | null {
  const negative = text.startsWith('-')
  const parsed = parseDecimal(negative ? text.slice(1) : text)
  if (!parsed) return null
  const digits = rescale(parsed, scale).digits
  return negative ? -digits : digits
}

const PERCENT_SCALE = 4
/** 100 % with `PERCENT_SCALE` decimals. */
const HUNDRED = 100n * 10n ** BigInt(PERCENT_SCALE)

/**
 * What a value moved over 24 hours when its price changed by `percent`:
 * value − value / (1 + percent / 100), rounded half to even. Null for a
 * change of −100 % or below (no previous value to read).
 */
export function changeOverDay(
  valueCents: number,
  percent: string,
): number | null {
  const change = signedDigits(percent, PERCENT_SCALE)
  if (change === null || HUNDRED + change <= 0n) return null
  const previous = divideHalfEven(
    BigInt(valueCents) * HUNDRED,
    HUNDRED + change,
  )
  return valueCents - Number(previous)
}

function byValue<T extends { valueCents: number | null }>(
  key: (item: T) => string,
) {
  return (a: T, b: T): number => {
    if (a.valueCents === null || b.valueCents === null) {
      if (a.valueCents !== b.valueCents) return a.valueCents === null ? 1 : -1
      return key(a).localeCompare(key(b))
    }
    return b.valueCents - a.valueCents || key(a).localeCompare(key(b))
  }
}

function sumValues(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null)
  return known.length === 0 ? null : known.reduce((sum, v) => sum + v, 0)
}

/**
 * The holdings of every account summed per asset: quantities exactly, values
 * from the lines (so the total is the accounts' total), the invested amount
 * when every line has one. Fiat lines (EUR left on an exchange typed by
 * hand) are left out: they are not crypto. Priced assets come first, largest
 * value first; those without a price after them, by symbol.
 */
export function aggregatePortfolio(
  accounts: readonly PortfolioAccountLines[],
): Portfolio {
  const byAsset = new Map<
    string,
    { line: PortfolioLine; account: PortfolioAccountLines }[]
  >()
  for (const account of accounts) {
    for (const line of account.lines) {
      if (FIAT_TICKERS.has(line.symbol.toUpperCase())) continue
      const entries = byAsset.get(line.assetId) ?? []
      entries.push({ line, account })
      byAsset.set(line.assetId, entries)
    }
  }

  const assets = [...byAsset.entries()].map(
    ([assetId, entries]): PortfolioAsset => {
      const lines = entries.map((entry) => entry.line)
      // Every line of an asset shares its price.
      const priced = lines.find((line) => line.priceEur !== null) ?? null
      const valueCents = sumValues(lines.map((line) => line.valueCents))
      const invested = lines.every((line) => line.investedCents !== null)
        ? lines.reduce((sum, line) => sum + line.investedCents!, 0)
        : null
      const places = new Map<string, PortfolioLine[]>()
      for (const { line, account } of entries) {
        places.set(account.accountId, [
          ...(places.get(account.accountId) ?? []),
          line,
        ])
      }
      const change = priced?.priceChange24hPercent ?? null
      return {
        assetId,
        symbol: lines[0].symbol,
        name: lines[0].name,
        quantity: sumDecimals(lines.map((line) => line.quantity)),
        priceEur: priced?.priceEur ?? null,
        priceSource: priced?.priceSource ?? null,
        priceFetchedAt: priced?.priceFetchedAt ?? null,
        priceStale: priced?.priceStale ?? false,
        change24hPercent: change,
        valueCents,
        change24hCents:
          valueCents === null || change === null
            ? null
            : changeOverDay(valueCents, change),
        investedCents: invested,
        gainCents:
          valueCents === null || invested === null
            ? null
            : valueCents - invested,
        priceable: !isContractAssetId(assetId),
        places: [...places.entries()]
          .map(([accountId, placeLines]) => ({
            accountId,
            name: accounts.find((a) => a.accountId === accountId)!.name,
            quantity: sumDecimals(placeLines.map((line) => line.quantity)),
            valueCents: sumValues(placeLines.map((line) => line.valueCents)),
          }))
          .sort(byValue((place) => place.name)),
      }
    },
  )
  assets.sort(byValue((asset) => asset.symbol))

  const valued = assets.filter((asset) => asset.valueCents !== null)
  // Accounts whose cost is known as a whole (#358) count as one; the other
  // lines count per asset, when every one of them has a cost.
  let invested: number | null = null
  let gain = 0
  for (const account of accounts) {
    if (account.investedCents == null) continue
    const value = sumValues(
      account.lines
        .filter((line) => !FIAT_TICKERS.has(line.symbol.toUpperCase()))
        .map((line) => line.valueCents),
    )
    invested = (invested ?? 0) + account.investedCents
    gain += (value ?? 0) - account.investedCents
  }
  const without: PortfolioAsset[] = []
  for (const asset of valued) {
    const lines = (byAsset.get(asset.assetId) ?? [])
      .filter(({ account }) => account.investedCents == null)
      .map(({ line }) => line)
    if (lines.length === 0) continue
    if (lines.some((line) => line.investedCents === null)) {
      without.push(asset)
      continue
    }
    const cost = lines.reduce((sum, line) => sum + line.investedCents!, 0)
    invested = (invested ?? 0) + cost
    gain += (sumValues(lines.map((line) => line.valueCents)) ?? 0) - cost
  }
  return {
    assets,
    totals: {
      valueCents: valued.reduce((sum, asset) => sum + asset.valueCents!, 0),
      change24hCents: sumValues(assets.map((asset) => asset.change24hCents)),
      investedCents: invested,
      gainCents: invested === null ? null : gain,
      withoutInvestedCount: without.length,
      withoutInvestedSymbols: without.map((asset) => asset.symbol),
      missingPriceCount: assets.filter(
        (asset) => asset.priceable && asset.valueCents === null,
      ).length,
      staleCount: assets.filter((asset) => asset.priceStale).length,
    },
  }
}
