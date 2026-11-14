/**
 * Calendar months (`YYYY-MM`) and days (`YYYY-MM-DD`) as the app shows them.
 * Dates are calendar values, never instants: they are only turned into a
 * `Date` at UTC midnight for `Intl` formatting, so no time zone can shift them.
 * "Now" is read in the app time zone, Europe/Paris.
 */

export const APP_TIME_ZONE = 'Europe/Paris'

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export function isMonth(value: string): boolean {
  return MONTH_PATTERN.test(value)
}

const parisYearMonth = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
})

/** The current month in Europe/Paris, e.g. `2026-11`. */
export function currentMonth(now: Date = new Date()): string {
  const parts = parisYearMonth.formatToParts(now)
  const year = parts.find((part) => part.type === 'year')!.value
  const month = parts.find((part) => part.type === 'month')!.value
  return `${year}-${month}`
}

const parisDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today in Europe/Paris, e.g. `2026-11-13`. */
export function currentDay(now: Date = new Date()): string {
  const parts = parisDay.formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** `month` moved by `delta` months (`2026-01`, -1 → `2025-12`). */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const index = year * 12 + (monthNumber - 1) + delta
  const nextYear = Math.floor(index / 12)
  const nextMonth = (index % 12) + 1
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`
}

const monthLabel = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** `2026-11` → "Novembre 2026". */
export function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const text = monthLabel.format(new Date(Date.UTC(year, monthNumber - 1, 1)))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const dayLabel = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** `2026-11-03` → "Mardi 3 novembre 2026". */
export function formatDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const text = dayLabel.format(new Date(Date.UTC(year, month - 1, day)))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "d’octobre", "de novembre" (lower case, no year). */
export function ofMonth(month: string): string {
  const word = formatMonth(month)
    .toLowerCase()
    .replace(/\s\d{4}$/, '')
  return /^[aeiouy]/.test(word) ? `d’${word}` : `de ${word}`
}
