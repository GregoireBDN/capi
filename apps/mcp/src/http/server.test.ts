import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { groceries, salary } from '../test/fixtures.js'
import { jsonError, mockFetch } from '../test/mock-api.js'
import type { HttpConfig } from './config.js'
import { RATE_LIMITS, startHttpServer } from './server.js'

/**
 * The remote adapter (#78) over real HTTP on an ephemeral port: a real MCP
 * client (Streamable HTTP) in front, a mocked API behind. Synthetic data.
 */

const PUBLIC_URL = 'https://mcp.example.test'
const OAUTH_TOKEN = `fin_oat_${'o'.repeat(43)}`
const REVOKED_TOKEN = `fin_oat_${'r'.repeat(43)}`
const PAT = `fin_pat_${'p'.repeat(43)}`

const config: HttpConfig = {
  apiUrl: 'http://api.test',
  publicUrl: PUBLIC_URL,
  host: '127.0.0.1',
  port: 0,
  trustedProxies: ['loopback'],
}

const servers: Server[] = []
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise((resolve) => server.close(resolve))),
  )
})

const tokenInfo = (_url: URL, _body: unknown, headers: Headers) =>
  headers.get('authorization') === `Bearer ${OAUTH_TOKEN}`
    ? {
        scope: 'read',
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      }
    : jsonError(401, { message: ['Invalid or expired access token'] })

async function start(routes: Record<string, unknown> = {}) {
  const api = mockFetch({
    'GET /api/oauth/token-info': tokenInfo,
    'GET /api/oauth/metadata': {
      issuer: PUBLIC_URL,
      code_challenge_methods_supported: ['S256'],
    },
    'GET /api/categories': [groceries, salary],
    ...routes,
  })
  const logs: string[] = []
  const server = await startHttpServer({
    config,
    fetch: api.fetch,
    log: (line) => logs.push(line),
  })
  servers.push(server)
  const { port } = server.address() as AddressInfo
  const base = `http://127.0.0.1:${port}`
  return { base, api, logs }
}

async function connectClient(base: string, token: string) {
  const client = new Client({ name: 'test', version: '0.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  )
  return client
}

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'curl', version: '0' },
  },
}

const postMcp = (base: string, headers: Record<string, string> = {}) =>
  fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(initialize),
  })

describe('remote MCP adapter', () => {
  it('publishes the protected resource metadata at both well-known paths', async () => {
    const { base } = await start()
    for (const path of [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp',
    ]) {
      const res = await fetch(`${base}${path}`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        resource: `${PUBLIC_URL}/mcp`,
        authorization_servers: [PUBLIC_URL],
        scopes_supported: ['read', 'write'],
        bearer_methods_supported: ['header'],
        resource_name: 'Capi',
      })
    }
  })

  it('relays the authorization server metadata from the API', async () => {
    const { base, api } = await start()
    const res = await fetch(`${base}/.well-known/oauth-authorization-server`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ issuer: PUBLIC_URL })
    expect(api.calls.map((c) => c.url.pathname)).toEqual([
      '/api/oauth/metadata',
    ])
  })

  it('answers 401 with the resource metadata pointer without a token', async () => {
    const { base, api } = await start()
    const res = await postMcp(base)
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource/mcp"`,
    )
    expect(api.calls).toEqual([])
  })

  it.each([
    ['a personal access token', PAT],
    ['a malformed token', 'abc'],
  ])('refuses %s without asking the API', async (_name, token) => {
    const { base, api } = await start()
    const res = await postMcp(base, { Authorization: `Bearer ${token}` })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain(
      'error="invalid_token"',
    )
    expect(api.calls).toEqual([])
  })

  it('refuses an OAuth token the API does not know (revoked, expired)', async () => {
    const { base } = await start()
    const res = await postMcp(base, {
      Authorization: `Bearer ${REVOKED_TOKEN}`,
    })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain(
      'error="invalid_token"',
    )
  })

  it('serves MCP with the token, forwarding it and the client IP to the API', async () => {
    const { base, api, logs } = await start()
    const client = await connectClient(base, OAUTH_TOKEN)
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toContain('list_categories')
    const result = await client.callTool({
      name: 'list_categories',
      arguments: {},
    })
    expect(result.isError).toBeFalsy()
    const text = (result.content as { text: string }[])[0]!.text
    expect(text).toContain('Courses')
    await client.close()

    const categories = api.calls.find(
      (c) => c.url.pathname === '/api/categories',
    )!
    expect(categories.headers.get('authorization')).toBe(
      `Bearer ${OAUTH_TOKEN}`,
    )
    expect(categories.headers.get('x-forwarded-for')).toBe('127.0.0.1')
    // The token is checked once, then cached for a short while.
    expect(
      api.calls.filter((c) => c.url.pathname === '/api/oauth/token-info'),
    ).toHaveLength(1)
    // Logs never carry a token.
    expect(logs.length).toBeGreaterThan(0)
    expect(logs.join('\n')).not.toContain('fin_oat_')
    expect(logs).toContain('[capi-mcp] POST mcp 200')
  })

  it('never reads a file on the server for a bank import', async () => {
    const { base, api } = await start()
    const client = await connectClient(base, OAUTH_TOKEN)
    const result = await client.callTool({
      name: 'preview_bank_import',
      arguments: { account: 'Compte courant', filePath: '/etc/hosts' },
    })
    await client.close()
    expect(result.isError).toBe(true)
    expect((result.content as { text: string }[])[0]!.text).toContain(
      'le serveur ne lit aucun fichier',
    )
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('tells the model to reconnect when the API refuses the token mid-way', async () => {
    const { base } = await start({
      'GET /api/categories': jsonError(401, {}),
    })
    const client = await connectClient(base, OAUTH_TOKEN)
    const result = await client.callTool({
      name: 'list_categories',
      arguments: {},
    })
    await client.close()
    expect(result.isError).toBe(true)
    expect((result.content as { text: string }[])[0]!.text).toContain(
      'Reconnectez le connecteur',
    )
  })

  it.each(['GET', 'DELETE'])(
    'answers %s /mcp with 405 (stateless, no stream)',
    async (method) => {
      const { base } = await start()
      const res = await fetch(`${base}/mcp`, {
        method,
        headers: { Authorization: `Bearer ${OAUTH_TOKEN}` },
      })
      expect(res.status).toBe(405)
      expect(res.headers.get('allow')).toBe('POST')
    },
  )

  it.each([
    '/',
    '/api/accounts',
    '/api/oauth/token',
    '/oauth/authorize',
    '/mcp/x',
  ])('exposes nothing else: %s → 404', async (path) => {
    const { base, api } = await start()
    const res = await fetch(`${base}${path}`)
    expect(res.status).toBe(404)
    expect(api.calls).toEqual([])
  })

  it('refuses requests from another browser origin', async () => {
    const { base } = await start()
    const res = await postMcp(base, {
      Authorization: `Bearer ${OAUTH_TOKEN}`,
      Origin: 'https://evil.example',
    })
    expect(res.status).toBe(403)
  })

  describe('OAuth endpoints', () => {
    it('converts a form token request to JSON for the API and relays its answer', async () => {
      const { base, api } = await start({
        'POST /api/oauth/token': jsonError(400, {
          error: 'invalid_grant',
          error_description: 'Invalid authorization code',
        }),
      })
      const res = await fetch(`${base}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: 'fin_oac_x',
          code_verifier: 'v'.repeat(43),
          client_id: 'fin_cli_x',
          redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        }).toString(),
      })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: 'invalid_grant',
        error_description: 'Invalid authorization code',
      })
      expect(res.headers.get('cache-control')).toBe('no-store')
      const [call] = api.calls
      expect(call!.url.pathname).toBe('/api/oauth/token')
      expect(call!.headers.get('content-type')).toBe('application/json')
      expect(call!.headers.get('x-forwarded-for')).toBe('127.0.0.1')
      expect(call!.body).toEqual({
        grant_type: 'authorization_code',
        code: 'fin_oac_x',
        code_verifier: 'v'.repeat(43),
        client_id: 'fin_cli_x',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      })
    })

    it('forwards a JSON registration', async () => {
      const { base, api } = await start({
        'POST /api/oauth/register': () =>
          new Response(JSON.stringify({ client_id: 'fin_cli_x' }), {
            status: 201,
          }),
      })
      const res = await fetch(`${base}/oauth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
        }),
      })
      expect(res.status).toBe(201)
      expect(await res.json()).toEqual({ client_id: 'fin_cli_x' })
      expect(api.calls[0]!.body).toEqual({
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      })
    })

    it.each([
      [
        'a repeated parameter',
        'application/x-www-form-urlencoded',
        'code=a&code=b',
        400,
      ],
      ['another content type', 'text/plain', 'grant_type=x', 415],
      [
        'an oversized body',
        'application/x-www-form-urlencoded',
        `x=${'a'.repeat(17_000)}`,
        413,
      ],
    ])('refuses %s', async (_name, type, body, status) => {
      const { base, api } = await start()
      const res = await fetch(`${base}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': type },
        body,
      })
      expect(res.status).toBe(status)
      expect(api.calls).toEqual([])
    })

    it('answers 503 in RFC form when the API is down', async () => {
      const { base } = await start({
        'POST /api/oauth/revoke': () => {
          throw new TypeError('fetch failed')
        },
      })
      const res = await fetch(`${base}/oauth/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'token=x',
      })
      expect(res.status).toBe(503)
      expect(await res.json()).toMatchObject({
        error: 'temporarily_unavailable',
      })
    })
  })

  it('rate-limits a client IP', async () => {
    const { base } = await start()
    let last = 0
    for (let i = 0; i <= RATE_LIMITS.perIp; i += 1) {
      last = (await fetch(`${base}/.well-known/oauth-protected-resource`))
        .status
    }
    expect(last).toBe(429)
  })
})
