import type { CryptoPriceSource } from '#/database/schema/domain-enums'
import { isContractAssetId } from './contract-assets'
import { valueInCents } from './decimal'

/** Last known EUR price of an asset. */
export interface Quote {
  priceEur: string
  fetchedAt: Date
  source: CryptoPriceSource
  /** Signed change over 24 hours in percent (`"-1.25"`), when known (#295). */
  change24hPercent?: string | null
}

export interface HoldingToValue {
  id: string
  assetId: string
  /** Exact decimal string. */
  quantity: string
  investedCents: number | null
}

export interface HoldingValue {
  holdingId: string
  quote: Quote | null
  /** Fetched price older than the TTL (the last refresh failed or was skipped). */
  priceStale: boolean
  valueCents: number | null
  gainCents: number | null
}

export interface ValuationTotals {
  /** Sum over the holdings that have a price. */
  valueCents: number
  /** Sum of the invested amounts, only when every holding has one. */
  investedCents: number | null
  /** `valueCents - investedCents`, only when both are complete. */
  gainCents: number | null
  missingPriceCount: number
  staleCount: number
  withoutInvestedCount: number
}

export interface Valuation {
  holdings: HoldingValue[]
  totals: ValuationTotals
  /** Every holding has a price: the total is the value of the account. */
  complete: boolean
}

function toSafeNumber(cents: bigint): number {
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Value out of range')
  }
  return Number(cents)
}

/** Whether a provider price is older than the TTL. Manual prices never are. */
export function isStale(quote: Quote, now: Date, ttlMs: number): boolean {
  return (
    quote.source === 'provider' &&
    now.getTime() - quote.fetchedAt.getTime() > ttlMs
  )
}

/**
 * Values each holding at quantity × price (exact, rounded half to even to the
 * cent) and sums the account. Stale prices still value the holding: the last
 * known price is the best estimate.
 */
export function valuateHoldings(
  holdings: readonly HoldingToValue[],
  quotes: ReadonlyMap<string, Quote>,
  now: Date,
  ttlMs: number,
): Valuation {
  let value = 0n
  let invested = 0n
  let missingPriceCount = 0
  let staleCount = 0
  let withoutInvestedCount = 0

  const rows = holdings.map((holding): HoldingValue => {
    const quote = quotes.get(holding.assetId) ?? null
    if (holding.investedCents === null) withoutInvestedCount++
    else invested += BigInt(holding.investedCents)
    if (quote === null) {
      // A token known by its contract only has no price to wait for.
      if (!isContractAssetId(holding.assetId)) missingPriceCount++
      return {
        holdingId: holding.id,
        quote,
        priceStale: false,
        valueCents: null,
        gainCents: null,
      }
    }
    const stale = isStale(quote, now, ttlMs)
    if (stale) staleCount++
    const cents = valueInCents(holding.quantity, quote.priceEur)
    value += cents
    const valueCents = toSafeNumber(cents)
    return {
      holdingId: holding.id,
      quote,
      priceStale: stale,
      valueCents,
      gainCents:
        holding.investedCents === null
          ? null
          : valueCents - holding.investedCents,
    }
  })

  const valueCents = toSafeNumber(value)
  const investedCents =
    withoutInvestedCount === 0 && holdings.length > 0
      ? toSafeNumber(invested)
      : null
  const complete = missingPriceCount === 0
  return {
    holdings: rows,
    totals: {
      valueCents,
      investedCents,
      gainCents:
        complete && investedCents !== null ? valueCents - investedCents : null,
      missingPriceCount,
      staleCount,
      withoutInvestedCount,
    },
    complete,
  }
}
