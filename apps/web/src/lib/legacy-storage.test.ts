import { afterEach, describe, expect, it } from 'vitest'
import { getMovedItem } from './legacy-storage'

describe('getMovedItem', () => {
  afterEach(() => localStorage.clear())

  it('moves a value saved under the old key once', () => {
    localStorage.setItem('finances.example', '42')
    expect(getMovedItem('capi.example', 'finances.example')).toBe('42')
    expect(localStorage.getItem('capi.example')).toBe('42')
    expect(localStorage.getItem('finances.example')).toBeNull()
  })

  it('prefers the new key and leaves the old one alone', () => {
    localStorage.setItem('capi.example', 'new')
    localStorage.setItem('finances.example', 'old')
    expect(getMovedItem('capi.example', 'finances.example')).toBe('new')
    expect(localStorage.getItem('finances.example')).toBe('old')
  })

  it('answers null when neither key is set', () => {
    expect(getMovedItem('capi.example', 'finances.example')).toBeNull()
  })
})
