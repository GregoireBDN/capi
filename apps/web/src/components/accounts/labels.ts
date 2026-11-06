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
