import { APP_TIME_ZONE } from '#/lib/calendar'

const parisDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today's calendar day in Europe/Paris (`YYYY-MM-DD`). */
export function todayInParis(now: Date = new Date()): string {
  const parts = parisDay.formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** `YYYY-MM-DD` naming a day that exists, or null. */
export function calendarDate(
  year: number,
  month: number,
  day: number,
): string | null {
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (
    year < 1000 ||
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null
  }
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}`
}

/** `jj/mm/aaaa` (or `j/m/aaaa`) → `YYYY-MM-DD`, or null. */
export function parseFrenchDate(text: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim())
  if (!match) return null
  return calendarDate(Number(match[3]), Number(match[2]), Number(match[1]))
}

/** `YYYY-MM-DD` → `jj/mm/aaaa`. */
export function toFrenchDate(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}

const DAY_MS = 86_400_000
const utcMidnight = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

/** Whole days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / DAY_MS)
}
