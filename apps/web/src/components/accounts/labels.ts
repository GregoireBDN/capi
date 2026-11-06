import type { AccountType } from '#/api/types.gen'
import { formatCalendarDate } from '#/lib/money'

/** Checking and savings accounts are fed by imports; the rest by snapshots. */
export function isInvestmentType(type: AccountType): boolean {
  return type !== 'checking' && type !== 'savings'
}

/** `il y a 92 jours`, `hier`, `aujourd’hui`. */
export function formatAge(days: number): string {
  if (days <= 0) return 'aujourd’hui'
  if (days === 1) return 'hier'
  return `il y a ${days} jours`
}

/** `Valeur du 5 août 2026, il y a 92 jours`. */
export function valueAgeText(date: string, days: number): string {
  return `Valeur du ${formatCalendarDate(date)}, ${formatAge(days)}`
}

const monthYear = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
})

/** Chart axis tick for a `YYYY-MM-DD` date: `sept. 26`. */
export function formatAxisDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return monthYear.format(new Date(Date.UTC(year, month - 1, day)))
}
