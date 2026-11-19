import type { PeriodStatus } from '#/coverage/period'
import type { RecurringCadence } from '#/database/schema/domain-enums'
import { addMonths, isLastDayOfMonth } from '#/recurring/dates'
import type { IncomeLineStatus } from './dto/budget.dto'
import { firstDay, shiftMonth } from './months'

/**
 * Planned income (#315), pure: no I/O, no logging (amounts are private).
 *
 * A planned income line is a budget row on an `income` category. What came
 * in is read from the `income` lines of the month (`transaction_lines`), so
 * transfers never count. A partial month is compared like for like only
 * where the date of the money is known: a confirmed recurring credit of the
 * category with a monthly, quarterly or yearly cadence.
 */

/** A confirmed recurring credit, as the planned income needs it. */
export interface IncomeCredit {
  categoryId: string
  name: string
  cadence: RecurringCadence
  typicalAmountCents: number
  lastSeenDate: string
  nextExpectedDate: string | null
  endedOn: string | null
}

const CADENCE_MONTHS: Partial<Record<RecurringCadence, number>> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
}

function monthIndex(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number)
  return year * 12 + monthNumber - 1
}

/**
 * Whether the credit still runs in `month`: not cancelled before the month
 * starts, and seen within the two months before it (or since).
 */
export function creditRunsIn(credit: IncomeCredit, month: string): boolean {
  if (credit.endedOn !== null && credit.endedOn <= firstDay(month)) {
    return false
  }
  const months = CADENCE_MONTHS[credit.cadence] ?? 1
  // A stale series (no credit for 1.5 periods and more) is not expected.
  return (
    credit.lastSeenDate >=
    firstDay(shiftMonth(month, -Math.max(2, Math.ceil(months * 1.5))))
  )
}

/**
 * Day the credit is expected in `month`, or null when it is not due that
 * month or its date can't be told (weekly cadence). Month-end series stay
 * at month end; nothing on or after its cancellation date.
 */
export function expectedDateIn(
  credit: IncomeCredit,
  month: string,
): string | null {
  const step = CADENCE_MONTHS[credit.cadence]
  if (step === undefined) return null
  const anchor = credit.nextExpectedDate ?? credit.lastSeenDate
  const offset = monthIndex(month) - monthIndex(anchor.slice(0, 7))
  if (((offset % step) + step) % step !== 0) return null
  const day = isLastDayOfMonth(anchor) ? 31 : Number(anchor.slice(8, 10))
  const date = addMonths(firstDay(month), 0, day)
  if (credit.endedOn !== null && date >= credit.endedOn) return null
  return date
}

export interface ExpectedByNow {
  /**
   * What should have come in by `dataUntil`: the planned amount once every
   * credit's day is past, nothing before the first one, the credits already
   * due (capped at the plan) in between. Null when no date is known.
   */
  expectedByNowCents: number | null
  /** Next day a credit is expected after `dataUntil`, null when none. */
  expectedOn: string | null
}

/**
 * Like-for-like reading of one income line in a partial (or empty) month,
 * from the credits of its category. `dataUntil` null = nothing known yet.
 */
export function expectedByNow(
  credits: readonly IncomeCredit[],
  month: string,
  plannedCents: number,
  dataUntil: string | null,
): ExpectedByNow {
  const dates = credits
    .filter((credit) => creditRunsIn(credit, month))
    .flatMap((credit) => {
      const date = expectedDateIn(credit, month)
      return date === null ? [] : [{ date, cents: credit.typicalAmountCents }]
    })
  if (dates.length === 0) return { expectedByNowCents: null, expectedOn: null }
  const due = dates.filter((d) => dataUntil !== null && d.date <= dataUntil)
  const later = dates
    .filter((d) => dataUntil === null || d.date > dataUntil)
    .map((d) => d.date)
    .sort()
  const dueCents = due.reduce((total, d) => total + d.cents, 0)
  return {
    expectedByNowCents:
      later.length === 0 ? plannedCents : Math.min(plannedCents, dueCents),
    expectedOn: later[0] ?? null,
  }
}

/**
 * Where a planned income line stands:
 * - `pending`: nothing to say yet (empty month, or not due by the data's
 *   last day in a partial month);
 * - `received`: at least the planned amount came in;
 * - `short`: some came in, less than planned (or than due by now);
 * - `missing`: nothing came in although it was due;
 * - `so_far`: a partial month without a known date: « reçu à ce jour ».
 */
export function incomeLineStatus(
  period: PeriodStatus,
  plannedCents: number,
  receivedCents: number | null,
  expectedByNowCents: number | null,
): IncomeLineStatus {
  if (period === 'empty' || receivedCents === null) return 'pending'
  if (receivedCents >= plannedCents) return 'received'
  if (period === 'partial') {
    if (expectedByNowCents === null) return 'so_far'
    if (receivedCents >= expectedByNowCents) return 'pending'
  }
  return receivedCents <= 0 ? 'missing' : 'short'
}
