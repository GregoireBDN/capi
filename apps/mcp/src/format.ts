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
