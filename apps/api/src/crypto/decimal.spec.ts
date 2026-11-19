import { describe, expect, it } from 'vitest'
import {
  decimalFromJsonNumber,
  divideHalfEven,
  fitsNumeric,
  JSON_NUMBER_MARK,
  normalizeDecimal,
  parseDecimal,
  quoteJsonNumbers,
  rescale,
  signedDecimalFromJsonNumber,
  valueInCents,
} from './decimal'

describe('decimal helper', () => {
  it('parses and normalizes plain decimals only', () => {
    expect(parseDecimal('12.50')).toEqual({ digits: 1250n, scale: 2 })
    expect(normalizeDecimal('001.500')).toBe('1.5')
    expect(normalizeDecimal('0.000000000000000001')).toBe(
      '0.000000000000000001',
    )
    expect(normalizeDecimal('42')).toBe('42')
    expect(normalizeDecimal('0.000')).toBe('0')
    for (const bad of ['', '-1', '1,5', '1.', '.5', '1e3', ' 1', 'NaN']) {
      expect(parseDecimal(bad)).toBeNull()
    }
  })

  it('rounds half to even', () => {
    expect(divideHalfEven(5n, 2n)).toBe(2n) // 2.5 → 2
    expect(divideHalfEven(7n, 2n)).toBe(4n) // 3.5 → 4
    expect(divideHalfEven(251n, 100n)).toBe(3n)
    expect(divideHalfEven(249n, 100n)).toBe(2n)
    expect(rescale({ digits: 125n, scale: 3 }, 2)).toEqual({
      digits: 12n,
      scale: 2,
    })
    expect(rescale({ digits: 135n, scale: 3 }, 2)).toEqual({
      digits: 14n,
      scale: 2,
    })
    expect(rescale({ digits: 5n, scale: 0 }, 2)).toEqual({
      digits: 500n,
      scale: 2,
    })
  })

  it('checks numeric precision', () => {
    expect(fitsNumeric('12345678901234567890.123456789012345678', 20, 18)).toBe(
      true,
    )
    expect(fitsNumeric('123456789012345678901', 20, 18)).toBe(false)
    expect(fitsNumeric('1.1234567890123456789', 20, 18)).toBe(false)
    expect(fitsNumeric('000001', 1, 0)).toBe(true)
  })

  it('values quantity × price exactly in cents', () => {
    // 0.1 × 0.2 would be 0.020000000000000004 in floats.
    expect(valueInCents('0.1', '0.2')).toBe(2n)
    expect(valueInCents('0.5', '61234.57')).toBe(3061728n) // 3 061 728,5 cents → even
    expect(valueInCents('0.5', '61234.59')).toBe(3061730n) // 3 061 729,5 cents → even (up)
    expect(valueInCents('1.005', '1')).toBe(100n) // 100.5 cents → 100
    expect(valueInCents('1.015', '1')).toBe(102n) // 101.5 cents → 102
    // Huge quantity of a sub-cent asset.
    expect(
      valueInCents('123456789012.123456789012345678', '0.000012345678'),
    ).toBe(152415776n)
    // Large values stay exact far beyond 2^53.
    expect(valueInCents('99999999999999999999', '99999.999999999999')).toBe(
      999999999999999989990000000n,
    )
    expect(valueInCents('0', '61234.5')).toBe(0n)
    expect(valueInCents('0.000000000000000001', '0.000000000001')).toBe(0n)
  })

  it('reads JSON number literals without floats', () => {
    expect(decimalFromJsonNumber('61234.5')).toBe('61234.5')
    expect(decimalFromJsonNumber('1.23e-7')).toBe('0.000000123')
    expect(decimalFromJsonNumber('4E3')).toBe('4000')
    expect(decimalFromJsonNumber('2.5e+1')).toBe('25')
    expect(decimalFromJsonNumber('0')).toBe('0')
    expect(decimalFromJsonNumber('-1')).toBeNull()
    expect(decimalFromJsonNumber('1e999')).toBeNull()
    expect(decimalFromJsonNumber('abc')).toBeNull()
  })

  it('quotes JSON numbers but not strings', () => {
    const json = '{"a":{"eur":1.5e-8},"b\\"9":"x:12","c":[1,-2.5],"d":true}'
    const n = (literal: string) => `${JSON_NUMBER_MARK}${literal}`
    expect(JSON.parse(quoteJsonNumbers(json))).toEqual({
      a: { eur: n('1.5e-8') },
      'b"9': 'x:12',
      c: [n('1'), n('-2.5')],
      d: true,
    })
  })

  it('reads signed JSON numbers exactly (#295)', () => {
    expect(signedDecimalFromJsonNumber('-1.2345678901')).toBe('-1.2345678901')
    expect(signedDecimalFromJsonNumber('3.4e-2')).toBe('0.034')
    expect(signedDecimalFromJsonNumber('-0')).toBe('0')
    expect(signedDecimalFromJsonNumber('--1')).toBeNull()
    expect(signedDecimalFromJsonNumber('abc')).toBeNull()
  })
})
