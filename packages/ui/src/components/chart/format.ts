/**
 * French formatting helpers for charts.
 *
 * Every monetary value handled by the chart components is an **integer number
 * of cents** (the app never stores money as floats). Cents are divided by 100
 * only here, at the display edge.
 *
 * Calendar periods are plain strings (`YYYY-MM` or `YYYY-MM-DD`) and are
 * formatted in UTC so they are never shifted by the browser's time zone.
 */

const LOCALE = 'fr-FR'

const eurosFormat = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
})

const signedEurosFormat = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  signDisplay: 'exceptZero',
})

const wholeEurosFormat = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

const compactEurosFormat = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

const percentFormat = new Intl.NumberFormat(LOCALE, {
  style: 'percent',
  maximumFractionDigits: 1,
})

const signedPercentFormat = new Intl.NumberFormat(LOCALE, {
  style: 'percent',
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

const monthShortFormat = new Intl.DateTimeFormat(LOCALE, {
  month: 'short',
  timeZone: 'UTC',
})

const monthLongFormat = new Intl.DateTimeFormat(LOCALE, {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const dayFormat = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/**
 * Formats `value` with `format`, without a sign when it prints as zero.
 * `Intl` keeps the minus of `-0` and of negatives that round to zero
 * (`-0 €`, `-0,00 €`); those are printed as a plain zero instead.
 */
function formatUnsignedZero(format: Intl.NumberFormat, value: number): string {
  const text = format.format(value)
  const negative = value < 0 || Object.is(value, -0)
  return negative && !/[1-9]/.test(text) ? format.format(0) : text
}

/** Formats a value expressed in a single unit (`number` → display string). */
export type ValueFormatter = (value: number) => string

/** Formats a category / period key (e.g. `2026-03`) for display. */
export type IndexFormatter = (value: string) => string

/** `123456` → `1 234,56 €`, `-0` → `0,00 €` */
export const formatEuros: ValueFormatter = (cents) =>
  formatUnsignedZero(eurosFormat, cents / 100)

/** `123456` → `+1 234,56 €`, `-500` → `-5,00 €`, `0` → `0,00 €` */
export const formatSignedEuros: ValueFormatter = (cents) =>
  signedEurosFormat.format(cents / 100)

/** `123456` → `1 235 €`, `-40` → `0 €` (no decimals, for dense labels) */
export const formatWholeEuros: ValueFormatter = (cents) =>
  formatUnsignedZero(wholeEurosFormat, Math.round(cents / 100))

/** Compact axis ticks: `85000` → `850 €`, `123456` → `1,2 k€`, `125000000` → `1,3 M€` */
export const formatCompactEuros: ValueFormatter = (cents) =>
  formatUnsignedZero(compactEurosFormat, cents / 100)

/** `0.125` → `12,5 %` */
export const formatPercent: ValueFormatter = (ratio) =>
  formatUnsignedZero(percentFormat, ratio)

/** `0.042` → `+4,2 %` */
export const formatSignedPercent: ValueFormatter = (ratio) =>
  signedPercentFormat.format(ratio)

/**
 * Parses a calendar string (`YYYY-MM` or `YYYY-MM-DD`) into a UTC timestamp
 * (midnight UTC, the first of the month for `YYYY-MM`). Returns `undefined`
 * for anything else.
 */
export function calendarToTime(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value)
  if (!match) return undefined
  const [, year, month, day] = match
  return Date.UTC(Number(year), Number(month) - 1, day ? Number(day) : 1)
}

/** UTC timestamp → `YYYY-MM-DD` calendar date (inverse of `calendarToTime`). */
export function timeToCalendar(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

/** `2026-03` → `mars`, `2026-01` → `janv.` (axis ticks) */
export const formatMonthShort: IndexFormatter = (value) => {
  const time = calendarToTime(value)
  return time === undefined ? value : monthShortFormat.format(time)
}

/** `2026-03` → `mars 2026` (tooltips, tables) */
export const formatMonthLong: IndexFormatter = (value) => {
  const time = calendarToTime(value)
  return time === undefined ? value : monthLongFormat.format(time)
}

/** `2026-03-14` → `14 mars` */
export const formatDay: IndexFormatter = (value) => {
  const time = calendarToTime(value)
  return time === undefined ? value : dayFormat.format(time)
}
