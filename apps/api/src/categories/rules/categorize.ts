import type {
  SelectCategorizationRule,
  SelectCategory,
} from '#/categories/categories.schema'
import type {
  RuleMatchType,
  TransactionKind,
} from '#/database/schema/domain-enums'
import { foldForMatch } from './normalize-text'

/** The transaction fields the rules look at. */
export interface CategorizableTransaction {
  accountId: string
  rawLabel: string
  merchant: string | null
  /** Signed integer cents: negative = money out, positive = money in. */
  amountCents: number
}

export interface CategorizationResult {
  categoryId: string
  kind: TransactionKind
  ruleId: string
  merchant: string | null
}

/** Flags for `regex` rules. Validation on save must use the same flags. */
export const RULE_REGEX_FLAGS = 'i'

/**
 * Kind given to a transaction that no rule matched: money out is an expense,
 * money in is income. A zero amount counts as an expense (it never moves a
 * total). Such transactions also go to the review queue, where an internal
 * transfer can be fixed by hand.
 */
export function defaultKind(amountCents: number): TransactionKind {
  return amountCents > 0 ? 'income' : 'expense'
}

/**
 * Returns why `pattern` cannot be used for a rule of type `matchType`, or
 * `null` when it is valid. Called when a rule is saved, so matching never has
 * to deal with a broken pattern.
 */
export function validateRulePattern(
  matchType: RuleMatchType,
  pattern: string,
): string | null {
  if (matchType === 'contains') {
    return foldForMatch(pattern) === ''
      ? 'labelPattern must contain at least one letter or digit'
      : null
  }
  try {
    // Rule regexes are written by the signed-in owner and validated on save.
    // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
    new RegExp(pattern, RULE_REGEX_FLAGS)
    return null
  } catch (error) {
    // V8 messages embed the pattern (`/.../i: reason`); keep only the reason.
    const message = error instanceof Error ? error.message : String(error)
    const reason = /^Invalid regular expression: \/.*\/[a-z]*: (.*)$/s.exec(
      message,
    )?.[1]
    return `labelPattern is not a valid regular expression: ${reason ?? message}`
  }
}

/**
 * Compiled regexes and folded `contains` patterns, keyed by pattern. Bounded
 * so a long-running process editing many rules does not grow it forever.
 */
const MAX_CACHED_PATTERNS = 1000
const regexCache = new Map<string, RegExp | null>()
const foldedCache = new Map<string, string>()

function cached<T>(cache: Map<string, T>, key: string, make: () => T): T {
  const hit = cache.get(key)
  if (hit !== undefined || cache.has(key)) return hit as T
  if (cache.size >= MAX_CACHED_PATTERNS) cache.clear()
  const value = make()
  cache.set(key, value)
  return value
}

function compileRegex(pattern: string): RegExp | null {
  return cached(regexCache, pattern, () => {
    try {
      // Rule regexes are written by the signed-in owner and validated on save.
      // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
      return new RegExp(pattern, RULE_REGEX_FLAGS)
    } catch {
      // Rejected on save; a rule stored before validation simply never matches.
      return null
    }
  })
}

function foldPattern(pattern: string): string {
  return cached(foldedCache, pattern, () => foldForMatch(pattern))
}

/** A transaction with its folded texts, computed at most once per call. */
class MatchSubject {
  private foldedLabel: string | undefined
  private foldedMerchant: string | null | undefined

  constructor(readonly tx: CategorizableTransaction) {}

  get label(): string {
    return (this.foldedLabel ??= foldForMatch(this.tx.rawLabel))
  }

  get merchant(): string | null {
    if (this.foldedMerchant === undefined) {
      this.foldedMerchant =
        this.tx.merchant === null ? null : foldForMatch(this.tx.merchant)
    }
    return this.foldedMerchant
  }
}

function matchesLabel(
  rule: SelectCategorizationRule,
  subject: MatchSubject,
): boolean {
  const { tx } = subject
  if (rule.matchType === 'regex') {
    const regex = compileRegex(rule.labelPattern)
    if (!regex) return false
    return (
      regex.test(tx.rawLabel) ||
      (tx.merchant !== null && regex.test(tx.merchant))
    )
  }
  const needle = foldPattern(rule.labelPattern)
  if (needle === '') return false
  return (
    subject.label.includes(needle) ||
    (subject.merchant?.includes(needle) ?? false)
  )
}

function matchesSubject(
  rule: SelectCategorizationRule,
  subject: MatchSubject,
): boolean {
  const { tx } = subject
  if (rule.accountId !== null && rule.accountId !== tx.accountId) return false
  if (rule.minAmountCents !== null && tx.amountCents < rule.minAmountCents) {
    return false
  }
  if (rule.maxAmountCents !== null && tx.amountCents > rule.maxAmountCents) {
    return false
  }
  return matchesLabel(rule, subject)
}

/** True when every non-null condition of `rule` holds for `tx`. */
export function ruleMatches(
  rule: SelectCategorizationRule,
  tx: CategorizableTransaction,
): boolean {
  return matchesSubject(rule, new MatchSubject(tx))
}

/** Ascending `position`, ties broken by id so the order is always the same. */
export function compareRules(
  a: Pick<SelectCategorizationRule, 'position' | 'id'>,
  b: Pick<SelectCategorizationRule, 'position' | 'id'>,
): number {
  if (a.position !== b.position) return a.position - b.position
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Sorted copies of the rule lists passed in, so a batch sorts only once. */
const sortedRules = new WeakMap<
  readonly SelectCategorizationRule[],
  SelectCategorizationRule[]
>()

function ordered(
  rules: readonly SelectCategorizationRule[],
): SelectCategorizationRule[] {
  let sorted = sortedRules.get(rules)
  if (!sorted) {
    sorted = [...rules].sort(compareRules)
    sortedRules.set(rules, sorted)
  }
  return sorted
}

/**
 * Applies the ordered rules to one transaction: the first enabled rule (lowest
 * `position`) whose every non-null condition matches wins.
 *
 * - `contains`: case-, accent- and punctuation-insensitive substring of the raw
 *   label or of the merchant.
 * - `regex`: case-insensitive, tested against the raw label and the merchant.
 * - amount range: inclusive bounds on the signed amount.
 *
 * The kind comes from the rule when it overrides it (e.g. an internal transfer
 * filed under a savings category), else from the category, so a transfer rule
 * never yields income or expense. Returns `null` when no rule matches: the
 * caller then flags the transaction for review with `defaultKind`.
 *
 * Pass the same `rules` array for a whole batch: it is sorted once.
 */
export function categorize(
  tx: CategorizableTransaction,
  rules: readonly SelectCategorizationRule[],
  categoriesById: ReadonlyMap<string, SelectCategory>,
): CategorizationResult | null {
  const subject = new MatchSubject(tx)
  for (const rule of ordered(rules)) {
    if (!rule.enabled) continue
    const category = categoriesById.get(rule.categoryId)
    // Rules cascade with their category; a stale snapshot just skips the rule.
    if (!category) continue
    if (!matchesSubject(rule, subject)) continue
    return {
      categoryId: category.id,
      kind: rule.kind ?? category.kind,
      ruleId: rule.id,
      merchant: rule.merchant ?? tx.merchant,
    }
  }
  return null
}
