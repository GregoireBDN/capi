import { describe, expect, it } from 'vitest'
import {
  formatQuantity,
  parseMoneyCents,
  parseQuantity,
  quantityToCents,
} from './quantity'

const q = (text: string) => {
  const units = parseQuantity(text)
  return units === null ? null : formatQuantity(units)
}

describe('parseQuantity', () => {
  it('reads signed decimals exactly', () => {
    expect(q('0.00400000')).toBe('0.004')
    expect(q('-0.00000400')).toBe('-0.000004')
    expect(q('+12')).toBe('12')
    expect(q(' 1,234.5 ')).toBe('1234.5')
    expect(q('0.000000000000000001')).toBe('0.000000000000000001')
    expect(q('-0')).toBe('0')
  })

  it('reads scientific notation without floats', () => {
    expect(q('1E-8')).toBe('0.00000001')
    expect(q('-2.5e-7')).toBe('-0.00000025')
    expect(q('1.2E3')).toBe('1200')
  })

  it('refuses what does not fit numeric(38, 18)', () => {
    expect(q('0.0000000000000000001')).toBeNull()
    expect(q('123456789012345678901')).toBeNull()
    expect(q('1e-30')).toBeNull()
  })

  it('refuses text', () => {
    for (const text of ['', '-', 'abc', '1.2.3', '0x10', 'NaN', '€1']) {
      expect(q(text)).toBeNull()
    }
  })
})

describe('money', () => {
  it('parses euro cells into cents, rounding half to even', () => {
    expect(parseMoneyCents('€1234.56')).toBe(123456)
    expect(parseMoneyCents('€50.99000000000001')).toBe(5099)
    expect(parseMoneyCents('-€12.3')).toBe(-1230)
    expect(parseMoneyCents('€-12.30')).toBe(-1230)
    expect(parseMoneyCents('1,234.565 €')).toBe(123456)
    expect(parseMoneyCents('€0.125')).toBe(12)
    expect(parseMoneyCents('€0.135')).toBe(14)
    expect(parseMoneyCents('')).toBeNull()
    expect(parseMoneyCents('$12')).toBeNull()
  })

  it('turns EUR quantities into cents', () => {
    expect(quantityToCents(parseQuantity('-200.005')!)).toBe(-20000)
    expect(quantityToCents(parseQuantity('0.015')!)).toBe(2)
  })
})
