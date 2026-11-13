/**
 * How far a month's figures go, in words (see `MonthPeriodDto`): the API
 * decides whether a month is complete, partial (compared with the same first
 * days of the previous month) or still empty; these helpers only phrase it.
 * Dates are calendar values formatted in UTC, so no time zone shifts them.
 */

import type { MonthPeriodDto } from '#/api/types.gen'
import { formatMonth } from './calendar'

const dayMonth = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const dayMonthYear = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const shortMonth = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  timeZone: 'UTC',
})

function utc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

/**
 * `2026-11-03` → "3 nov.", with the year when it is not `referenceYear`'s
 * ("28 oct. 2025").
 */
export function formatShortDay(date: string, referenceYear?: string): string {
  const format =
    referenceYear === undefined || date.startsWith(referenceYear)
      ? dayMonth
      : dayMonthYear
  return format.format(utc(date)).replace(/^1 /, '1er ')
}

/**
 * Days of the previous month a partial month is compared with: "1–3 oct.",
 * "1er oct." for a single day. Null when the month is not partial.
 */
export function comparedDays(period: MonthPeriodDto): string | null {
  if (period.status !== 'partial' || period.previousUntil === null) return null
  const day = Number(period.previousUntil.slice(8, 10))
  const month = shortMonth.format(utc(period.previousUntil))
  return day === 1 ? `1er ${month}` : `1–${day} ${month}`
}

/** Ends `text` with a full stop, unless it already ends with one ("oct."). */
function sentence(text: string): string {
  return text.endsWith('.') ? text : `${text}.`
}

/** "novembre" (lower case, without the year). */
function monthWord(month: string): string {
  return formatMonth(month)
    .toLowerCase()
    .replace(/\s\d{4}$/, '')
}

/**
 * One line saying how far the figures go and what they are compared with,
 * or null when there is no data at all (the page shows its empty state).
 */
export function describePeriod(
  period: MonthPeriodDto,
  currentMonth: string,
): string | null {
  const { dataUntil } = period
  if (dataUntil === null) return null
  const year = period.month.slice(0, 4)
  const until = formatShortDay(dataUntil, year)
  switch (period.status) {
    case 'empty':
      return sentence(
        `Pas encore de données en ${monthWord(period.month)} : elles s’arrêtent au ${formatShortDay(dataUntil, currentMonth.slice(0, 4))}`,
      )
    case 'partial': {
      const compared = `comparées au ${comparedDays(period)}`
      return sentence(
        period.month === currentMonth
          ? `Mois en cours : données jusqu’au ${until}, ${compared}`
          : `Données jusqu’au ${until} seulement, ${compared}`,
      )
    }
    case 'complete':
      return sentence(
        `Mois complet, données jusqu’au ${formatShortDay(dataUntil, currentMonth.slice(0, 4))}`,
      )
  }
}

/** Whether the month can be compared with the previous one at all. */
export function isComparable(period: MonthPeriodDto): boolean {
  return period.status !== 'empty'
}

/**
 * What a delta is "vs": the same first days while the month is partial
 * ("vs 1–3 oct."), else `fallback` (e.g. "vs mois précédent").
 */
export function comparisonLabel(
  period: MonthPeriodDto,
  fallback: string,
): string {
  const days = comparedDays(period)
  return days === null ? fallback : `vs ${days}`
}
