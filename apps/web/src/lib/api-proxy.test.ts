import { beforeEach, describe, expect, it, vi } from 'vitest'

import { proxyToApi } from './api-proxy'
import { forgetRefreshes, resolveServerSession } from './server-session'

const API_URL = 'http://api.test:4000'

type Captured = { url: string; init: RequestInit }

function upstream(handler: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const calls: Captured[] = []
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input)
    calls.push({ url: url.toString(), init: init ?? {} })
    return handler(url, init ?? {})
  })
  return { fetch: fetchImpl as unknown as typeof fetch, calls }
}

function rotatedResponse() {
  const headers = new Headers({ 'content-type': 'application/json' })
  headers.append('set-cookie', 'token=access-1; Path=/; HttpOnly')
  headers.append('set-cookie', 'refresh_token=refresh-1; Path=/; HttpOnly')
  return new Response('{"success":true}', { status: 200, headers })
}

describe('proxyToApi (/api/* → API)', () => {
  beforeEach(() => {
    forgetRefreshes()
  })

  it('forwards method, path, query, body and cookies to the API', async () => {
    const api = upstream(() => Response.json({ ok: true }, { status: 201 }))

    const response = await proxyToApi(
      new Request('http://web.test/api/accounts?limit=5', {
        method: 'POST',
        headers: {
          cookie: 'token=abc',
          'content-type': 'application/json',
          connection: 'keep-alive',
          'accept-encoding': 'gzip, br',
        },
        body: JSON.stringify({ name: 'Compte test' }),
      }),
      { apiUrl: API_URL, fetch: api.fetch },
      '203.0.113.7',
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ ok: true })
    const [call] = api.calls
    expect(call.url).toBe(`${API_URL}/api/accounts?limit=5`)
    expect(call.init.method).toBe('POST')
    expect(new TextDecoder().decode(call.init.body as ArrayBuffer)).toBe(
      '{"name":"Compte test"}',
    )
    const headers = new Headers(call.init.headers)
    expect(headers.get('cookie')).toBe('token=abc')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('connection')).toBeNull()
    expect(headers.get('accept-encoding')).toBeNull()
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7')
    expect(headers.get('x-forwarded-host')).toBe('web.test')
  })

  it('passes every Set-Cookie header through and drops encoding headers', async () => {
    const api = upstream(() => {
      const headers = new Headers({
        'content-type': 'application/json',
        'content-encoding': 'gzip',
        'x-request-id': 'req-1',
      })
      headers.append('set-cookie', 'token=a; Path=/')
      headers.append('set-cookie', 'refresh_token=r; Path=/')
      return new Response('{}', { status: 200, headers })
    })

    const response = await proxyToApi(new Request('http://web.test/api/auth/login', { method: 'POST' }), {
      apiUrl: API_URL,
      fetch: api.fetch,
    })

    expect(response.headers.getSetCookie()).toEqual(['token=a; Path=/', 'refresh_token=r; Path=/'])
    expect(response.headers.get('content-encoding')).toBeNull()
    expect(response.headers.get('x-request-id')).toBe('req-1')
  })

  it('answers 502 when the API is unreachable', async () => {
    const response = await proxyToApi(new Request('http://web.test/api/health'), {
      apiUrl: API_URL,
      fetch: vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    })

    expect(response.status).toBe(502)
  })

  it('shares one rotation between a proxied client refresh and an SSR reload', async () => {
    const api = upstream(async (url, init) => {
      if (url.pathname === '/api/auth/refresh') {
        await new Promise((resolve) => setTimeout(resolve, 5))
        return rotatedResponse()
      }
      const cookie = new Headers(init.headers).get('cookie') ?? ''
      return cookie.includes('token=access-1')
        ? Response.json({ id: 'u1' })
        : Response.json({}, { status: 401 })
    })
    const target = { apiUrl: API_URL, fetch: api.fetch }

    const [proxied, ssr] = await Promise.all([
      proxyToApi(
        new Request('http://web.test/api/auth/refresh', {
          method: 'POST',
          headers: { cookie: 'refresh_token=refresh-0' },
        }),
        target,
      ),
      resolveServerSession('refresh_token=refresh-0', target),
    ])

    expect(api.calls.filter((c) => c.url.endsWith('/api/auth/refresh'))).toHaveLength(1)
    expect(proxied.status).toBe(200)
    expect(await proxied.json()).toEqual({ success: true })
    expect(proxied.headers.getSetCookie()).toEqual(ssr.setCookies)
    expect(ssr.user).toEqual({ id: 'u1' })
  })

  it('lets the API answer a refresh without a refresh cookie', async () => {
    const api = upstream(() => Response.json({ statusCode: 401 }, { status: 401 }))

    const response = await proxyToApi(
      new Request('http://web.test/api/auth/refresh', { method: 'POST' }),
      { apiUrl: API_URL, fetch: api.fetch },
    )

    expect(response.status).toBe(401)
    expect(api.calls).toHaveLength(1)
  })

  it('forgets replayable rotations on logout', async () => {
    const api = upstream((url) =>
      url.pathname === '/api/auth/refresh' ? rotatedResponse() : Response.json({ success: true }),
    )
    const target = { apiUrl: API_URL, fetch: api.fetch }
    const refresh = () =>
      proxyToApi(
        new Request('http://web.test/api/auth/refresh', {
          method: 'POST',
          headers: { cookie: 'refresh_token=refresh-0' },
        }),
        target,
      )

    await refresh()
    await proxyToApi(
      new Request('http://web.test/api/auth/logout', { method: 'POST' }),
      target,
    )
    await refresh()

    // The second refresh reached the API (which would now reject it).
    expect(api.calls.filter((c) => c.url.endsWith('/api/auth/refresh'))).toHaveLength(2)
  })
})
