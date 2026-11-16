import { describe, expect, it } from 'vitest'
import { describeDevice } from './device'

describe('describeDevice', () => {
  it.each([
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1',
      'Safari · iPhone',
    ],
    [
      // Installed PWA on iOS: no "Safari/" token.
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      'Safari · iPhone',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      'Chrome · macOS',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
      'Edge · Windows',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0',
      'Firefox · Linux',
    ],
    [
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
      'Chrome · Android',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0 Mobile/15E148 Safari/604.1',
      'Chrome · iPhone',
    ],
    ['curl/8.7.1', 'curl'],
  ])('describes %s', (ua, expected) => {
    expect(describeDevice(ua)).toBe(expected)
  })

  it('returns null when the header is missing or unknown', () => {
    expect(describeDevice(undefined)).toBeNull()
    expect(describeDevice('')).toBeNull()
    expect(describeDevice('node')).toBeNull()
  })
})
