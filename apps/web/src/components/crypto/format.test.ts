import { describe, expect, it } from 'vitest'
import {
  decimalToInput,
  formatPrice,
  formatPriceAge,
  formatQuantity,
  parsePriceInput,
  parseQuantityInput,
  sumQuantities,
} from './format'

/** `Intl` emits narrow no-break spaces. */
const plain = (value: string) => value.replace(/\s/g, ' ')

describe('crypto formats', () => {
  it('formats quantities in French with up to 8 decimals, exactly', () => {
    expect(plain(formatQuantity('1234.5'))).toBe('1 234,5')
    expect(formatQuantity('0.123456785')).toBe('0,12345679')
    expect(plain(formatQuantity('12345678901234567890.1'))).toBe(
      '12 345 678 901 234 567 890,1',
    )
    expect(formatQuantity('0.000000001')).toBe('0')
  })

  it('formats prices with sub-cent precision', () => {
    expect(plain(formatPrice('61234.567'))).toBe('61 234,57 €')
    expect(plain(formatPrice('0.0001234567'))).toBe('0,0001235 €')
    expect(plain(formatPrice('0.5'))).toBe('0,5 €')
  })

  it('parses French or dotted quantities', () => {
    expect(parseQuantityInput('0,5')).toBe('0.5')
    expect(parseQuantityInput(' 1 234,500 ')).toBe('1234.5')
    expect(parseQuantityInput('1234.123456789012345678')).toBe(
      '1234.123456789012345678',
    )
    expect(parseQuantityInput('007')).toBe('7')
    expect(parseQuantityInput('1,')).toBe('1')
    for (const bad of ['', '-1', 'abc', '1,2,3', '0.1234567890123456789']) {
      expect(parseQuantityInput(bad)).toBeNull()
    }
    expect(parsePriceInput('0,000000000001')).toBe('0.000000000001')
    expect(parsePriceInput('0,0000000000001')).toBeNull()
    expect(decimalToInput('0.5')).toBe('0,5')
  })

  it('tells the age of a price', () => {
    const now = new Date('2026-11-06T10:00:00Z')
    expect(formatPriceAge('2026-11-06T09:59:40Z', now)).toBe('à l’instant')
    expect(formatPriceAge('2026-11-06T09:57:00Z', now)).toBe('il y a 3 min')
    expect(formatPriceAge('2026-11-06T07:00:00Z', now)).toBe('il y a 3 h')
    expect(formatPriceAge('2026-11-04T09:00:00Z', now)).toBe('il y a 2 j')
  })

  it('sums quantities exactly, without a float', () => {
    expect(sumQuantities(['0.9', '0.15'])).toBe('1.05')
    expect(sumQuantities(['0.1', '0.2'])).toBe('0.3')
    expect(sumQuantities(['15000'])).toBe('15000')
    expect(sumQuantities(['0.000000000000000001', '1'])).toBe(
      '1.000000000000000001',
    )
    expect(sumQuantities(['0.5', '0.5'])).toBe('1')
    expect(sumQuantities([])).toBe('0')
  })
})
