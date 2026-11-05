/**
 * Arithmetic on `YYYY-MM-DD` calendar dates. Computed in UTC on purpose: the
 * strings are calendar dates, not instants, so no time zone may shift them.
 */

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

/** Days since the Unix epoch. Throws on anything but a valid `YYYY-MM-DD`. */
export function toEpochDay(date: string): number {
  const m = CALENDAR_DATE.exec(date)
  if (!m) throw new RangeError('Expected a YYYY-MM-DD calendar date')
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const time = Date.UTC(year, month - 1, day)
  const check = new Date(time)
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new RangeError('Expected a YYYY-MM-DD calendar date')
  }
  return time / DAY_MS
}

export function fromEpochDay(epochDay: number): string {
  return new Date(epochDay * DAY_MS).toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  return fromEpochDay(toEpochDay(date) + days)
}

/** Absolute number of days between two calendar dates. */
export function daysBetween(a: string, b: string): number {
  return Math.abs(toEpochDay(a) - toEpochDay(b))
}
