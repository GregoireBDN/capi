/**
 * Labels suggested when entering a transaction by hand (#196). Pure
 * functions only: no I/O, no logging (labels are private).
 *
 * Two sources, read by `ManualTransactionsService.suggestions`:
 * - the labels typed on manual transactions (not the default label, which
 *   is the category name), the owner's own words, weighted double;
 * - the merchants of imported rows, so a label stays suggested after the
 *   import of the bank export has replaced the manual transaction (and the
 *   bank's merchant name helps the reconciliation match it next time). A
 *   merchant seen once and never typed is left out.
 */

/** Uses of one label (case-insensitive key) filed under one category. */
export interface SuggestionGroup {
  /** Lower-cased, trimmed label: the grouping key. */
  key: string
  /** The label as last written. */
  label: string
  categoryId: string | null
  uses: number
  /** Latest `YYYY-MM-DD` day it was used. */
  lastUsed: string
  /** Typed on a manual transaction (else an imported row's merchant). */
  manual: boolean
}

export interface Suggestion {
  label: string
  categoryId: string | null
}

/** Share of a label's uses its category needs to be filled in with it. */
export const DOMINANT_SHARE = 0.7
/** Uses an imported merchant needs to be suggested without being typed. */
export const MERCHANT_MIN_USES = 2
const MANUAL_WEIGHT = 2

interface Ranked {
  label: string
  labelDay: string
  labelFromManual: boolean
  score: number
  uses: number
  manual: boolean
  merchantUses: number
  lastUsed: string
  byCategory: Map<string | null, number>
}

/**
 * Most used labels first (typed ones count double), then the most recently
 * used, then alphabetical. A label comes with the category it is filed
 * under at least `DOMINANT_SHARE` of the time when that category is one of
 * `pickable` (open, of the kind being entered), else with none.
 */
export function rankSuggestions(
  groups: readonly SuggestionGroup[],
  pickable: ReadonlySet<string>,
  max: number,
): Suggestion[] {
  const byKey = new Map<string, Ranked>()
  for (const group of groups) {
    const key = group.key
    if (key === '') continue
    let ranked = byKey.get(key)
    if (!ranked) {
      ranked = {
        label: group.label,
        labelDay: group.lastUsed,
        labelFromManual: group.manual,
        score: 0,
        uses: 0,
        manual: false,
        merchantUses: 0,
        lastUsed: group.lastUsed,
        byCategory: new Map(),
      }
      byKey.set(key, ranked)
    }
    // The spelling shown: the latest typed one, else the latest merchant.
    const better =
      group.manual !== ranked.labelFromManual
        ? group.manual
        : group.lastUsed > ranked.labelDay
    if (better) {
      ranked.label = group.label
      ranked.labelDay = group.lastUsed
      ranked.labelFromManual = group.manual
    }
    ranked.score += group.uses * (group.manual ? MANUAL_WEIGHT : 1)
    ranked.uses += group.uses
    if (group.manual) ranked.manual = true
    else ranked.merchantUses += group.uses
    if (group.lastUsed > ranked.lastUsed) ranked.lastUsed = group.lastUsed
    ranked.byCategory.set(
      group.categoryId,
      (ranked.byCategory.get(group.categoryId) ?? 0) + group.uses,
    )
  }

  return [...byKey.values()]
    .filter(
      (ranked) => ranked.manual || ranked.merchantUses >= MERCHANT_MIN_USES,
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.lastUsed.localeCompare(a.lastUsed) ||
        a.label.localeCompare(b.label, 'fr'),
    )
    .slice(0, max)
    .map((ranked) => ({
      label: ranked.label,
      categoryId: dominantCategory(ranked, pickable),
    }))
}

function dominantCategory(
  ranked: Ranked,
  pickable: ReadonlySet<string>,
): string | null {
  for (const [categoryId, uses] of ranked.byCategory) {
    if (
      categoryId !== null &&
      pickable.has(categoryId) &&
      uses >= ranked.uses * DOMINANT_SHARE
    ) {
      return categoryId
    }
  }
  return null
}
