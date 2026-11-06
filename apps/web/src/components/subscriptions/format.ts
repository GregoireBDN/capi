import type { RecurringCadence, RecurringItemDto } from '#/api/types.gen'
import { APP_TIME_ZONE } from '#/lib/calendar'
import { formatCents } from '#/lib/money'

/**
 * Display helpers of the subscriptions page. Dates are `YYYY-MM-DD` calendar
 * values: they only become a `Date` at UTC midnight, to count days or format
 * them, so no time zone can shift them. "Today" is read in Europe/Paris.
 */

export const CADENCES: readonly RecurringCadence[] = [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
]

export const CADENCE_LABELS: Record<RecurringCadence, string> = {
  weekly: 'Hebdomadaire',
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  yearly: 'Annuel',
}

/** Suffix of an amount: "12,99 € / mois". */
export const CADENCE_UNITS: Record<RecurringCadence, string> = {
  weekly: 'sem.',
  monthly: 'mois',
  quarterly: 'trim.',
  yearly: 'an',
}

/** Suggestions from this confidence are confirmed by "Tout confirmer". */
export const HIGH_CONFIDENCE = 0.8

/** Days of the upcoming debits timeline. */
export const UPCOMING_DAYS = 30

const parisDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today's date in Europe/Paris (`2026-11-06`). */
export function todayInParis(now: Date = new Date()): string {
  const parts = parisDate.formatToParts(now)
  const get = (type: string) => parts.find((part) => part.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

const MS_PER_DAY = 86_400_000

function toUtc(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / MS_PER_DAY)
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * MS_PER_DAY)
}

/** `date` + `months`, the day clamped to the month length (Jan 31 → Feb 28). */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const index = year * 12 + (month - 1) + months
  const nextYear = Math.floor(index / 12)
  const nextMonth = index % 12
  const length = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate()
  return fromUtc(Date.UTC(nextYear, nextMonth, Math.min(day, length)))
}

/** The date one period after `date`. */
export function nextPeriod(date: string, cadence: RecurringCadence): string {
  switch (cadence) {
    case 'weekly':
      return addDays(date, 7)
    case 'monthly':
      return addMonths(date, 1)
    case 'quarterly':
      return addMonths(date, 3)
    case 'yearly':
      return addMonths(date, 12)
  }
}

/** "aujourd’hui", "demain", "dans 5 jours", "hier", "il y a 3 jours". */
export function formatRelativeDay(date: string, today: string): string {
  const days = daysBetween(today, date)
  if (days === 0) return 'aujourd’hui'
  if (days === 1) return 'demain'
  if (days === -1) return 'hier'
  return days > 0 ? `dans ${days} jours` : `il y a ${-days} jours`
}

const shortDay = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/** `2026-11-09` → "lun. 9 nov.". */
export function formatShortDay(date: string): string {
  return shortDay.format(new Date(toUtc(date)))
}

const monthName = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  timeZone: 'UTC',
})

/**
 * "+2,00 € depuis mars" (the year is added when it is not the current one);
 * null without a price change.
 */
export function formatPriceChange(
  item: Pick<RecurringItemDto, 'priceChangeCents' | 'priceChangedOn'>,
  today: string,
): string | null {
  if (item.priceChangeCents === null || item.priceChangeCents === 0) {
    return null
  }
  const sign = item.priceChangeCents > 0 ? '+' : '−'
  const amount = `${sign}${formatCents(Math.abs(item.priceChangeCents))}`
  if (!item.priceChangedOn) return amount
  const month = monthName.format(new Date(toUtc(item.priceChangedOn)))
  const year = item.priceChangedOn.slice(0, 4)
  return `${amount} depuis ${month}${year === today.slice(0, 4) ? '' : ` ${year}`}`
}

/** "12,99 € / mois", "~ 84,00 € / mois" for a variable amount. */
export function formatAmountPerPeriod(
  item: Pick<RecurringItemDto, 'typicalAmountCents' | 'amountType' | 'cadence'>,
): string {
  const approx = item.amountType === 'variable' ? '~ ' : ''
  return `${approx}${formatCents(item.typicalAmountCents)} / ${CADENCE_UNITS[item.cadence]}`
}

export function confidenceLabel(confidence: number): string {
  if (confidence >= HIGH_CONFIDENCE) return 'Fiabilité élevée'
  if (confidence >= 0.5) return 'Fiabilité moyenne'
  return 'Fiabilité faible'
}

export interface UpcomingDebit {
  /** `${itemId}:${date}`. */
  key: string
  date: string
  item: RecurringItemDto
}

/**
 * Expected debits of the confirmed, active items from `today` to
 * `today + days` included, by date. An expected date already past (not
 * imported yet) is carried forward period by period; weekly items repeat.
 */
export function upcomingDebits(
  items: readonly RecurringItemDto[],
  today: string,
  days: number = UPCOMING_DAYS,
): UpcomingDebit[] {
  const end = addDays(today, days)
  const upcoming: UpcomingDebit[] = []
  for (const item of items) {
    if (
      item.status !== 'confirmed' ||
      !item.active ||
      item.direction !== 'debit' ||
      !item.nextExpectedDate
    ) {
      continue
    }
    let date = item.nextExpectedDate
    // Bounded: at most a year and a half of weekly periods.
    for (let guard = 0; date < today && guard < 80; guard++) {
      date = nextPeriod(date, item.cadence)
    }
    for (let guard = 0; date <= end && guard < 10; guard++) {
      upcoming.push({ key: `${item.id}:${date}`, date, item })
      date = nextPeriod(date, item.cadence)
    }
  }
  return upcoming.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.item.name.localeCompare(b.item.name, 'fr'),
  )
}

export interface RecurringGroups {
  suggestions: RecurringItemDto[]
  subscriptions: RecurringItemDto[]
  fixed: RecurringItemDto[]
  variable: RecurringItemDto[]
  incomes: RecurringItemDto[]
  dismissed: RecurringItemDto[]
}

/**
 * Suggestions (most confident first), confirmed items split into
 * subscriptions (the `subscriptions` category), other fixed costs, other
 * debits and incomes (largest monthly cost first), and dismissed items.
 */
export function groupItems(
  items: readonly RecurringItemDto[],
): RecurringGroups {
  const groups: RecurringGroups = {
    suggestions: [],
    subscriptions: [],
    fixed: [],
    variable: [],
    incomes: [],
    dismissed: [],
  }
  for (const item of items) {
    if (item.status === 'suggested') groups.suggestions.push(item)
    else if (item.status === 'dismissed') groups.dismissed.push(item)
    else if (item.direction === 'credit') groups.incomes.push(item)
    else if (item.isSubscription) groups.subscriptions.push(item)
    else if (item.isFixedCost) groups.fixed.push(item)
    else groups.variable.push(item)
  }
  groups.suggestions.sort((a, b) => b.confidence - a.confidence)
  const byCost = (a: RecurringItemDto, b: RecurringItemDto) =>
    Number(b.active) - Number(a.active) ||
    b.monthlyEquivalentCents - a.monthlyEquivalentCents
  groups.subscriptions.sort(byCost)
  groups.fixed.sort(byCost)
  groups.variable.sort(byCost)
  groups.incomes.sort(byCost)
  return groups
}
