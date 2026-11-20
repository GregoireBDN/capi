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

/** What one asset of an account cost (#373), from the replay. */
export interface PortfolioCost {
  /** Cost of the coins whose cost is known. */
  costCents: number
  /** Exact decimal: part of the quantity whose cost is unknown. */
  unknownQuantity: string
}

export interface PortfolioAccountLines {
  accountId: string
  name: string
  lines: readonly PortfolioLine[]
  /**
   * The cost of each asset the account holds (#373, the replay of every
   * crypto account): an asset without one counts its lines' own invested
   * amounts (a line typed by hand), its coins of unknown cost when a line
   * has none.
   */
  costs?: ReadonlyMap<string, PortfolioCost>
  /** Euros waiting on the exchange (#373): value and cost alike. */
  fiatCents?: number
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
  /** Cost of the coins whose cost is known; null when none is. */
  investedCents: number | null
  /** Value of the coins of known cost minus their cost. */
  gainCents: number | null
  /** Exact decimal: coins of unknown cost ("0" if none). */
  unknownQuantity: string
  /**
   * False for a token known by its contract only: it never gets a price and
   * waits for none (« sans cours »).
   */
  priceable: boolean
  /** Largest value first. */
  places: PortfolioPlace[]
}

export interface PortfolioTotals {
  /** Sum over the assets that have a price, plus the euros waiting. */
  valueCents: number
  /** Sum of the change over 24 hours of the assets that have one; null if none. */
  change24hCents: number | null
  /**
   * Cost of the priced coins whose cost is known, plus the euros waiting
   * (null if none): it moves with buys, sales and costs given, never with
   * transfers between the owner's accounts.
   */
  investedCents: number | null
  /** Their value minus that invested amount (null if none). */
  gainCents: number | null
  /** Priced assets held with coins of unknown cost (left out of the gain). */
  withoutInvestedCount: number
  /** Their tickers, largest value first. */
  withoutInvestedSymbols: string[]
  /** Their coins of unknown cost, largest value first. */
  unknown: { assetId: string; symbol: string; quantity: string }[]
  /** Euros waiting on the exchanges. */
  fiatCents: number
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
 * The value of the coins of known cost in `valueCents` (the whole of
 * `quantity`): its share `(quantity − unknown) / quantity`, rounded half to
 * even.
 */
export function knownValue(
  valueCents: number,
  quantity: string,
  unknownQuantity: string,
): number {
  const total = parseDecimal(quantity)
  const unknown = parseDecimal(unknownQuantity)
  if (!total || !unknown || unknown.digits === 0n) return valueCents
  const scale = Math.max(total.scale, unknown.scale)
  const all = rescale(total, scale).digits
  const part = rescale(unknown, scale).digits
  if (all === 0n || part >= all) return 0
  const negative = valueCents < 0
  const cents = BigInt(Math.abs(valueCents))
  const share = divideHalfEven(cents * (all - part), all)
  return Number(negative ? -share : share)
}

/** `a < b` for non-negative decimal strings. */
function lessThan(a: string, b: string): boolean {
  const x = parseDecimal(a)
  const y = parseDecimal(b)
  if (!x || !y) return false
  const scale = Math.max(x.scale, y.scale)
  return rescale(x, scale).digits < rescale(y, scale).digits
}

/** What the coins of one asset of one account cost: replay, else lines. */
function costOf(
  account: PortfolioAccountLines,
  assetId: string,
  lines: readonly PortfolioLine[],
): { costCents: number; unknownQuantity: string } {
  const cost = account.costs?.get(assetId)
  if (cost) return cost
  if (lines.every((line) => line.investedCents !== null)) {
    return {
      costCents: lines.reduce((sum, line) => sum + line.investedCents!, 0),
      unknownQuantity: '0',
    }
  }
  return {
    costCents: 0,
    unknownQuantity: sumDecimals(lines.map((line) => line.quantity)),
  }
}

/**
 * The holdings of every account summed per asset: quantities exactly, values
 * from the lines (so the total is the accounts' total), the cost of each
 * account's coins from the replay (#373). Coins of unknown cost are named
 * and left out of the gain, the others still counted. Fiat lines (EUR typed
 * by hand on an exchange) are left out; the euros the exchanges' movements
 * leave waiting count in the totals. Priced assets come first, largest
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
      const places = new Map<string, PortfolioLine[]>()
      for (const { line, account } of entries) {
        places.set(account.accountId, [
          ...(places.get(account.accountId) ?? []),
          line,
        ])
      }
      let invested = 0
      let gain = 0
      const unknown: string[] = []
      let anyKnown = false
      for (const [accountId, placeLines] of places) {
        const account = accounts.find((a) => a.accountId === accountId)!
        const cost = costOf(account, assetId, placeLines)
        const quantity = sumDecimals(placeLines.map((line) => line.quantity))
        unknown.push(cost.unknownQuantity)
        if (cost.costCents === 0 && !lessThan(cost.unknownQuantity, quantity)) {
          continue
        }
        anyKnown = true
        invested += cost.costCents
        const value = sumValues(placeLines.map((line) => line.valueCents))
        gain +=
          knownValue(value ?? 0, quantity, cost.unknownQuantity) -
          cost.costCents
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
        investedCents: anyKnown ? invested : null,
        gainCents: anyKnown && valueCents !== null ? gain : null,
        unknownQuantity: sumDecimals(unknown),
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
  const fiatCents = accounts.reduce(
    (sum, account) => sum + (account.fiatCents ?? 0),
    0,
  )
  let invested: number | null = fiatCents > 0 ? fiatCents : null
  let gain = 0
  for (const asset of valued) {
    if (asset.investedCents === null) continue
    invested = (invested ?? 0) + asset.investedCents
    gain += asset.gainCents ?? 0
  }
  const without = valued.filter((asset) => lessThan('0', asset.unknownQuantity))
  return {
    assets,
    totals: {
      valueCents:
        valued.reduce((sum, asset) => sum + asset.valueCents!, 0) + fiatCents,
      change24hCents: sumValues(assets.map((asset) => asset.change24hCents)),
      investedCents: invested,
      gainCents: invested === null ? null : gain,
      withoutInvestedCount: without.length,
      withoutInvestedSymbols: without.map((asset) => asset.symbol),
      unknown: without.map((asset) => ({
        assetId: asset.assetId,
        symbol: asset.symbol,
        quantity: asset.unknownQuantity,
      })),
      fiatCents,
      missingPriceCount: assets.filter(
        (asset) => asset.priceable && asset.valueCents === null,
      ).length,
      staleCount: assets.filter((asset) => asset.priceStale).length,
    },
  }
}
