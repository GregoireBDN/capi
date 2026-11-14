import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from './config.js'
import { TEST_TOKEN } from './test/mock-api.js'

describe('loadConfig', () => {
  it('reads the API URL and token, dropping a trailing slash or /api', () => {
    expect(
      loadConfig({
        FINANCES_API_URL: 'http://localhost:4000/',
        FINANCES_API_TOKEN: TEST_TOKEN,
      }),
    ).toEqual({ apiUrl: 'http://localhost:4000', token: TEST_TOKEN })
    expect(
      loadConfig({
        FINANCES_API_URL: 'https://app.example.test/api',
        FINANCES_API_TOKEN: TEST_TOKEN,
      }).apiUrl,
    ).toBe('https://app.example.test')
  })

  it.each([
    [{ FINANCES_API_TOKEN: TEST_TOKEN }, /FINANCES_API_URL is not set/],
    [
      { FINANCES_API_URL: 'http://localhost:4000' },
      /FINANCES_API_TOKEN is not set/,
    ],
    [
      { FINANCES_API_URL: 'ftp://x', FINANCES_API_TOKEN: TEST_TOKEN },
      /http\(s\)/,
    ],
    [
      { FINANCES_API_URL: 'not a url', FINANCES_API_TOKEN: TEST_TOKEN },
      /not a valid URL/,
    ],
    [
      {
        FINANCES_API_URL: 'http://localhost:4000',
        FINANCES_API_TOKEN: 'secret',
      },
      /not a personal/,
    ],
  ])('rejects a bad configuration', (env, message) => {
    expect(() => loadConfig(env)).toThrow(ConfigError)
    expect(() => loadConfig(env)).toThrow(message)
  })

  it('never echoes the token in its errors', () => {
    const token = 'fin_pat_short'
    expect(() =>
      loadConfig({
        FINANCES_API_URL: 'http://localhost:4000',
        FINANCES_API_TOKEN: token,
      }),
    ).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(token) }),
    )
  })
})
