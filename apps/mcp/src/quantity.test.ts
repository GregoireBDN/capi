import { describe, expect, it } from 'vitest'
import {
  canonicalQuantity,
  frenchQuantity,
  isZeroQuantity,
  parseQuantity,
} from './quantity.js'

describe('parseQuantity', () => {
  it.each([
    ['0.5', '0.5'],
    ['0,50', '0.5'],
    ['1 234.5', '1234.5'],
    ['000.010', '0.01'],
    ['12', '12'],
    ['12.000', '12'],
    ['0', '0'],
    ['0.123456789012345678', '0.123456789012345678'],
    ['99999999999999999999.1', '99999999999999999999.1'],
  ])('%s → %s', (input, expected) => {
    expect(parseQuantity(input)).toBe(expected)
  })

  it.each([
    '-1',
    '+1',
    '1e-8',
    '0.1234567890123456789',
    '123456789012345678901',
    '1,234.5',
    '.5',
    '',
    'abc',
  ])('refuses %s', (input) => {
    expect(parseQuantity(input)).toBeNull()
  })

  it('never goes through a float', () => {
    // 0.1 + 0.2 style values and digits beyond double precision stay exact.
    expect(parseQuantity('12345678901234567890.123456789012345678')).toBe(
      '12345678901234567890.123456789012345678',
    )
  })
})

describe('canonical forms', () => {
  it('compares spellings of the same quantity', () => {
    expect(canonicalQuantity('0.500000000000000000')).toBe('0.5')
    expect(isZeroQuantity('0.000000000000000000')).toBe(true)
    expect(frenchQuantity('1234.50')).toBe('1234,5')
  })
})
