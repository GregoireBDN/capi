import type { BudgetStatus } from './dto/budget.dto'
import { firstDay } from './months'

/**
 * Pure budget arithmetic, in integer cents: no floats until the rounded
 * percentage.
 */

/**
 * `over` above 100 % of the target, `warning` from 80 % to 100 % included,
 * `ok` below. Compared in integers (`spent × 5 ≥ target × 4` ⇔ ≥ 80 %).
 */
export function budgetStatus(
  spentCents: number,
  targetCents: number,
): BudgetStatus {
  if (spentCents > targetCents) return 'over'
  if (spentCents * 5 >= targetCents * 4) return 'warning'
  return 'ok'
}

/** Spent / target × 100 with one decimal; 0 without a target. */
export function percentUsed(spentCents: number, targetCents: number): number {
  if (targetCents <= 0) return 0
  return Math.round((spentCents * 1000) / targetCents) / 10
}

/** Rounds cents to the nearest whole euro (half up), still in cents. */
export function roundToEuro(cents: number): number {
  return Math.round(cents / 100) * 100
}

/** A stored budget row, as the resolution needs it. */
export interface BudgetRow {
  id: string
  categoryId: string
  /** `YYYY-MM-01`. */
  effectiveFrom: string
  /** Null = budget ended from `effectiveFrom` on. */
  monthlyTargetCents: number | null
  note: string | null
}

/**
 * The row in effect for each category in `month`: the latest `effectiveFrom`
 * on or before the month's first day. Categories whose row in effect ends
 * the budget (null target) are left out.
 */
export function targetsInEffect(
  rows: readonly BudgetRow[],
  month: string,
): Map<string, BudgetRow & { monthlyTargetCents: number }> {
  const start = firstDay(month)
  const latest = new Map<string, BudgetRow>()
  for (const row of rows) {
    if (row.effectiveFrom > start) continue
    const current = latest.get(row.categoryId)
    if (!current || row.effectiveFrom > current.effectiveFrom) {
      latest.set(row.categoryId, row)
    }
  }
  const result = new Map<string, BudgetRow & { monthlyTargetCents: number }>()
  for (const [categoryId, row] of latest) {
    if (row.monthlyTargetCents !== null) {
      result.set(categoryId, {
        ...row,
        monthlyTargetCents: row.monthlyTargetCents,
      })
    }
  }
  return result
}
