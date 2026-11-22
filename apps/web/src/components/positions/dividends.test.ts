import { describe, expect, it } from 'vitest'
import { dividendErrors } from './Dividends'

describe('dividendErrors (#414)', () => {
  const today = '2026-11-06'

  it('accepts a positive amount paid today or before', () => {
    expect(dividendErrors({ paidOn: today, amount: '12,34' }, today)).toEqual(
      {},
    )
  })

  it('refuses a future day, a missing date and a zero or invalid amount', () => {
    expect(
      dividendErrors({ paidOn: '2026-11-07', amount: '1' }, today),
    ).toEqual({ paidOn: 'La date ne peut pas être dans le futur' })
    expect(dividendErrors({ paidOn: '', amount: '0' }, today)).toEqual({
      paidOn: 'Indiquez une date',
      amount: 'Le montant doit être positif',
    })
    expect(dividendErrors({ paidOn: today, amount: 'abc' }, today)).toEqual({
      amount: 'Montant invalide (ex. 12,34)',
    })
  })
})
