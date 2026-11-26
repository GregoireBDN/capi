/**
 * Calendar days (`YYYY-MM-DD`) for the date picker (#488). A day is a
 * calendar value, never an instant: it becomes the picker's local midnight
 * built from its parts, and comes back from the picked date's local parts,
 * so no time zone (nor a DST change) can move it to the day before or after.
 */

/** A calendar day as the picker's local date (its local midnight, or the
 * first hour of that day where midnight is skipped by a DST change). */
export function dayToLocalDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  const local = new Date(year, month - 1, date)
  // Years 0 to 99 would be read as 1900 to 1999.
  local.setFullYear(year)
  return local
}

/** The picker's local date back to `YYYY-MM-DD`. */
export function localDateToDay(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

/** `2026-11-07` → `07/11/2026`. */
export function formatCalendarDay(day: string): string {
  const [year, month, date] = day.split('-')
  return `${date}/${month}/${year}`
}

const parisDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today in Europe/Paris, the app's time zone, e.g. `2026-11-13`. */
export function todayInParis(now: Date = new Date()): string {
  const parts = parisDay.formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
