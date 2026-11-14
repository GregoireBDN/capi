import type {
  AccountDto,
  CategorizationRuleDto,
  CategoryDto,
} from '#/api/types.gen'
import { formatCents } from '#/lib/money'

/** How a rule's pattern is matched, as a short phrase. */
export const MATCH_TYPE_LABELS: Record<
  CategorizationRuleDto['matchType'],
  string
> = {
  contains: 'contient',
  regex: 'expression régulière',
}

/** Amount condition in words, or null when the rule has none. */
export function describeAmount(
  rule: Pick<CategorizationRuleDto, 'minAmountCents' | 'maxAmountCents'>,
): string | null {
  const { minAmountCents: min, maxAmountCents: max } = rule
  if (min !== null && max !== null) {
    return min === max
      ? `montant ${formatCents(min)}`
      : `entre ${formatCents(min)} et ${formatCents(max)}`
  }
  if (min !== null) return `à partir de ${formatCents(min)}`
  if (max !== null) return `jusqu’à ${formatCents(max)}`
  return null
}

/** Account condition in words, or null when the rule applies to every account. */
export function describeAccount(
  rule: Pick<CategorizationRuleDto, 'accountId'>,
  accounts: readonly AccountDto[],
): string | null {
  if (rule.accountId === null) return null
  const account = accounts.find((a) => a.id === rule.accountId)
  return account ? `compte ${account.name}` : 'un compte supprimé'
}

export type RuleCategoryProblem = 'archived' | 'deleted' | null

/**
 * Why a rule's target category needs attention: archived (the rule still
 * files transactions under it) or gone from the list.
 */
export function categoryProblem(
  rule: Pick<CategorizationRuleDto, 'categoryId'>,
  categories: readonly CategoryDto[],
): RuleCategoryProblem {
  const category = categories.find((c) => c.id === rule.categoryId)
  if (!category) return 'deleted'
  return category.archivedAt ? 'archived' : null
}
