import { describe, expect, it } from 'vitest'
import {
  firstStepWithError,
  holdingFormErrors,
  holdingSteps,
  stepErrors,
} from './holding-form'

const VALID = {
  hasAsset: true,
  quantity: '0,125',
  invested: '',
  price: '',
  showPrice: false,
}

describe('holding form steps', () => {
  it('starts a new line with its asset, an edited one at its quantity', () => {
    expect(holdingSteps(false)).toEqual(['asset', 'amount', 'details'])
    expect(holdingSteps(true)).toEqual(['amount', 'details'])
  })

  it('accepts exact decimal text and an empty invested amount', () => {
    expect(holdingFormErrors(VALID)).toEqual({})
    expect(
      holdingFormErrors({
        ...VALID,
        quantity: '1 234,123456789012345678',
        invested: '2 000,50',
      }),
    ).toEqual({})
  })

  it('files each error under the step that fixes it', () => {
    const errors = holdingFormErrors({
      hasAsset: false,
      quantity: '1,2,3',
      invested: '-5',
      price: 'abc',
      showPrice: true,
    })
    expect(stepErrors(errors, 'asset')).toEqual({
      asset: 'Choisissez un actif',
    })
    expect(Object.keys(stepErrors(errors, 'amount'))).toEqual([
      'quantity',
      'invested',
    ])
    expect(Object.keys(stepErrors(errors, 'details'))).toEqual(['price'])
  })

  it('asks for a quantity and ignores the price field when hidden', () => {
    expect(holdingFormErrors({ ...VALID, quantity: ' ' })).toEqual({
      quantity: 'Indiquez la quantité',
    })
    expect(holdingFormErrors({ ...VALID, price: 'abc' })).toEqual({})
  })

  it('goes back to the first step, in order, still to fix', () => {
    const steps = holdingSteps(false)
    expect(firstStepWithError({}, steps)).toBeNull()
    expect(firstStepWithError({ price: 'x', quantity: 'y' }, steps)).toBe(
      'amount',
    )
    expect(firstStepWithError({ asset: 'x' }, holdingSteps(true))).toBeNull()
  })
})
