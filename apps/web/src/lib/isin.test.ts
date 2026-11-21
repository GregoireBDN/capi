import { describe, expect, it } from 'vitest'
import { isValidIsin, normalizeIsin } from './isin'

describe('ISIN', () => {
  it('checks the format and the check digit, like the API', () => {
    expect(isValidIsin('ZZ00MSCIWD03')).toBe(true)
    expect(isValidIsin('ZZ00MSCIWD04')).toBe(false)
    expect(isValidIsin('ZZ00MSCIWD0')).toBe(false)
    expect(isValidIsin(normalizeIsin(' zz00 msci-wd03'))).toBe(true)
  })
})
