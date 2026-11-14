/**
 * Display helpers: euros from integer cents and French calendar dates. Dates
 * are `YYYY-MM-DD` / `YYYY-MM` strings handled as text, never through a
 * `Date` in a time zone, so they can't shift by a day.
 */
import type { MonthPeriodDto } from './api/types.js'

const euroFormat = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})
const percentFormat = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 1,
})

/** Intl uses (narrow) no-break spaces; plain spaces read better in tool output. */
function plainSpaces(text: string): string {
  return text.replace(/[  ]/g, ' ')
}

/** `123456` → `1 234,56 €`, `-4520` → `-45,20 €`. */
export function euros(cents: number): string {
  return plainSpaces(euroFormat.format(cents / 100))
}

/** Like `euros` with an explicit `+` for positive amounts (changes, gaps). */
export function signedEuros(cents: number): string {
  return cents > 0 ? `+${euros(cents)}` : euros(cents)
}

/** Nullable amounts: `n/c` (non communiqué) when unknown. */
export function eurosOrUnknown(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? 'n/c' : euros(cents)
}

/** Ratio (0.183) → `18,3 %`. */
export function percent(ratio: number | null | undefined): string {
  return ratio === null || ratio === undefined
    ? 'n/c'
    : plainSpaces(percentFormat.format(ratio))
}

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

const SHORT_MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
]

/** `2026-11-05` (or an ISO timestamp) → `05/11/2026`. */
export function frenchDate(date: string | null | undefined): string {
  if (!date) return 'n/c'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : date
}

/** `2026-11` → `novembre 2026`. */
export function frenchMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(month)
  const name = match ? MONTHS[Number(match[2]) - 1] : undefined
  return match && name ? `${name} ${match[1]}` : month
}

/** `2026-10` → `d'octobre 2026`, `2026-11` → `de novembre 2026`. */
export function ofMonth(month: string): string {
  const name = frenchMonth(month)
  return /^[aeiouy]/i.test(name) ? `d'${name}` : `de ${name}`
}

/** `2026-11` → `nov. 2026` (table headers). */
export function shortMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(month)
  const name = match ? SHORT_MONTHS[Number(match[2]) - 1] : undefined
  return match && name ? `${name} ${match[1]}` : month
}

/** How complete the month's data is, and what it is compared with. */
export function periodNote(period: MonthPeriodDto): string {
  const until = period.dataUntil
    ? ` (données jusqu'au ${frenchDate(period.dataUntil)})`
    : ''
  switch (period.status) {
    case 'complete':
      return `Mois complet${until}.`
    case 'partial':
      return `Mois partiel${until} : seuls les ${period.throughDay ?? '?'} premiers jours sont connus, comparés aux mêmes jours de ${frenchMonth(period.previousMonth)} et des mois de la moyenne.`
    case 'empty':
      return `Aucune donnée importée pour ce mois${until} : rien à comparer.`
  }
}

/** A Markdown table, cells already formatted. */
export function table(header: string[], rows: string[][]): string {
  const line = (cells: string[]) =>
    `| ${cells.map((c) => c.replace(/\|/g, '/')).join(' | ')} |`
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join(
    '\n',
  )
}

/** Today's calendar date in Europe/Paris (`YYYY-MM-DD`). */
export function parisToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Calendar arithmetic on `YYYY-MM-DD` strings (UTC only as a day counter). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days))
  return shifted.toISOString().slice(0, 10)
}

/**
 * Euros typed as text → integer cents, straight from the digits (never through
 * a float): `12,50` / `12.50` / `1 234,5 €` → 1250 / 1250 / 123450. A leading
 * `+` or `-` is returned apart (`sign`); `null` when the text isn't an amount
 * (more than two decimals, thousands separators other than spaces...).
 */
export function parseEuros(
  text: string,
): { cents: number; sign: '+' | '-' | null } | null {
  const compact = text.replace(/[\s€]/g, '').replace(/eur$/i, '')
  const match = /^([+-]?)(\d+)(?:[.,](\d{1,2}))?$/.exec(compact)
  if (!match) return null
  const [, sign, units = '', decimals = ''] = match
  if (units.length > 12) return null
  const cents = Number(units) * 100 + Number(decimals.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) return null
  return { cents, sign: sign === '+' || sign === '-' ? sign : null }
}

/** Cents → euros as text a tool accepts back (`4250` → `42,50`), without floats. */
export function centsToText(cents: number): string {
  const abs = Math.abs(cents)
  const units = Math.trunc(abs / 100)
  const decimals = String(abs % 100).padStart(2, '0')
  return `${cents < 0 ? '-' : ''}${units},${decimals}`
}

/** `2026-01` + -1 → `2025-12` (calendar months as text). */
export function addMonths(month: string, months: number): string {
  const [y, m] = month.split('-').map(Number)
  const index = (y ?? 0) * 12 + ((m ?? 1) - 1) + months
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}
