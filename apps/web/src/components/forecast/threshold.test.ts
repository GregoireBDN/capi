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
  it('reads French euro amounts into signed cents', () => {
    expect(parseThreshold('150')).toBe(15_000)
    expect(parseThreshold(' 1 000,5 € ')).toBe(100_050)
    expect(parseThreshold('-200,50')).toBe(-20_050)
    expect(parseThreshold('−75')).toBe(-7_500)
    expect(parseThreshold('-0')).toBe(0)
    expect(parseThreshold('abc')).toBeNull()
    expect(parseThreshold('1,234')).toBeNull()
    expect(parseThreshold('')).toBeNull()
  })

  it('prints cents back as an editable amount', () => {
    expect(thresholdToInput(-20_050)).toBe('-200,50')
    expect(thresholdToInput(15_000)).toBe('150')
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
