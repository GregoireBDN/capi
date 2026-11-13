import type {
  CategorySpendingDto,
  SpendingByCategoryDto,
} from '#/api/types.gen'
import { comparedDays } from '#/lib/period'
import { monthName } from './labels'

/**
 * What the category rows show, decided apart from the markup: one
 * comparison at a time, the budget target when there is one, and the
 * recurring costs still expected ("attendu") never shown as a saving.
 */

/** What each row's change is measured against (`cmp` in the URL). */
export type Comparison = 'previous' | 'average'

/** The change shown on the right of a row. */
export type RowComparison =
  /** Spent minus the previous month (or the average), integer cents. */
  | { type: 'delta'; cents: number }
  /** Nothing spent yet while the compared days had some: not a saving. */
  | { type: 'not-yet' }
  /** Nothing to show: no history, or only an expected cost. */
  | { type: 'none' }

export function rowComparison(
  item: CategorySpendingDto,
  comparison: Comparison,
): RowComparison {
  if (item.transactionCount === 0 && item.expectedCents > 0) {
    // "850 € attendus" says it all; a drop would read as a saving.
    return { type: 'none' }
  }
  if (item.notYetThisMonth) return { type: 'not-yet' }
  if (comparison === 'average') {
    return item.averageCents === null
      ? { type: 'none' }
      : { type: 'delta', cents: item.spentCents - item.averageCents }
  }
  return { type: 'delta', cents: item.deltaCents }
}

/**
 * A category with nothing spent and nothing expected this month: listed
 * only because the month before had some. Folded away by default.
 */
export function isWithoutSpending(item: CategorySpendingDto): boolean {
  return item.transactionCount === 0 && item.expectedCents === 0
}

/** Spent / target (0 to ∞), or null without a target. */
export function targetRatio(item: CategorySpendingDto): number | null {
  if (item.targetCents === null || item.targetCents <= 0) return null
  return Math.max(0, item.spentCents) / item.targetCents
}

/**
 * What the rows are compared with, in words: "Écart avec septembre",
 * "Écart avec le 1–3 oct." while the month is partial, or "Écart avec la
 * moyenne sur 6 mois (mêmes jours)".
 */
export function comparisonCaption(
  data: Pick<
    SpendingByCategoryDto,
    'period' | 'previousMonth' | 'month' | 'averageMonths'
  >,
  comparison: Comparison,
): string {
  const days = comparedDays(data.period)
  if (comparison === 'average') {
    return `Écart avec la moyenne sur ${data.averageMonths} mois${days ? ' (mêmes jours)' : ''}`
  }
  return days
    ? `Écart avec le ${days}`
    : `Écart avec ${monthName(data.previousMonth, data.month)}`
}

/**
 * The same for screen readers after each row's change: "par rapport à
 * septembre", "par rapport au 1–3 oct.", "par rapport à la moyenne".
 */
export function comparedWithText(
  data: Pick<SpendingByCategoryDto, 'period' | 'previousMonth' | 'month'>,
  comparison: Comparison,
): string {
  if (comparison === 'average') return 'par rapport à la moyenne'
  const days = comparedDays(data.period)
  return days
    ? `par rapport au ${days}`
    : `par rapport à ${monthName(data.previousMonth, data.month)}`
}
