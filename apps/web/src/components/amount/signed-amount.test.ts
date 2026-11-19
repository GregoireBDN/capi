import { describe, expect, it } from 'vitest'
import { readAmountInput, signedCents, splitSignedCents } from './signed-amount'

describe('readAmountInput', () => {
  it('keeps an unsigned amount as typed', () => {
    expect(readAmountInput('12,5')).toEqual({ amount: '12,5', sign: null })
    expect(readAmountInput('1 234.56 €')).toEqual({
      amount: '1234,56',
      sign: null,
    })
    expect(readAmountInput('')).toEqual({ amount: '', sign: null })
  })

  it('turns a typed or pasted sign into the sign, never into the text', () => {
    expect(readAmountInput('-12,50')).toEqual({ amount: '12,50', sign: 'out' })
    expect(readAmountInput('−7')).toEqual({ amount: '7', sign: 'out' })
    expect(readAmountInput('–7')).toEqual({ amount: '7', sign: 'out' })
    expect(readAmountInput('+300')).toEqual({ amount: '300', sign: 'in' })
    expect(readAmountInput('-')).toEqual({ amount: '', sign: 'out' })
  })

  it('reads a leading comma as 0,', () => {
    expect(readAmountInput(',5')).toEqual({ amount: '0,5', sign: null })
  })

  it('refuses what is not an amount, or is over the limit', () => {
    expect(readAmountInput('abc')).toBeNull()
    expect(readAmountInput('12,345')).toBeNull()
    expect(readAmountInput('1,2,3')).toBeNull()
    expect(readAmountInput('--5')).toBeNull()
    expect(readAmountInput('1000000,01')).toBeNull()
    expect(readAmountInput('1000000')).toEqual({
      amount: '1000000',
      sign: null,
    })
    expect(readAmountInput('5000000', 1_000_000_000)).toEqual({
      amount: '5000000',
      sign: null,
    })
  })
})

describe('signedCents', () => {
  it('applies the sign to exact cents', () => {
    expect(signedCents('12,5', 'out')).toBe(-1_250)
    expect(signedCents('0,01', 'out')).toBe(-1)
    expect(signedCents('12,5', 'in')).toBe(1_250)
    expect(signedCents('0', 'out')).toBe(0)
    expect(Object.is(signedCents('0', 'out'), -0)).toBe(false)
    expect(signedCents('', 'in')).toBeNull()
    expect(signedCents('abc', 'out')).toBeNull()
  })
})

describe('splitSignedCents', () => {
  it('shows signed cents unsigned, with their sign, and round-trips', () => {
    expect(splitSignedCents(-4_550)).toEqual({ amount: '45,50', sign: 'out' })
    expect(splitSignedCents(123_456)).toEqual({ amount: '1234,56', sign: 'in' })
    expect(splitSignedCents(0)).toEqual({ amount: '0', sign: 'in' })
    for (const cents of [-4_550, -1, 1, 99, 123_456]) {
      const { amount, sign } = splitSignedCents(cents)
      expect(signedCents(amount, sign)).toBe(cents)
    }
  })
})
