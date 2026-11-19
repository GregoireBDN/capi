import type {
  CategorizationRuleDto,
  CategorizationRuleMatchesQueryDto,
  CreateCategorizationRuleDto,
  RuleMatchType,
  TransactionKind,
} from '#/api/types.gen'
import { centsToInput, parseAmountToCents } from '#/components/accounts/amount'

/** The form as typed: amounts stay text until they are checked. */
export interface RuleForm {
  labelPattern: string
  matchType: RuleMatchType
  /** '' = every account. */
  accountId: string
  minAmount: string
  maxAmount: string
  categoryId: string
  /** '' = the category's kind. */
  kind: TransactionKind | ''
  merchant: string
  enabled: boolean
  /** Destination of the transfers it files (#296); '' = none. */
  counterpartAccountId: string
  /** Explicit precedence (#299): higher first, 0 by default. */
  priority: number
}

export type FormErrors = Partial<
  Record<'labelPattern' | 'amount' | 'categoryId', string>
>

export function formFromRule(rule: CategorizationRuleDto | null): RuleForm {
  return {
    labelPattern: rule?.labelPattern ?? '',
    matchType: rule?.matchType ?? 'contains',
    accountId: rule?.accountId ?? '',
    minAmount:
      rule?.minAmountCents == null ? '' : centsToInput(rule.minAmountCents),
    maxAmount:
      rule?.maxAmountCents == null ? '' : centsToInput(rule.maxAmountCents),
    categoryId: rule?.categoryId ?? '',
    kind: rule?.kind ?? '',
    merchant: rule?.merchant ?? '',
    enabled: rule?.enabled ?? true,
    counterpartAccountId: rule?.counterpartAccountId ?? '',
    priority: rule?.priority ?? 0,
  }
}

/** The body that re-creates or restores `rule` (undo). */
export function bodyFromRule(
  rule: CategorizationRuleDto,
): Required<CreateCategorizationRuleDto> {
  return {
    enabled: rule.enabled,
    priority: rule.priority,
    matchType: rule.matchType,
    labelPattern: rule.labelPattern,
    accountId: rule.accountId,
    minAmountCents: rule.minAmountCents,
    maxAmountCents: rule.maxAmountCents,
    categoryId: rule.categoryId,
    kind: rule.kind,
    merchant: rule.merchant,
    counterpartAccountId: rule.counterpartAccountId,
  }
}

type Amounts =
  | { minAmountCents: number | null; maxAmountCents: number | null }
  | { error: string }

/** Amounts read straight into cents; an empty amount means no bound. */
function readAmounts(form: Pick<RuleForm, 'minAmount' | 'maxAmount'>): Amounts {
  const amount = (text: string) =>
    text.trim() === '' ? null : parseAmountToCents(text)
  const minAmountCents = amount(form.minAmount)
  const maxAmountCents = amount(form.maxAmount)
  if (
    (form.minAmount.trim() !== '' && minAmountCents === null) ||
    (form.maxAmount.trim() !== '' && maxAmountCents === null)
  ) {
    return { error: 'Saisissez un montant, par exemple -50 ou 12,90.' }
  }
  if (
    minAmountCents !== null &&
    maxAmountCents !== null &&
    minAmountCents > maxAmountCents
  ) {
    return { error: 'Le minimum dépasse le maximum.' }
  }
  return { minAmountCents, maxAmountCents }
}

/**
 * The conditions of the first step (what the rule catches), or the errors
 * to show.
 */
export function conditionsFromForm(
  form: RuleForm,
):
  | { conditions: Required<CategorizationRuleMatchesQueryDto> }
  | { errors: FormErrors } {
  const errors: FormErrors = {}
  const labelPattern = form.labelPattern.trim()
  if (labelPattern === '') errors.labelPattern = 'Saisissez un texte.'
  const amounts = readAmounts(form)
  if ('error' in amounts) errors.amount = amounts.error
  if ('error' in amounts || Object.keys(errors).length > 0) return { errors }
  return {
    conditions: {
      matchType: form.matchType,
      labelPattern,
      accountId: form.accountId || null,
      ...amounts,
    },
  }
}

/**
 * The request body for `form`, or the errors to show. Amounts are read
 * straight into cents; an empty amount means no bound.
 */
export function bodyFromForm(
  form: RuleForm,
  /** Kind of the chosen category: a destination only goes with transfers. */
  categoryKind?: TransactionKind,
): { body: Required<CreateCategorizationRuleDto> } | { errors: FormErrors } {
  const result = conditionsFromForm(form)
  const errors: FormErrors = 'errors' in result ? { ...result.errors } : {}
  if (form.categoryId === '') errors.categoryId = 'Choisissez une catégorie.'
  if ('errors' in result || Object.keys(errors).length > 0) return { errors }
  return {
    body: {
      enabled: form.enabled,
      priority: form.priority,
      ...result.conditions,
      categoryId: form.categoryId,
      kind: form.kind || null,
      merchant: form.merchant.trim() || null,
      counterpartAccountId:
        (form.kind || categoryKind) === 'transfer' &&
        form.counterpartAccountId !== form.accountId
          ? form.counterpartAccountId || null
          : null,
    },
  }
}
