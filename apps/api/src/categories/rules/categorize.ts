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
  /**
   * The rule's destination account, on a transfer only (never the
   * transaction's own account), for a transaction that has none yet.
   */
  counterpartAccountId: string | null
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

/** The fields of a rule its place in the evaluation order depends on. */
export type RuleOrderFields = Pick<
  SelectCategorizationRule,
  | 'id'
  | 'priority'
  | 'position'
  | 'matchType'
  | 'labelPattern'
  | 'accountId'
  | 'minAmountCents'
  | 'maxAmountCents'
>

/**
 * Length of the text a rule's pattern looks for: the folded pattern of a
 * `contains` rule (so `Uber  Eats` and `UBER EATS` weigh the same), the raw
 * pattern of a regex.
 */
function patternLength(rule: RuleOrderFields): number {
  return rule.matchType === 'regex'
    ? rule.labelPattern.length
    : foldPattern(rule.labelPattern).length
}

/** Account and amount conditions set on a rule, 0 to 3. */
function conditionCount(rule: RuleOrderFields): number {
  return (
    (rule.accountId === null ? 0 : 1) +
    (rule.minAmountCents === null ? 0 : 1) +
    (rule.maxAmountCents === null ? 0 : 1)
  )
}

/**
 * The evaluation order (#299), computed: the owner never has to place a rule.
 *
 * 1. Higher `priority` first: 0 by default, raised by « faire gagner cette
 *    règle » or by hand under « Avancé », the explicit order for rare cases.
 * 2. Most specific first: a regex before a `contains` pattern, then the
 *    longer pattern (`UBER EATS` before `UBER`), then the rule with more
 *    account / amount conditions.
 * 3. Older first (`position`, the creation order), then id, so the order is
 *    always the same.
 */
export function compareRules(a: RuleOrderFields, b: RuleOrderFields): number {
  if (a.priority !== b.priority) return b.priority - a.priority
  const regexA = a.matchType === 'regex' ? 1 : 0
  const regexB = b.matchType === 'regex' ? 1 : 0
  if (regexA !== regexB) return regexB - regexA
  const lengthA = patternLength(a)
  const lengthB = patternLength(b)
  if (lengthA !== lengthB) return lengthB - lengthA
  const conditionsA = conditionCount(a)
  const conditionsB = conditionCount(b)
  if (conditionsA !== conditionsB) return conditionsB - conditionsA
  if (a.position !== b.position) return a.position - b.position
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * The priorities that make `ordered` the evaluation order (#299, drag and
 * drop): from the last rule up, each keeps the priority of the rule below it
 * when the computed order already puts it first, else one more. So every
 * rule left in its computed place stays at 0, and moving one rule above the
 * others raises only that one (and those it must stay above).
 */
export function prioritiesForOrder(
  ordered: readonly RuleOrderFields[],
): Map<string, number> {
  const priorities = new Map<string, number>()
  let level = 0
  let below: RuleOrderFields | null = null
  for (let i = ordered.length - 1; i >= 0; i--) {
    const rule = ordered[i]
    if (
      below !== null &&
      compareRules(
        { ...rule, priority: level },
        { ...below, priority: level },
      ) > 0
    ) {
      level++
    }
    priorities.set(rule.id, level)
    below = rule
  }
  return priorities
}

/** `rules` sorted in evaluation order (a copy). */
export function sortRules<T extends RuleOrderFields>(rules: readonly T[]): T[] {
  return [...rules].sort(compareRules)
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
    sorted = sortRules(rules)
    sortedRules.set(rules, sorted)
  }
  return sorted
}

/**
 * Applies the rules to one transaction in evaluation order (`compareRules`):
 * the first enabled rule whose every non-null condition matches wins.
 *
 * - `contains`: case-, accent- and punctuation-insensitive substring of the raw
 *   label or of the merchant.
 * - `regex`: case-insensitive, tested against the raw label and the merchant.
 * - amount range: inclusive bounds on the signed amount.
 *
 * The kind is the category's (#368): a rule filing transfers files them in a
 * transfer category, so it never yields income or expense. Returns `null`
 * when no rule matches: the caller then flags the transaction for review
 * with `defaultKind`.
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
    const kind = category.kind
    return {
      categoryId: category.id,
      kind,
      ruleId: rule.id,
      merchant: rule.merchant ?? tx.merchant,
      counterpartAccountId:
        kind === 'transfer' && rule.counterpartAccountId !== tx.accountId
          ? (rule.counterpartAccountId ?? null)
          : null,
    }
  }
  return null
}

/**
 * Every enabled rule (with a known category) whose conditions hold for `tx`,
 * in evaluation order: the first one is the rule `categorize` picks, the
 * others are the rules it overrides. Pass the same `rules` array for a batch.
 */
export function matchingRules(
  tx: CategorizableTransaction,
  rules: readonly SelectCategorizationRule[],
  categoriesById: ReadonlyMap<string, SelectCategory>,
): SelectCategorizationRule[] {
  const subject = new MatchSubject(tx)
  return ordered(rules).filter(
    (rule) =>
      rule.enabled &&
      categoriesById.has(rule.categoryId) &&
      matchesSubject(rule, subject),
  )
}

/** Category and kind a rule gives (the kind is its category's, #368). */
export function ruleOutcome(
  rule: Pick<SelectCategorizationRule, 'categoryId'>,
  categoriesById: ReadonlyMap<string, SelectCategory>,
): { categoryId: string; kind: TransactionKind } | null {
  const category = categoriesById.get(rule.categoryId)
  if (!category) return null
  return { categoryId: category.id, kind: category.kind }
}
