import { addDays } from '#/imports/dedupe/calendar-date'
import type { AssetMapping } from '#/imports/crypto/crypto-import.types'
import {
  computeHoldings,
  type HoldingMovement,
} from '#/imports/crypto/holdings'
import { parisToday } from '#/investments/days'
import type { PricePoint } from '../price-provider'
import { valuateHoldings } from '../valuation'

/**
 * Pure helpers of the daily close (#366): Europe/Paris day boundaries, the
 * closing price of a day from the provider's daily history, an exchange's
 * holdings at the end of each day from its movements, and the value of a
 * day's holdings at that day's prices. Exact: quantities and prices are
 * decimal strings, values integer cents.
 */

const HOUR_MS = 3_600_000

/**
 * How far from a day's end (Europe/Paris midnight) a provider point may be
 * to stand for its closing price: the daily points are at 00:00 UTC, one or
 * two hours after it, and the current price a few minutes after it when the
 * close runs right after midnight.
 */
export const CLOSE_PRICE_WINDOW_MS = 3 * HOUR_MS

/** The instant a Europe/Paris calendar day starts. */
export function parisDayStart(day: string): Date {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`)
  // Paris is one or two hours ahead of UTC.
  for (const hours of [1, 2]) {
    const start = new Date(utcMidnight - hours * HOUR_MS)
    if (
      parisToday(start) === day &&
      parisToday(new Date(start.getTime() - 1)) !== day
    ) {
      return start
    }
  }
  throw new RangeError('Not a calendar day')
}

/** The instant a Europe/Paris calendar day ends (the next one starts). */
export function parisDayEnd(day: string): Date {
  return parisDayStart(addDays(day, 1))
}

/** Every day from `from` to `to`, both included (none when `from > to`). */
export function dayRange(from: string, to: string): string[] {
  const days: string[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day)
  return days
}

/**
 * The closing price of each day from a provider's history: the point
 * nearest to the day's end within `CLOSE_PRICE_WINDOW_MS`. Days without
 * one are left out.
 */
export function closingPrices(
  points: readonly PricePoint[],
  days: readonly string[],
): Map<string, string> {
  const closes = new Map<string, string>()
  for (const day of days) {
    const end = parisDayEnd(day).getTime()
    let best: PricePoint | null = null
    let bestDistance = Infinity
    for (const point of points) {
      const distance = Math.abs(point.at.getTime() - end)
      if (distance > CLOSE_PRICE_WINDOW_MS) continue
      // A tie goes to the later point (after the day's end).
      if (
        distance < bestDistance ||
        (distance === bestDistance && point.at.getTime() > end)
      ) {
        best = point
        bestDistance = distance
      }
    }
    if (best) closes.set(day, best.priceEur)
  }
  return closes
}

/** A holding line as the daily close values it. */
export interface DayLine {
  assetId: string
  /** Exact decimal string. */
  quantity: string
  investedCents: number | null
}

export interface DayValue {
  valueCents: number
  /** Sum of the lines' invested amounts, when every line has one. */
  investedCents: number | null
}

/**
 * The value of a day's lines at that day's prices, or null when a line
 * that has a price somewhere lacks the day's (the day is left without a
 * point and retried). Tokens known by their contract only are not priced
 * and never hold the day back.
 */
export function valueDay(
  lines: readonly DayLine[],
  prices: ReadonlyMap<string, string>,
): DayValue | null {
  const quotes = new Map(
    [...prices].map(([assetId, priceEur]) => [
      assetId,
      { priceEur, fetchedAt: new Date(0), source: 'manual' as const },
    ]),
  )
  const valuation = valuateHoldings(
    lines.map((line, i) => ({ id: String(i), ...line })),
    quotes,
    new Date(0),
    0,
  )
  if (!valuation.complete) return null
  return {
    valueCents: valuation.totals.valueCents,
    investedCents: valuation.totals.investedCents,
  }
}

/**
 * An exchange's holdings at the end of each day, from its movements, as
 * the import computes them (`computeHoldings`: per price id, fiat left out,
 * negative and unmapped assets without a line). Exact quantities.
 */
export function exchangeLinesByDay(
  movements: readonly HoldingMovement[],
  resolve: (ticker: string) => AssetMapping | null,
  days: readonly string[],
): Map<string, DayLine[]> {
  const ordered = movements
    .map((movement, position) => ({ movement, position }))
    .sort(
      (a, b) =>
        a.movement.occurredAt.localeCompare(b.movement.occurredAt) ||
        a.position - b.position,
    )
    .map(({ movement }) => movement)
  const times = ordered.map((movement) => Date.parse(movement.occurredAt))
  const byDay = new Map<string, DayLine[]>()
  let count = -1
  let lines: DayLine[] = []
  for (const day of [...days].sort()) {
    const end = parisDayEnd(day).getTime()
    let next = count < 0 ? 0 : count
    while (next < times.length && times[next] < end) next++
    if (next !== count) {
      count = next
      lines = computeHoldings(ordered.slice(0, count), resolve)
        .filter((holding) => holding.status === 'ok')
        .map((holding) => ({
          assetId: holding.assetId!,
          quantity: holding.quantity,
          investedCents: holding.investedCents,
        }))
    }
    byDay.set(day, lines)
  }
  return byDay
}

/** Milliseconds from `now` to the next daily close, `minutes` after midnight. */
export function msUntilNextClose(now: Date, minutes: number): number {
  const tomorrow = addDays(parisToday(now), 1)
  const at = parisDayStart(tomorrow).getTime() + minutes * 60_000
  const today = parisDayStart(parisToday(now)).getTime() + minutes * 60_000
  return (now.getTime() < today ? today : at) - now.getTime()
}
