import { describe, expect, it } from 'vitest'
import type { AmountKey } from './amount-entry'
import { amountKeyOf, pressAmountKey, typedAmount } from './amount-entry'

const press = (keys: readonly AmountKey[], start = '') =>
  keys.reduce(pressAmountKey, start)

describe('pressAmountKey', () => {
  it('types an amount key by key', () => {
    expect(press(['1', '2', ',', '5', '0'])).toBe('12,50')
  })

  it('starts a decimal amount with 0 and keeps one comma', () => {
    expect(press([',', '5', ','])).toBe('0,5')
  })

  it('replaces a leading zero and refuses a third decimal', () => {
    expect(press(['0', '7'])).toBe('7')
    expect(press(['1', ',', '2', '3', '4'])).toBe('1,23')
  })

  it('erases the last key', () => {
    expect(press(['back'], '12,5')).toBe('12,')
    expect(press(['back'], '')).toBe('')
  })

  it('stops at the highest amount the API takes (1 000 000 €)', () => {
    expect(press(['0'], '100000')).toBe('1000000')
    expect(press(['1'], '1000000')).toBe('1000000')
    expect(press(['0', '1'], '1000000,')).toBe('1000000,0')
  })
})

describe('amountKeyOf', () => {
  it('maps the keys of a physical keyboard', () => {
    expect(amountKeyOf('7')).toBe('7')
    expect(amountKeyOf('.')).toBe(',')
    expect(amountKeyOf(',')).toBe(',')
    expect(amountKeyOf('Backspace')).toBe('back')
    expect(amountKeyOf('a')).toBeNull()
    expect(amountKeyOf('Enter')).toBeNull()
  })
})

describe('typedAmount', () => {
  it('accepts what the keypad could type, with a dot or spaces', () => {
    expect(typedAmount('12.5')).toBe('12,5')
    expect(typedAmount('1 234,56 €')).toBe('1234,56')
    expect(typedAmount('')).toBe('')
  })

  it('refuses anything else', () => {
    expect(typedAmount('12,345')).toBeNull()
    expect(typedAmount('-3')).toBeNull()
    expect(typedAmount('1,2,3')).toBeNull()
    expect(typedAmount('abc')).toBeNull()
    expect(typedAmount('1000000,01')).toBeNull()
  })
})
