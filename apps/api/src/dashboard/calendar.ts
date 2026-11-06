/**
 * Calendar months for the dashboard. Months are `YYYY-MM` strings and days
 * `YYYY-MM-DD` strings, handled with plain arithmetic: no `Date` is ever
 * shifted through a time zone. Only "now" is an instant, read in the app time
 * zone (Europe/Paris) to tell the current month.
 */

export const APP_TIME_ZONE = 'Europe/Paris'

/** `YYYY-MM` with a real month. */
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

const parisYearMonth = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
})

const pad = (value: number, length: number) =>
  String(value).padStart(length, '0')

/** The month `now` falls in, in Europe/Paris (e.g. `2026-11`). */
export function currentMonth(now: Date = new Date()): string {
  const parts = parisYearMonth.formatToParts(now)
  const year = parts.find((part) => part.type === 'year')!.value
  const month = parts.find((part) => part.type === 'month')!.value
  return `${year}-${month}`
}

/** `month` moved by `delta` months (`2026-01`, -1 → `2025-12`). */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const index = year * 12 + (monthNumber - 1) + delta
  return `${pad(Math.floor(index / 12), 4)}-${pad((index % 12) + 1, 2)}`
}

/** Last calendar day of `month` (`2024-02` → `2024-02-29`). */
export function monthEnd(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  // Day 0 of the next month, in UTC: only used for the day count.
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return `${month}-${pad(days, 2)}`
}

/** The `count` months ending with `last`, oldest first. */
export function monthsUntil(last: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    shiftMonth(last, i - count + 1),
  )
}
