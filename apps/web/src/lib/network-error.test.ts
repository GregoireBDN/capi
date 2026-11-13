import { afterEach, describe, expect, it, vi } from 'vitest'
import { isNetworkError, isOffline } from './network-error'

function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isNetworkError', () => {
  it.each([
    ['Safari', 'Load failed'],
    ['Chromium', 'Failed to fetch'],
    ['Firefox', 'NetworkError when attempting to fetch resource.'],
  ])('recognises the %s fetch failure', (_browser, message) => {
    setOnline(true)
    expect(isNetworkError(new TypeError(message))).toBe(true)
  })

  it('does not take a bug in the page for a network error', () => {
    setOnline(true)
    expect(isNetworkError(new TypeError('x is not a function'))).toBe(false)
    expect(isNetworkError(new Error('Load failed'))).toBe(false)
    expect(isNetworkError({ statusCode: 500 })).toBe(false)
  })

  it('treats any error as a network error while the browser is offline', () => {
    setOnline(false)
    expect(isOffline()).toBe(true)
    expect(isNetworkError(new Error('anything'))).toBe(true)
  })
})
