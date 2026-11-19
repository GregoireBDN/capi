import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseThreshold,
  readStoredThreshold,
  storeThreshold,
  THRESHOLD_STORAGE_KEY,
  thresholdToInput,
} from './threshold'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('parseThreshold', () => {
  it('reads the unsigned amount into cents with its sign', () => {
    expect(parseThreshold('150', 'in')).toBe(15_000)
    expect(parseThreshold('1 000,5 €', 'in')).toBe(100_050)
    expect(parseThreshold('200,50', 'out')).toBe(-20_050)
    expect(parseThreshold('0', 'out')).toBe(0)
    expect(parseThreshold('abc', 'in')).toBeNull()
    expect(parseThreshold('1,234', 'in')).toBeNull()
    expect(parseThreshold('', 'out')).toBeNull()
    expect(parseThreshold('1000000001', 'out')).toBeNull()
  })

  it('prints cents back unsigned, with their sign', () => {
    expect(thresholdToInput(-20_050)).toEqual({ amount: '200,50', sign: 'out' })
    expect(thresholdToInput(15_000)).toEqual({ amount: '150', sign: 'in' })
  })
})

describe('stored threshold', () => {
  it('defaults to 0 € and round-trips through localStorage', () => {
    expect(readStoredThreshold()).toBe(0)
    storeThreshold(-15_000)
    expect(window.localStorage.getItem(THRESHOLD_STORAGE_KEY)).toBe('-15000')
    expect(readStoredThreshold()).toBe(-15_000)
    window.localStorage.setItem(THRESHOLD_STORAGE_KEY, 'not a number')
    expect(readStoredThreshold()).toBe(0)
  })

  it('survives an unavailable storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => storeThreshold(5_000)).not.toThrow()
    expect(readStoredThreshold()).toBe(0)
  })
})
