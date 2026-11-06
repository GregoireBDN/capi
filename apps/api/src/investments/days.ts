/**
 * Calendar days as `YYYY-MM-DD` strings. Day arithmetic goes through UTC
 * midnights, which have no daylight saving shift, so a date is never moved by
 * a time zone. Only "today" is read from an instant, in Europe/Paris.
 */

import { APP_TIME_ZONE } from '#/dashboard/calendar'

const DAY_MS = 86_400_000

const parisDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The calendar day `now` falls on in Europe/Paris (e.g. `2026-11-06`). */
export function parisToday(now: Date = new Date()): string {
  const parts = parisDay.formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

function utcMidnight(day: string): number {
  const [year, month, date] = day.split('-').map(Number)
  return Date.UTC(year, month - 1, date)
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / DAY_MS)
}

/** The same day one year earlier; 29 February becomes 28 February. */
export function oneYearBefore(day: string): string {
  const [year, month, date] = day.split('-')
  const previous = String(Number(year) - 1).padStart(4, '0')
  if (month === '02' && date === '29') return `${previous}-02-28`
  return `${previous}-${month}-${date}`
}
