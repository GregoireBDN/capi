import { describe, expect, it } from 'vitest'
import {
  canonicalResource,
  DEFAULT_REMOTE_MCP_REDIRECT_URIS,
  resolveRemoteMcp,
} from './remote-mcp.config'

const base = {
  APP_URL: 'https://capi.tailnet.example',
  REMOTE_MCP_ENABLED: false,
  isProduction: false,
}

describe('resolveRemoteMcp', () => {
  it('is off by default, with the dev adapter and the Claude callbacks', () => {
    expect(resolveRemoteMcp(base)).toEqual({
      enabled: false,
      issuer: 'http://localhost:4100',
      resource: 'http://localhost:4100/mcp',
      authorizationEndpoint: 'https://capi.tailnet.example/oauth/authorize',
      redirectUris: [...DEFAULT_REMOTE_MCP_REDIRECT_URIS],
    })
  })

  it('derives the issuer and the resource from the public origin', () => {
    const config = resolveRemoteMcp({
      ...base,
      REMOTE_MCP_ENABLED: true,
      isProduction: true,
      REMOTE_MCP_PUBLIC_URL: 'https://capi-mcp.example.com',
    })
    expect(config.issuer).toBe('https://capi-mcp.example.com')
    expect(config.resource).toBe('https://capi-mcp.example.com/mcp')
  })

  it.each([
    [{ REMOTE_MCP_ENABLED: true, isProduction: true }, /required/],
    [
      {
        REMOTE_MCP_ENABLED: true,
        isProduction: true,
        REMOTE_MCP_PUBLIC_URL: 'http://capi-mcp.example.com',
      },
      /https/,
    ],
    [{ REMOTE_MCP_PUBLIC_URL: 'https://mcp.example.com/mcp' }, /plain origin/],
    [{ REMOTE_MCP_REDIRECT_URIS: 'http://evil.example/cb' }, /https/],
    [{ REMOTE_MCP_REDIRECT_URIS: 'not a url' }, /not a URL/],
  ])('refuses %o', (values, message) => {
    expect(() => resolveRemoteMcp({ ...base, ...values })).toThrow(message)
  })

  it('accepts a custom redirect list, loopback included', () => {
    expect(
      resolveRemoteMcp({
        ...base,
        REMOTE_MCP_REDIRECT_URIS:
          'https://claude.ai/api/mcp/auth_callback, http://localhost:6274/callback',
      }).redirectUris,
    ).toEqual([
      'https://claude.ai/api/mcp/auth_callback',
      'http://localhost:6274/callback',
    ])
  })
})

describe('canonicalResource', () => {
  it.each([
    ['https://MCP.Example.com/mcp', 'https://mcp.example.com/mcp'],
    ['https://mcp.example.com/mcp/', 'https://mcp.example.com/mcp'],
    ['https://mcp.example.com/mcp#x', null],
    ['https://mcp.example.com/mcp?x=1', null],
    ['mcp.example.com', null],
  ])('%s → %s', (input, expected) => {
    expect(canonicalResource(input)).toBe(expected)
  })
})
