import { max } from 'drizzle-orm'
import {
  categorize,
  type CategorizableTransaction,
  validateRulePattern,
} from '#/categories/rules/categorize'
import { foldForMatch } from '#/categories/rules/normalize-text'
import {
  categorizationRulesTable,
  type SelectCategorizationRule,
  type SelectCategory,
  type TransactionKind,
} from '#/database/schema'
import type { DedupeExecutor } from '#/imports/dedupe/dedupe.repository'

/**
 * Bootstraps categorization rules from the categorized history: a merchant
 * that the spreadsheet almost always files the same way gets a `contains`
 * rule on its merchant key, appended after the existing rules.
 */

export interface RuleBootstrapRow extends CategorizableTransaction {
  merchantKey: string | null
  /** Null when the row has no category. */
  categoryId: string | null
  kind: TransactionKind
  /** Rows flagged for review hold guesses: they never vote for a rule. */
  needsReview: boolean
}

export interface ProposedRule {
  merchantKey: string
  /** The rule's `contains` pattern (the merchant key). */
  labelPattern: string
  categoryId: string
  /** Set only when it differs from the category's own kind. */
  kind: TransactionKind | null
  /** Rows of this merchant key. */
  occurrences: number
  /** Rows of this merchant key filed under the proposed category and kind. */
  agreeing: number
}

export interface ProposeRulesOptions {
  /** Minimum rows of one merchant key. Defaults to 3. */
  minOccurrences?: number
  /** Minimum share of those rows in the same category and kind. Defaults to 0.9. */
  minShare?: number
}

export interface ProposeRulesResult {
  /** In creation order: most frequent merchant first. */
  proposed: ProposedRule[]
  /** Frequent, consistent merchants already handled by a rule. */
  skippedCovered: number
  /** Patterns that would also catch too many rows filed differently. */
  skippedTooBroad: number
}

export const DEFAULT_MIN_OCCURRENCES = 3
export const DEFAULT_MIN_SHARE = 0.9
/** Shorter keys make `contains` patterns that match far too much. */
const MIN_PATTERN_LENGTH = 3

/**
 * Proposes rules from `rows`, without saving anything:
 *
 * 1. rows are grouped by merchant key; a key qualifies when it has at least
 *    `minOccurrences` rows and at least `minShare` of them share one
 *    (category, kind), rows without a category or flagged for review counting
 *    against it;
 * 2. a key is skipped when every one of its rows is already matched by an
 *    existing enabled rule (or by a rule proposed before it);
 * 3. a key is skipped when its `contains` pattern, applied to all the rows,
 *    would match rows that disagree with it more than `minShare` allows (a
 *    short key contained in other merchants' labels).
 */
export function proposeRules(
  rows: readonly RuleBootstrapRow[],
  existingRules: readonly SelectCategorizationRule[],
  categoriesById: ReadonlyMap<string, SelectCategory>,
  options: ProposeRulesOptions = {},
): ProposeRulesResult {
  const minOccurrences = options.minOccurrences ?? DEFAULT_MIN_OCCURRENCES
  const minShare = options.minShare ?? DEFAULT_MIN_SHARE

  const groups = new Map<string, RuleBootstrapRow[]>()
  for (const row of rows) {
    if (row.merchantKey === null) continue
    const group = groups.get(row.merchantKey) ?? []
    group.push(row)
    groups.set(row.merchantKey, group)
  }

  const candidates: ProposedRule[] = []
  for (const [merchantKey, group] of groups) {
    if (group.length < minOccurrences) continue
    if (merchantKey.length < MIN_PATTERN_LENGTH) continue
    if (validateRulePattern('contains', merchantKey) !== null) continue
    const dominant = dominantOutcome(group)
    if (!dominant || dominant.count / group.length < minShare) continue
    const category = categoriesById.get(dominant.categoryId)
    if (!category) continue
    candidates.push({
      merchantKey,
      labelPattern: merchantKey,
      categoryId: dominant.categoryId,
      kind: dominant.kind === category.kind ? null : dominant.kind,
      occurrences: group.length,
      agreeing: dominant.count,
    })
  }
  candidates.sort(
    (a, b) =>
      b.occurrences - a.occurrences ||
      (a.merchantKey < b.merchantKey
        ? -1
        : a.merchantKey > b.merchantKey
          ? 1
          : 0),
  )

  // Folded once: `contains` matching folds both sides (see `categorize`).
  const folded = rows.map((row) => ({
    row,
    label: foldForMatch(row.rawLabel),
    merchant: row.merchant === null ? null : foldForMatch(row.merchant),
  }))

  // Replaced, never mutated: `categorize` caches the sorted order per array.
  let rules: readonly SelectCategorizationRule[] = existingRules
  let nextPosition = Math.max(0, ...rules.map((r) => r.position + 1))
  const proposed: ProposedRule[] = []
  let skippedCovered = 0
  let skippedTooBroad = 0

  for (const candidate of candidates) {
    const group = groups.get(candidate.merchantKey)!
    if (group.every((row) => categorize(row, rules, categoriesById) !== null)) {
      skippedCovered++
      continue
    }

    const needle = foldForMatch(candidate.labelPattern)
    const matched = folded.filter(
      (f) =>
        f.label.includes(needle) || (f.merchant?.includes(needle) ?? false),
    )
    const category = categoriesById.get(candidate.categoryId)!
    const kind = candidate.kind ?? category.kind
    const agreeing = matched.filter(
      (f) =>
        !f.row.needsReview &&
        f.row.categoryId === candidate.categoryId &&
        f.row.kind === kind,
    ).length
    if (matched.length === 0 || agreeing / matched.length < minShare) {
      skippedTooBroad++
      continue
    }

    proposed.push(candidate)
    rules = [...rules, toRule(candidate, nextPosition++)]
  }

  return { proposed, skippedCovered, skippedTooBroad }
}

function dominantOutcome(
  group: readonly RuleBootstrapRow[],
): { categoryId: string; kind: TransactionKind; count: number } | null {
  const counts = new Map<
    string,
    { categoryId: string; kind: TransactionKind; count: number }
  >()
  for (const row of group) {
    if (row.needsReview || row.categoryId === null) continue
    const key = `${row.categoryId}\n${row.kind}`
    const entry = counts.get(key) ?? {
      categoryId: row.categoryId,
      kind: row.kind,
      count: 0,
    }
    entry.count++
    counts.set(key, entry)
  }
  let best: {
    categoryId: string
    kind: TransactionKind
    count: number
  } | null = null
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry
  }
  return best
}

/** An unsaved rule, so later candidates see the earlier ones. */
function toRule(
  proposal: ProposedRule,
  position: number,
): SelectCategorizationRule {
  const now = new Date(0)
  return {
    id: `proposed:${position}`,
    createdAt: now,
    updatedAt: now,
    position,
    priority: 0,
    enabled: true,
    matchType: 'contains',
    labelPattern: proposal.labelPattern,
    accountId: null,
    minAmountCents: null,
    maxAmountCents: null,
    categoryId: proposal.categoryId,
    counterpartAccountId: null,
    kind: proposal.kind,
    merchant: null,
  }
}

/**
 * Saves the proposals after the existing rules (their creation order; the
 * evaluation order is computed, #299). Run inside the import transaction.
 */
export async function createProposedRules(
  db: DedupeExecutor,
  proposed: readonly ProposedRule[],
): Promise<SelectCategorizationRule[]> {
  if (proposed.length === 0) return []
  const [{ last }] = await db
    .select({ last: max(categorizationRulesTable.position) })
    .from(categorizationRulesTable)
  const start = (last ?? -1) + 1
  return db
    .insert(categorizationRulesTable)
    .values(
      proposed.map((p, i) => ({
        position: start + i,
        enabled: true,
        matchType: 'contains' as const,
        labelPattern: p.labelPattern,
        accountId: null,
        minAmountCents: null,
        maxAmountCents: null,
        categoryId: p.categoryId,
        kind: p.kind,
        merchant: null,
      })),
    )
    .returning()
}
