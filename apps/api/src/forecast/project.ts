import type {
  RecurringAmountType,
  RecurringCadence,
  RecurringDirection,
} from '#/database/schema/domain-enums'
import {
  addDays,
  dayOfMonth,
  daysBetween,
  isLastDayOfMonth,
  maxDate,
} from '#/recurring/dates'
import { CADENCE_SPECS, nextExpectedDate } from '#/recurring/detect'

/**
 * End-of-month cash-flow projection. Pure functions only: no I/O, no
 * logging (amounts are private data). Amounts are signed integer cents
 * (negative = money out), dates `YYYY-MM-DD` calendar dates.
 */

/** A confirmed, active recurring item, with its live stats. */
export interface ForecastRecurringItem {
  id: string
  accountId: string
  name: string
  direction: RecurringDirection
  cadence: RecurringCadence
  amountType: RecurringAmountType
  isFixedCost: boolean
  /** Positive cents. */
  typicalAmountCents: number
  nextExpectedDate: string | null
  /**
   * Cancellation date (« Résilier »): no occurrence is expected on or after
   * it. Null when the item is not cancelled.
   */
  endedOn: string | null
  /** Dates of the latest booked occurrences of the series. */
  bookedDates: readonly string[]
  categoryName: string | null
  categoryColor: string | null
}

export interface ExpectedItem {
  recurringItemId: string
  accountId: string
  name: string
  /**
   * Day the projection applies it: the expected date, or the first projected
   * day when it is late.
   */
  date: string
  /** Date the series expects it on. */
  expectedDate: string
  /** Signed cents (negative for a debit). */
  amountCents: number
  direction: RecurringDirection
  amountType: RecurringAmountType
  isFixedCost: boolean
  categoryName: string | null
  categoryColor: string | null
}

export interface ProjectionWindow {
  /** Today in Europe/Paris. */
  today: string
  /**
   * First projected day: the day after the date the balance is known up to
   * (`knownUntil`), today at the latest (see `projectionStart`).
   */
  start: string
  /** Last day of today's month. */
  monthEnd: string
}

/**
 * First projected day for data known up to `knownUntil` (#215): the next
 * day, so the days not imported yet are projected on their own dates rather
 * than piled up on today. Today when the data reaches today or when nothing
 * is known.
 */
export function projectionStart(
  today: string,
  knownUntil: string | null,
): string {
  if (knownUntil === null) return today
  const next = addDays(knownUntil, 1)
  return next < today ? next : today
}

/**
 * Remaining occurrences of `item` until `monthEnd`, from its next expected
 * date. `horizon` is the date the account's balance is known up to (its last
 * booked transaction or snapshot), null when it has none.
 *
 * An occurrence is skipped when it is already booked (a booked occurrence of
 * the series within the cadence tolerance of the expected date) or missed
 * (the data goes past the expected date by more than the tolerance without
 * it). A late one still within the tolerance is applied on the first
 * projected day. Nothing is expected on or after the item's cancellation
 * date (`endedOn`).
 */
export function expectedOccurrences(
  item: ForecastRecurringItem,
  { start, monthEnd }: ProjectionWindow,
  horizon: string | null,
): ExpectedItem[] {
  if (item.nextExpectedDate === null) return []
  const { toleranceDays } = CADENCE_SPECS[item.cadence]
  // Month-end series stay at month end (Jan 31 → Feb 28 → Mar 31).
  const anchor = isLastDayOfMonth(item.nextExpectedDate)
    ? 31
    : dayOfMonth(item.nextExpectedDate)
  const sign = item.direction === 'debit' ? -1 : 1
  const result: ExpectedItem[] = []
  for (
    let expected = item.nextExpectedDate;
    expected <= monthEnd && (item.endedOn === null || expected < item.endedOn);
    expected = nextExpectedDate(expected, item.cadence, anchor)
  ) {
    const missed =
      horizon !== null && daysBetween(expected, horizon) > toleranceDays
    const booked = item.bookedDates.some(
      (date) => Math.abs(daysBetween(date, expected)) <= toleranceDays,
    )
    if (missed || booked) continue
    result.push({
      recurringItemId: item.id,
      accountId: item.accountId,
      name: item.name,
      date: maxDate(expected, start),
      expectedDate: expected,
      amountCents: sign * item.typicalAmountCents,
      direction: item.direction,
      amountType: item.amountType,
      isFixedCost: item.isFixedCost,
      categoryName: item.categoryName,
      categoryColor: item.categoryColor,
    })
  }
  return result
}

/**
 * Average daily spending over `[from, to]`: `spendingCents` (positive cents
 * spent) divided by the number of days, rounded to the cent. Null when the
 * period is empty.
 */
export function averageDailyCents(
  spendingCents: number,
  from: string,
  to: string,
): number | null {
  const days = daysBetween(from, to) + 1
  if (days <= 0) return null
  return Math.round(Math.max(0, spendingCents) / days)
}

/**
 * Days the variable-spending estimate covers: every day after `knownUntil`
 * (the spending up to it is already in the balance) until `monthEnd`, each
 * on its own date (a day before the first projected one counts on it).
 * Returns the number of days applied on each projected day.
 */
export function estimateDays(
  { start, monthEnd }: ProjectionWindow,
  knownUntil: string | null,
): Map<string, number> {
  const days = new Map<string, number>()
  const first = knownUntil === null ? start : addDays(knownUntil, 1)
  for (let date = first; date <= monthEnd; date = addDays(date, 1)) {
    const on = maxDate(date, start)
    days.set(on, (days.get(on) ?? 0) + 1)
  }
  return days
}

export interface SpreadEstimate {
  /** Positive cents of estimated spending applied on each projected day. */
  byDate: Map<string, number>
  /** Part of `coveredCents` used (at most the elapsed days' estimate). */
  coveredCents: number
}

/**
 * Spreads `dailyCents` over the estimated days. Day-to-day spending entered
 * by hand since the known balance date (`coveredCents`, positive cents) is
 * already in the balance: it replaces the estimate of the elapsed days (up to
 * today), earliest first, so it is never counted twice. The days after today
 * keep the whole estimate.
 */
export function spreadEstimate(
  daysByDate: ReadonlyMap<string, number>,
  dailyCents: number,
  coveredCents: number,
  today: string,
): SpreadEstimate {
  const byDate = new Map<string, number>()
  let covered = Math.max(0, coveredCents)
  let used = 0
  for (const date of [...daysByDate.keys()].sort()) {
    let cents = dailyCents * (daysByDate.get(date) ?? 0)
    if (date <= today && covered > 0) {
      const take = Math.min(covered, cents)
      covered -= take
      used += take
      cents -= take
    }
    byDate.set(date, cents)
  }
  return { byDate, coveredCents: used }
}

export interface ProjectionPoint {
  date: string
  /** Projected balance at the end of the day. */
  balanceCents: number
  /** Recurring items applied that day. */
  items: ExpectedItem[]
  /** Variable-spending estimate applied that day (≤ 0). */
  estimateCents: number
}

export interface Projection {
  points: ProjectionPoint[]
  endBalanceCents: number
  /** Lowest end-of-day balance (the earliest one on a tie). */
  lowest: { date: string; balanceCents: number }
  /** First day the projection goes under the threshold, null if never. */
  belowThreshold: { date: string; balanceCents: number } | null
  estimateTotalCents: number
}

/**
 * Daily balance from the first projected day to month end (one point when it
 * is the last day): the starting balance, then each day's expected items and
 * estimate.
 */
export function buildProjection({
  window,
  startingBalanceCents,
  items,
  estimateByDate,
  thresholdCents,
}: {
  window: ProjectionWindow
  startingBalanceCents: number
  items: readonly ExpectedItem[]
  /** Positive cents of estimated spending per projected day. */
  estimateByDate: ReadonlyMap<string, number>
  thresholdCents: number
}): Projection {
  const byDate = new Map<string, ExpectedItem[]>()
  for (const item of items) {
    const list = byDate.get(item.date) ?? []
    list.push(item)
    byDate.set(item.date, list)
  }

  const points: ProjectionPoint[] = []
  let balance = startingBalanceCents
  let estimateTotalCents = 0
  for (
    let date = window.start;
    date <= window.monthEnd;
    date = addDays(date, 1)
  ) {
    const dayItems = (byDate.get(date) ?? []).sort(
      (a, b) =>
        a.amountCents - b.amountCents ||
        a.name.localeCompare(b.name, 'fr') ||
        a.recurringItemId.localeCompare(b.recurringItemId),
    )
    const estimateCents = -(estimateByDate.get(date) ?? 0) || 0
    balance +=
      dayItems.reduce((sum, item) => sum + item.amountCents, 0) + estimateCents
    estimateTotalCents += estimateCents
    points.push({ date, balanceCents: balance, items: dayItems, estimateCents })
  }

  let lowest = points[0]
  for (const point of points) {
    if (point.balanceCents < lowest.balanceCents) lowest = point
  }
  const below = points.find((point) => point.balanceCents < thresholdCents)
  return {
    points,
    endBalanceCents: points.at(-1)!.balanceCents,
    lowest: { date: lowest.date, balanceCents: lowest.balanceCents },
    belowThreshold: below
      ? { date: below.date, balanceCents: below.balanceCents }
      : null,
    estimateTotalCents,
  }
}
