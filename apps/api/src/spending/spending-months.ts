/**
 * Calendar months (`YYYY-MM`) for the spending statistics. Booking dates are
 * calendar dates, so a month is a plain string range; only "the current
 * month" depends on a clock, and it is read in the app time zone.
 */

export const APP_TIME_ZONE = 'Europe/Paris'

const parisYearMonth = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
})

/** The month `now` falls in, in Europe/Paris (e.g. `2026-11`). */
export function parisMonth(now: Date): string {
  const parts = parisYearMonth.formatToParts(now)
  const year = parts.find((part) => part.type === 'year')!.value
  const month = parts.find((part) => part.type === 'month')!.value
  return `${year}-${month}`
}

/** `month` moved by `delta` months (`2026-01`, -1 → `2025-12`). */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const index = year * 12 + (monthNumber - 1) + delta
  const nextYear = Math.floor(index / 12)
  const nextMonth = (index % 12) + 1
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`
}

/** Every month from `from` to `to`, both included, oldest first. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = []
  for (let month = from; month <= to; month = shiftMonth(month, 1)) {
    months.push(month)
  }
  return months
}

/** First day of `month` (`YYYY-MM-01`). */
export function firstDay(month: string): string {
  return `${month}-01`
}
