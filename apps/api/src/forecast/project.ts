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
  /** Dates of the latest booked occurrences of the series. */
  bookedDates: readonly string[]
  categoryName: string | null
  categoryColor: string | null
}

export interface ExpectedItem {
  recurringItemId: string
  accountId: string
  name: string
  /** Day the projection applies it: the expected date, or today when it is late. */
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
  /** Last day of today's month. */
  monthEnd: string
}

/**
 * Remaining occurrences of `item` until `monthEnd`, from its next expected
 * date. `horizon` is the date the account's balance is known up to (its last
 * booked transaction or snapshot), null when it has none.
 *
 * An occurrence is skipped when it is already booked (a booked occurrence of
 * the series within the cadence tolerance of the expected date) or missed
 * (the data goes past the expected date by more than the tolerance without
 * it). A late one still within the tolerance, or one expected before today
 * but after the horizon (not imported yet), is applied today.
 */
export function expectedOccurrences(
  item: ForecastRecurringItem,
  { today, monthEnd }: ProjectionWindow,
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
    expected <= monthEnd;
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
      date: maxDate(expected, today),
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
 * Days the variable-spending estimate covers: every day after `balanceDate`
 * (the spending up to it is already in the balance) until `monthEnd`. Days
 * before today are not projected on their own: they count on today.
 * Returns the number of days applied on each projected day.
 */
export function estimateDays(
  { today, monthEnd }: ProjectionWindow,
  balanceDate: string | null,
): Map<string, number> {
  const days = new Map<string, number>()
  const first = balanceDate === null ? today : addDays(balanceDate, 1)
  for (let date = first; date <= monthEnd; date = addDays(date, 1)) {
    const on = maxDate(date, today)
    days.set(on, (days.get(on) ?? 0) + 1)
  }
  return days
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
 * Daily balance from today to month end (one point when today is the last
 * day): the starting balance, then each day's expected items and estimate.
 */
export function buildProjection({
  window,
  startingBalanceCents,
  items,
  dailyEstimateCents,
  estimateDaysByDate,
  thresholdCents,
}: {
  window: ProjectionWindow
  startingBalanceCents: number
  items: readonly ExpectedItem[]
  /** Positive cents spent per day, null without an estimate. */
  dailyEstimateCents: number | null
  estimateDaysByDate: ReadonlyMap<string, number>
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
    let date = window.today;
    date <= window.monthEnd;
    date = addDays(date, 1)
  ) {
    const dayItems = (byDate.get(date) ?? []).sort(
      (a, b) =>
        a.amountCents - b.amountCents ||
        a.name.localeCompare(b.name, 'fr') ||
        a.recurringItemId.localeCompare(b.recurringItemId),
    )
    const estimateCents =
      dailyEstimateCents === null || dailyEstimateCents === 0
        ? 0
        : -dailyEstimateCents * (estimateDaysByDate.get(date) ?? 0)
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
