import type {
  CategorizationRuleDto,
  CategorizationRuleMatchesQueryDto,
  CreateCategorizationRuleDto,
  RuleMatchType,
  TransactionKind,
} from '#/api/types.gen'
import type { AmountSign } from '#/components/amount/signed-amount'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'

/** Bounds of a rule's amount condition, signed cents (null = none). */
interface AmountBounds {
  minAmountCents: number | null
  maxAmountCents: number | null
}

/** The form as typed: amounts stay text until they are checked. */
export interface RuleForm {
  labelPattern: string
  matchType: RuleMatchType
  /** '' = every account. */
  accountId: string
  /**
   * The amount condition, typed unsigned (#326): « de » `minAmount` « à »
   * `maxAmount` euros, out of or into the account (`amountSign`).
   */
  minAmount: string
  maxAmount: string
  amountSign: AmountSign
  /**
   * A saved condition the fields can't show (it spans both signs, or has
   * only a bound across 0), kept as it is until an amount is typed.
   */
  keptAmounts: AmountBounds | null
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

/** `-cents`, never `-0`. */
const negate = (cents: number) => (cents === 0 ? 0 : -cents)

/**
 * Signed bounds of an amount typed unsigned between `min` and `max` euros
 * (cents, null = not typed) with its sign. Money out from 20 to 50 € is
 * -50 € to -20 €; one magnitude typed alone stops at 0 on the other side, so
 * « sortie jusqu'à 50 € » never catches money in.
 */
export function boundsOf(
  min: number | null,
  max: number | null,
  sign: AmountSign,
): AmountBounds {
  if (min === null && max === null)
    return { minAmountCents: null, maxAmountCents: null }
  if (sign === 'in') return { minAmountCents: min ?? 0, maxAmountCents: max }
  return {
    minAmountCents: max === null ? null : negate(max),
    maxAmountCents: min === null ? 0 : negate(min),
  }
}

/**
 * The fields showing saved bounds, or null when they can't show them
 * exactly (a condition spanning both signs, or a lone bound across 0).
 */
export function amountFieldsOf(
  bounds: AmountBounds,
): Pick<RuleForm, 'minAmount' | 'maxAmount' | 'amountSign'> | null {
  const { minAmountCents: min, maxAmountCents: max } = bounds
  if (min === null && max === null)
    return { minAmount: '', maxAmount: '', amountSign: 'out' }
  const sign: AmountSign = (max !== null ? max <= 0 : min! < 0) ? 'out' : 'in'
  const low = sign === 'out' ? (max === null ? null : negate(max)) : min
  const high = sign === 'out' ? (min === null ? null : negate(min)) : max
  // A condition spanning both signs.
  if ((low !== null && low < 0) || (high !== null && high < 0)) return null
  const shown = {
    minAmount: low === null || low === 0 ? '' : centsToInput(low),
    maxAmount: high === null ? '' : centsToInput(high),
    amountSign: sign,
  }
  const back = boundsOf(
    shown.minAmount === '' ? null : low,
    shown.maxAmount === '' ? null : high,
    sign,
  )
  return back.minAmountCents === min && back.maxAmountCents === max
    ? shown
    : null
}

export function formFromRule(rule: CategorizationRuleDto | null): RuleForm {
  const bounds: AmountBounds = {
    minAmountCents: rule?.minAmountCents ?? null,
    maxAmountCents: rule?.maxAmountCents ?? null,
  }
  const fields = amountFieldsOf(bounds)
  return {
    labelPattern: rule?.labelPattern ?? '',
    matchType: rule?.matchType ?? 'contains',
    accountId: rule?.accountId ?? '',
    ...(fields ?? { minAmount: '', maxAmount: '', amountSign: 'out' }),
    keptAmounts: fields ? null : bounds,
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

type Amounts = AmountBounds | { error: string }

/**
 * Amounts read straight into cents, then signed (`boundsOf`); an empty
 * amount means no bound. A kept condition stays as it is.
 */
function readAmounts(
  form: Pick<
    RuleForm,
    'minAmount' | 'maxAmount' | 'amountSign' | 'keptAmounts'
  >,
): Amounts {
  if (form.keptAmounts) return form.keptAmounts
  const amount = (text: string) =>
    text.trim() === '' ? null : parseEurosToCents(text)
  const min = amount(form.minAmount)
  const max = amount(form.maxAmount)
  if (
    (form.minAmount.trim() !== '' && min === null) ||
    (form.maxAmount.trim() !== '' && max === null)
  ) {
    return { error: 'Saisissez un montant, par exemple 50 ou 12,90.' }
  }
  if (min !== null && max !== null && min > max) {
    return { error: 'Le minimum dépasse le maximum.' }
  }
  return boundsOf(min, max, form.amountSign)
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
