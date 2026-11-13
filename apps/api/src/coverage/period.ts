/**
 * How far a month's figures go, and what they can fairly be compared with.
 *
 * Statements are imported by hand, so early in a month the current month is
 * empty or partial while the previous one is complete. Comparing them as is
 * shows the whole previous month as a drop (`-100 %`, an unpaid rent as a
 * saving). Every page that compares months goes through these helpers:
 *
 * - `dataUntil` is the latest day with data (see `coverage.ts`), never after
 *   today in Europe/Paris;
 * - a month is `complete` when the data reaches its last day, `partial` when
 *   it stops inside it (only its first `throughDay` days are known), `empty`
 *   when it stops before it;
 * - a partial month is compared **like for like**: the same first days of
 *   the previous month and of the averaged months (`sameDaysEnd`);
 * - with no month asked for, pages show the current month when it has data,
 *   else the month the data stops in (`defaultMonth`).
 *
 * Days are `YYYY-MM-DD` and months `YYYY-MM` strings, never shifted through a
 * time zone.
 */

import { monthEnd, shiftMonth } from '#/dashboard/calendar'

export const PERIOD_STATUSES = ['complete', 'partial', 'empty'] as const
export type PeriodStatus = (typeof PERIOD_STATUSES)[number]

export interface MonthPeriod {
  /** The month the figures are for (`YYYY-MM`). */
  month: string
  /** Latest day with data in scope, capped at today; null when none. */
  dataUntil: string | null
  status: PeriodStatus
  /**
   * Day of the month the figures go up to when `partial` (the day of
   * `dataUntil`), null otherwise.
   */
  throughDay: number | null
  /** The month before `month`. */
  previousMonth: string
  /**
   * Last day of `previousMonth` it is compared with: its first `throughDay`
   * days when partial, its whole length when complete, null when empty
   * (nothing to compare).
   */
  previousUntil: string | null
  /** Month a page shows when none is asked for. */
  defaultMonth: string
}

const pad = (value: number) => String(value).padStart(2, '0')

/** The current month when it has data, else the month the data stops in. */
export function defaultMonth(today: string, dataUntil: string | null): string {
  const current = today.slice(0, 7)
  if (dataUntil === null) return current
  const last = dataUntil.slice(0, 7)
  return last < current ? last : current
}

/**
 * Last day of `month` within its first `throughDay` days (its last day when
 * the month is shorter, e.g. 28 February for day 30), or its last day when
 * `throughDay` is null.
 */
export function sameDaysEnd(month: string, throughDay: number | null): string {
  const end = monthEnd(month)
  if (throughDay === null) return end
  const day = `${month}-${pad(throughDay)}`
  return day < end ? day : end
}

/** Status of `month` and its comparison bounds, for data up to `dataUntil`. */
export function monthPeriod(
  month: string,
  dataUntil: string | null,
  today: string,
): MonthPeriod {
  const previousMonth = shiftMonth(month, -1)
  const base = {
    month,
    dataUntil,
    previousMonth,
    defaultMonth: defaultMonth(today, dataUntil),
  }
  if (dataUntil === null || dataUntil < `${month}-01`) {
    return { ...base, status: 'empty', throughDay: null, previousUntil: null }
  }
  if (dataUntil >= monthEnd(month)) {
    return {
      ...base,
      status: 'complete',
      throughDay: null,
      previousUntil: monthEnd(previousMonth),
    }
  }
  const throughDay = Number(dataUntil.slice(8, 10))
  return {
    ...base,
    status: 'partial',
    throughDay,
    previousUntil: sameDaysEnd(previousMonth, throughDay),
  }
}
