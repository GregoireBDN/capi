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

/** Formats a value expressed in a single unit (`number` → display string). */
export type ValueFormatter = (value: number) => string

/** Formats a category / period key (e.g. `2026-03`) for display. */
export type IndexFormatter = (value: string) => string

/** `123456` → `1 234,56 €` */
export const formatEuros: ValueFormatter = (cents) =>
  eurosFormat.format(cents / 100)

/** `123456` → `+1 234,56 €`, `-500` → `-5,00 €`, `0` → `0,00 €` */
export const formatSignedEuros: ValueFormatter = (cents) =>
  signedEurosFormat.format(cents / 100)

/** `123456` → `1 235 €` (no decimals, for dense labels) */
export const formatWholeEuros: ValueFormatter = (cents) =>
  wholeEurosFormat.format(Math.round(cents / 100))

/** Compact axis ticks: `85000` → `850 €`, `123456` → `1,2 k€`, `125000000` → `1,3 M€` */
export const formatCompactEuros: ValueFormatter = (cents) =>
  compactEurosFormat.format(cents / 100)

/** `0.125` → `12,5 %` */
export const formatPercent: ValueFormatter = (ratio) =>
  percentFormat.format(ratio)

/** `0.042` → `+4,2 %` */
export const formatSignedPercent: ValueFormatter = (ratio) =>
  signedPercentFormat.format(ratio)

/**
 * Parses a calendar string (`YYYY-MM` or `YYYY-MM-DD`) into a UTC timestamp.
 * Returns `undefined` for anything else.
 */
function parseCalendar(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value)
  if (!match) return undefined
  const [, year, month, day] = match
  return Date.UTC(Number(year), Number(month) - 1, day ? Number(day) : 1)
}

/** `2026-03` → `mars`, `2026-01` → `janv.` (axis ticks) */
export const formatMonthShort: IndexFormatter = (value) => {
  const time = parseCalendar(value)
  return time === undefined ? value : monthShortFormat.format(time)
}

/** `2026-03` → `mars 2026` (tooltips, tables) */
export const formatMonthLong: IndexFormatter = (value) => {
  const time = parseCalendar(value)
  return time === undefined ? value : monthLongFormat.format(time)
}

/** `2026-03-14` → `14 mars` */
export const formatDay: IndexFormatter = (value) => {
  const time = parseCalendar(value)
  return time === undefined ? value : dayFormat.format(time)
}
