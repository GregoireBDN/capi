import { parseAmountToCents } from '#/components/accounts/amount'
import { parsePriceInput, parseQuantityInput } from './format'

/*
 * Steps and checks of `HoldingEditor` (#323): one decision per screen, the
 * owner's stepped entry. A new line starts with its asset; a line being
 * edited keeps its asset and opens at its quantity.
 */

export type HoldingStep = 'asset' | 'amount' | 'details'

export const HOLDING_STEP_NAMES: Record<HoldingStep, string> = {
  asset: 'Actif',
  amount: 'Quantité',
  details: 'Détails',
}

export function holdingSteps(editing: boolean): readonly HoldingStep[] {
  return editing ? ['amount', 'details'] : ['asset', 'amount', 'details']
}

export interface HoldingFormValues {
  hasAsset: boolean
  quantity: string
  invested: string
  price: string
  /** The manual price field is shown (no price API, or no price for it). */
  showPrice: boolean
}

export interface HoldingFormErrors {
  asset?: string
  quantity?: string
  invested?: string
  price?: string
}

/** Where each error is fixed. */
const STEP_OF: Record<keyof HoldingFormErrors, HoldingStep> = {
  asset: 'asset',
  quantity: 'amount',
  invested: 'amount',
  price: 'details',
}

export function holdingFormErrors(
  values: HoldingFormValues,
): HoldingFormErrors {
  const errors: HoldingFormErrors = {}
  const { quantity, invested, price } = values
  if (!values.hasAsset) errors.asset = 'Choisissez un actif'
  if (quantity.trim() === '') errors.quantity = 'Indiquez la quantité'
  else if (parseQuantityInput(quantity) === null)
    errors.quantity = 'Quantité invalide (ex. 0,125, jusqu’à 18 décimales)'
  if (invested.trim() !== '') {
    const cents = parseAmountToCents(invested)
    if (cents === null || cents < 0)
      errors.invested = 'Montant invalide (ex. 1 500)'
  }
  if (
    values.showPrice &&
    price.trim() !== '' &&
    parsePriceInput(price) === null
  )
    errors.price = 'Cours invalide (ex. 0,00123)'
  return errors
}

/** The errors a step has to clear before « Suivant ». */
export function stepErrors(
  errors: HoldingFormErrors,
  step: HoldingStep,
): HoldingFormErrors {
  return Object.fromEntries(
    Object.entries(errors).filter(
      ([field]) => STEP_OF[field as keyof HoldingFormErrors] === step,
    ),
  )
}

/** The first step, in order, that still has an error; null when none. */
export function firstStepWithError(
  errors: HoldingFormErrors,
  steps: readonly HoldingStep[],
): HoldingStep | null {
  return (
    steps.find((step) => Object.keys(stepErrors(errors, step)).length > 0) ??
    null
  )
}
