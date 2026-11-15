import { describe, expect, it } from 'vitest'
import { ConfigError } from '../config.js'
import { loadHttpConfig } from './config.js'

const env = {
  REMOTE_MCP_ENABLED: 'true',
  FINANCES_API_URL: 'http://api:4000',
  REMOTE_MCP_PUBLIC_URL: 'https://finances-mcp.example.com',
}

describe('loadHttpConfig', () => {
  it('reads the adapter settings', () => {
    expect(loadHttpConfig(env)).toEqual({
      apiUrl: 'http://api:4000',
      publicUrl: 'https://finances-mcp.example.com',
      host: '127.0.0.1',
      port: 4100,
      trustedProxies: ['loopback'],
    })
  })

  it.each([undefined, 'false', '1', 'TRUE'])(
    'refuses to start unless REMOTE_MCP_ENABLED is "true" (%s)',
    (value) => {
      expect(() =>
        loadHttpConfig({ ...env, REMOTE_MCP_ENABLED: value }),
      ).toThrow(/remote access is off/)
    },
  )

  it.each([
    [{ REMOTE_MCP_PUBLIC_URL: 'http://finances-mcp.example.com' }, /https/],
    [
      { REMOTE_MCP_PUBLIC_URL: 'https://finances-mcp.example.com/mcp' },
      /without a path/,
    ],
    [{ REMOTE_MCP_PUBLIC_URL: undefined }, /not set/],
    [{ FINANCES_API_URL: undefined }, /not set/],
    [{ MCP_HTTP_PORT: 'abc' }, /port/],
  ])('refuses %o', (override, message) => {
    expect(() => loadHttpConfig({ ...env, ...override })).toThrow(ConfigError)
    expect(() => loadHttpConfig({ ...env, ...override })).toThrow(message)
  })

  it('accepts http on localhost for local tests', () => {
    expect(
      loadHttpConfig({ ...env, REMOTE_MCP_PUBLIC_URL: 'http://localhost:4100' })
        .publicUrl,
    ).toBe('http://localhost:4100')
  })
})
