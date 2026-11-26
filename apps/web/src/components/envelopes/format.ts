import type { CategoryIcon, EnvelopeSummaryDto } from '#/api/types.gen'
import { CATEGORY_PALETTE } from '#/components/categories/palette'
import { formatCalendarDate, formatWholeEuros } from '#/lib/money'
import { plural } from '#/lib/plural'

/** Colours offered for an envelope: the categories' (the chart palette). */
export const ENVELOPE_PALETTE = CATEGORY_PALETTE

/** What an envelope without a colour is drawn in. */
export const DEFAULT_ENVELOPE_COLOR = 'var(--primary)'

/** « Libre »: hatched, muted. */
export const FREE_COLOR = 'var(--muted-foreground)'

/** Icons offered for an envelope (category icons, the likely ones first). */
export const ENVELOPE_ICONS: readonly CategoryIcon[] = [
  'plane',
  'baggage-claim',
  'shopping-bag',
  'smartphone',
  'tv',
  'sofa',
  'house',
  'key-round',
  'car',
  'bike',
  'shield',
  'heart-pulse',
  'gift',
  'party-popper',
  'baby',
  'paw-print',
  'graduation-cap',
  'piggy-bank',
]

/**
 * « Pour quoi ? », the first screen of the creation (#428, « B. Modèle
 * d'abord »): each tile fills in the name, icon, colour and categories.
 */
export interface EnvelopeTemplate {
  key: string
  label: string
  name: string
  icon: CategoryIcon
  color: string
  /** Expense categories it pays for, by slug. */
  categorySlugs: readonly string[]
}

export const ENVELOPE_TEMPLATES: readonly EnvelopeTemplate[] = [
  {
    key: 'trip',
    label: 'Voyage',
    name: 'Voyage',
    icon: 'plane',
    color: '#e87ba4',
    categorySlugs: ['travel'],
  },
  {
    key: 'purchase',
    label: 'Un achat',
    name: 'Achat',
    icon: 'shopping-bag',
    color: '#eb6834',
    categorySlugs: ['shopping'],
  },
  {
    key: 'deposit',
    label: 'Un apport',
    name: 'Apport',
    icon: 'house',
    color: '#008300',
    categorySlugs: [],
  },
  {
    key: 'safety',
    label: 'Imprévus',
    name: 'Imprévus',
    icon: 'shield',
    color: '#2a78d6',
    categorySlugs: [],
  },
  {
    key: 'gifts',
    label: 'Cadeaux',
    name: 'Cadeaux',
    icon: 'gift',
    color: '#6250d6',
    categorySlugs: ['gifts'],
  },
  {
    key: 'other',
    label: 'Autre',
    name: '',
    icon: 'piggy-bank',
    color: '#1baf7a',
    categorySlugs: [],
  },
]

export function envelopeColor(envelope: { color: string | null }): string {
  return envelope.color ?? DEFAULT_ENVELOPE_COLOR
}

/** Basis points as « 22 % ». */
export function formatBasisPoints(basisPoints: number): string {
  return `${Math.round(basisPoints / 100)} %`
}

/** « Pour le 1 juil. 2027 » or « Sans échéance ». */
export function dueText(dueDate: string | null): string {
  return dueDate ? `Pour le ${formatCalendarDate(dueDate)}` : 'Sans échéance'
}

/**
 * What it takes to get there, in a few words (#428): « 221 € par mois
 * pendant 7 mois », « Il manque 800 € » without a due date, « Atteint ».
 * Null without a target.
 */
export function planText(envelope: EnvelopeSummaryDto): string | null {
  const { plan, targetCents } = envelope
  if (targetCents === null) return null
  if (plan.reached) return 'Atteint'
  if (plan.targetDatePassed) {
    return `Échéance passée · il manque ${formatWholeEuros(plan.remainingCents ?? 0)}`
  }
  if (plan.requiredMonthlyCents !== null && plan.monthsLeft !== null) {
    return `${formatWholeEuros(plan.requiredMonthlyCents)} par mois pendant ${plural(plan.monthsLeft, 'mois', 'mois')}`
  }
  return `Il manque ${formatWholeEuros(plan.remainingCents ?? 0)}`
}

/** The calendar day `months` months after `today` (end of month kept). */
export function addMonthsTo(today: string, months: number): string {
  const [year, month, day] = today.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()
  target.setUTCDate(Math.min(day, last))
  return target.toISOString().slice(0, 10)
}

/** Month ends from `today` until `dueDate` (at least 1), as the API counts. */
export function monthsUntil(today: string, dueDate: string): number {
  const index = (date: string) => {
    const [y, m] = date.split('-').map(Number)
    return y * 12 + m
  }
  const [y, m, d] = dueDate.split('-').map(Number)
  const isMonthEnd = new Date(Date.UTC(y, m, 0)).getUTCDate() === d
  return Math.max(1, index(dueDate) - index(today) + (isMonthEnd ? 1 : 0))
}
