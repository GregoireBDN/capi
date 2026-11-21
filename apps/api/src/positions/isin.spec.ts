import { describe, expect, it } from 'vitest'
import { isinCheckDigit, isValidIsin, normalizeIsin } from './isin'

describe('ISIN', () => {
  it('accepts synthetic ISINs with their check digit', () => {
    for (const isin of ['ZZ00MSCIWD03', 'ZZ00EMMKT008', 'ZZ00STOXX608']) {
      expect(isValidIsin(isin)).toBe(true)
    }
  })

  it('computes the published check digit of a well-known ISIN', () => {
    // The ISO 6166 example: Apple's ISIN, a public identifier.
    expect(isinCheckDigit('US037833100')).toBe(5)
  })

  it('refuses a wrong check digit, a bad length or lower case', () => {
    expect(isValidIsin('ZZ00MSCIWD04')).toBe(false)
    expect(isValidIsin('ZZ00MSCIWD0')).toBe(false)
    expect(isValidIsin('zz00msciwd03')).toBe(false)
    expect(isValidIsin('1Z00MSCIWD03')).toBe(false)
    expect(isValidIsin('ZZ00MSCIWD0X')).toBe(false)
  })

  it('normalizes spaces, dashes and case', () => {
    expect(normalizeIsin(' zz00 msci-wd03 ')).toBe('ZZ00MSCIWD03')
  })
})
