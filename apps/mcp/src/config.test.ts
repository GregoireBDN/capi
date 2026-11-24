import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from './config.js'
import { TEST_TOKEN } from './test/mock-api.js'

describe('loadConfig', () => {
  it('reads the API URL and token, dropping a trailing slash or /api', () => {
    expect(
      loadConfig({
        CAPI_API_URL: 'http://localhost:4000/',
        CAPI_API_TOKEN: TEST_TOKEN,
      }),
    ).toEqual({ apiUrl: 'http://localhost:4000', token: TEST_TOKEN })
    expect(
      loadConfig({
        CAPI_API_URL: 'https://app.example.test/api',
        CAPI_API_TOKEN: TEST_TOKEN,
      }).apiUrl,
    ).toBe('https://app.example.test')
  })

  it.each([
    [{ CAPI_API_TOKEN: TEST_TOKEN }, /CAPI_API_URL is not set/],
    [{ CAPI_API_URL: 'http://localhost:4000' }, /CAPI_API_TOKEN is not set/],
    [{ CAPI_API_URL: 'ftp://x', CAPI_API_TOKEN: TEST_TOKEN }, /http\(s\)/],
    [
      { CAPI_API_URL: 'not a url', CAPI_API_TOKEN: TEST_TOKEN },
      /not a valid URL/,
    ],
    [
      {
        CAPI_API_URL: 'http://localhost:4000',
        CAPI_API_TOKEN: 'secret',
      },
      /not a personal/,
    ],
  ])('rejects a bad configuration', (env, message) => {
    expect(() => loadConfig(env)).toThrow(ConfigError)
    expect(() => loadConfig(env)).toThrow(message)
  })

  it('still reads FINANCES_API_URL and FINANCES_API_TOKEN, the names before #464', () => {
    expect(
      loadConfig({
        FINANCES_API_URL: 'http://localhost:4000',
        FINANCES_API_TOKEN: TEST_TOKEN,
      }),
    ).toEqual({ apiUrl: 'http://localhost:4000', token: TEST_TOKEN })
  })

  it('prefers the CAPI_ names when both are set', () => {
    expect(
      loadConfig({
        CAPI_API_URL: 'http://localhost:4000',
        FINANCES_API_URL: 'http://old.example.test',
        CAPI_API_TOKEN: TEST_TOKEN,
        FINANCES_API_TOKEN: 'fin_pat_old',
      }),
    ).toEqual({ apiUrl: 'http://localhost:4000', token: TEST_TOKEN })
  })

  it('never echoes the token in its errors', () => {
    const token = 'fin_pat_short'
    expect(() =>
      loadConfig({
        CAPI_API_URL: 'http://localhost:4000',
        CAPI_API_TOKEN: token,
      }),
    ).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(token) }),
    )
  })
})
