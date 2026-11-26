/**
 * The state of a month in the toolbar (#505, the owner's « barre d'outils +
 * état »): how far the imported data goes into it, or when it was closed.
 * Calendar dates are read as text, so no time zone shifts them; a close's
 * instant is shown as its day in Europe/Paris.
 */

import { shiftMonth } from './calendar'
import { formatShortDay } from './period'

export type MonthState =
  | { tone: 'closed'; text: string }
  | { tone: 'complete'; text: string }
  | { tone: 'partial'; text: string; shortText: string; progress: number }
  | { tone: 'empty'; text: string; shortText: string }

const closedDay = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Paris',
})

const shortMonth = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  timeZone: 'UTC',
})

/** Days in `month` (`YYYY-MM`). */
function daysIn(month: string): number {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number, 0)).getUTCDate()
}

/** "1–16 oct.", "1er oct.": the same first days of the month before. */
function sameDaysBefore(month: string, day: number): string {
  const previous = shiftMonth(month, -1)
  const last = Math.min(day, daysIn(previous))
  const [year, number] = previous.split('-').map(Number)
  const name = shortMonth.format(new Date(Date.UTC(year, number - 1, 1)))
  return last === 1 ? `1er ${name}` : `1–${last} ${name}`
}

export function monthState({
  month,
  dataUntil,
  monthsWithData,
  closedAt,
}: {
  /** `YYYY-MM`. */
  month: string
  /** Latest day with imported data (`CoverageDto.dataUntil`). */
  dataUntil: string | null
  /** Months with at least one transaction (`CoverageDto.months`). */
  monthsWithData: readonly string[]
  /** When the month was closed, if it was (ISO instant). */
  closedAt?: string
}): MonthState {
  if (closedAt !== undefined) {
    return {
      tone: 'closed',
      text: `le ${closedDay.format(new Date(closedAt)).replace(/^1 /, '1er ')}`,
    }
  }
  const empty = {
    tone: 'empty',
    text: 'Aucune donnée importée',
    shortText: 'Aucune donnée',
  } as const
  if (dataUntil === null) return empty
  const lastMonth = dataUntil.slice(0, 7)
  if (month < lastMonth) {
    return monthsWithData.includes(month)
      ? { tone: 'complete', text: 'Mois complet' }
      : empty
  }
  if (month > lastMonth) return empty
  const day = Number(dataUntil.slice(8, 10))
  const days = daysIn(month)
  if (day >= days) return { tone: 'complete', text: 'Mois complet' }
  const until = formatShortDay(dataUntil, month.slice(0, 4))
  const compared = sameDaysBefore(month, day)
  return {
    tone: 'partial',
    text: `Données jusqu’au ${until} · comparées au ${compared}`,
    shortText: `Jusqu’au ${until}`,
    progress: day / days,
  }
}
