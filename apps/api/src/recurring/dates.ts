/**
 * Calendar-date arithmetic on `YYYY-MM-DD` strings. Dates are calendar
 * values, never instants: they are turned into day numbers at UTC midnight
 * only to count days, so no time zone can shift them. "Today" is read in the
 * app time zone, Europe/Paris.
 */

export const APP_TIME_ZONE = 'Europe/Paris'

const MS_PER_DAY = 86_400_000

const parisDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today's calendar date in Europe/Paris, e.g. `2026-11-06`. */
export function todayInParis(now: Date = new Date()): string {
  const parts = parisDate.formatToParts(now)
  const get = (type: string) => parts.find((part) => part.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

interface Ymd {
  year: number
  month: number
  day: number
}

function parse(date: string): Ymd {
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

function format({ year, month, day }: Ymd): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Days since 1970-01-01 (calendar arithmetic only). */
export function dayNumber(date: string): number {
  const { year, month, day } = parse(date)
  return Date.UTC(year, month - 1, day) / MS_PER_DAY
}

function fromDayNumber(days: number): string {
  const d = new Date(days * MS_PER_DAY)
  return format({
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  })
}

/** Signed number of days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from)
}

export function addDays(date: string, days: number): string {
  return fromDayNumber(dayNumber(date) + days)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function dayOfMonth(date: string): number {
  return parse(date).day
}

export function isLastDayOfMonth(date: string): boolean {
  const { year, month, day } = parse(date)
  return day === daysInMonth(year, month)
}

/**
 * The date `months` months after `date`, on `day` (default: the day of
 * `date`) clamped to the length of the target month: Jan 31 + 1 → Feb 28
 * (29 in leap years).
 */
export function addMonths(date: string, months: number, day?: number): string {
  const start = parse(date)
  const index = start.year * 12 + (start.month - 1) + months
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return format({
    year,
    month,
    day: Math.min(day ?? start.day, daysInMonth(year, month)),
  })
}

/** The later of two `YYYY-MM-DD` dates. */
export function maxDate(a: string, b: string): string {
  return a >= b ? a : b
}

export function minDate(a: string, b: string): string {
  return a <= b ? a : b
}
