/** One effective-dated budget row of a category (see `budgetsTable`). */
export interface BudgetTimelineRow {
  /** First day of the month the target applies from (`YYYY-MM-01`). */
  effectiveFrom: string
  /** Positive integer cents per month; null = no budget from this month on. */
  monthlyTargetCents: number | null
  note: string | null
}

/** Target in effect on `date`: undefined before the first row, null when ended. */
function inEffect(
  rows: readonly BudgetTimelineRow[],
  date: string,
): BudgetTimelineRow | undefined {
  let current: BudgetTimelineRow | undefined
  for (const row of rows) {
    if (row.effectiveFrom > date) break
    current = row
  }
  return current
}

function byDate(a: BudgetTimelineRow, b: BudgetTimelineRow): number {
  return a.effectiveFrom < b.effectiveFrom
    ? -1
    : a.effectiveFrom > b.effectiveFrom
      ? 1
      : 0
}

/**
 * Budget rows of `target` once `source` is merged into it (deleting a category
 * with reassignment): in every month, the merged target is the sum of the two
 * targets in effect, so the merged category is compared with the money both
 * budgets allowed. A month where neither has a target has none.
 *
 * Rows are produced at every date where either timeline changes; the note of
 * the target's row wins over the source's at the same date.
 */
export function mergeBudgetTimelines(
  source: readonly BudgetTimelineRow[],
  target: readonly BudgetTimelineRow[],
): BudgetTimelineRow[] {
  const sourceRows = [...source].sort(byDate)
  const targetRows = [...target].sort(byDate)
  const dates = [
    ...new Set([...sourceRows, ...targetRows].map((r) => r.effectiveFrom)),
  ].sort()

  return dates.map((date) => {
    const fromSource = inEffect(sourceRows, date)?.monthlyTargetCents ?? null
    const fromTarget = inEffect(targetRows, date)?.monthlyTargetCents ?? null
    const note =
      targetRows.find((r) => r.effectiveFrom === date)?.note ??
      sourceRows.find((r) => r.effectiveFrom === date)?.note ??
      null
    return {
      effectiveFrom: date,
      monthlyTargetCents:
        fromSource === null && fromTarget === null
          ? null
          : (fromSource ?? 0) + (fromTarget ?? 0),
      note,
    }
  })
}
