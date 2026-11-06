/**
 * Calendar months (`YYYY-MM`) for budgets. Months are plain strings: no
 * `Date` arithmetic, so no time zone can shift a boundary. "Now" is read in
 * the app time zone, Europe/Paris.
 */

export const APP_TIME_ZONE = 'Europe/Paris'

/** `YYYY-MM` with a real month. */
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

const parisYearMonth = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
})

/** The current month in Europe/Paris, e.g. `2026-11`. */
export function currentParisMonth(now: Date = new Date()): string {
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

/** The `count` months ending with `last`, oldest first. */
export function monthRange(last: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    shiftMonth(last, i - count + 1),
  )
}

/** First day of a month as a calendar date (`2026-11` → `2026-11-01`). */
export function firstDay(month: string): string {
  return `${month}-01`
}
