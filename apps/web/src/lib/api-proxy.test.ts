import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  API_BODY_LIMIT_BYTES,
  PROXY_BODY_MAX_BYTES,
  bodyLimitFor,
  proxyToApi,
} from './api-proxy'
import { DEFAULT_TRUSTED_PROXIES, compileTrustedProxies } from './client-ip'
import { forgetRefreshes, resolveServerSession } from './server-session'

const API_URL = 'http://api.test:4000'
const MULTIPART = 'multipart/form-data; boundary=----test'

type Captured = { url: string; init: RequestInit }

function upstream(
  handler: (url: URL, init: RequestInit) => Response | Promise<Response>,
) {
  const calls: Captured[] = []
  const fetchImpl = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input)
      calls.push({ url: url.toString(), init: init ?? {} })
      return handler(url, init ?? {})
    },
  )
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

  it('forwards Origin and Sec-Fetch-Site, which the API checks on writes (#179)', async () => {
    const api = upstream(() => new Response(null, { status: 204 }))

    await proxyToApi(
      new Request('http://web.test/api/crypto/valuate', {
        method: 'POST',
        headers: {
          cookie: 'token=abc',
          origin: 'http://web.test',
          'sec-fetch-site': 'same-origin',
        },
      }),
      { apiUrl: API_URL, fetch: api.fetch },
    )

    const headers = new Headers(api.calls[0].init.headers)
    expect(headers.get('origin')).toBe('http://web.test')
    expect(headers.get('sec-fetch-site')).toBe('same-origin')
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

    const response = await proxyToApi(
      new Request('http://web.test/api/auth/login', { method: 'POST' }),
      {
        apiUrl: API_URL,
        fetch: api.fetch,
      },
    )

    expect(response.headers.getSetCookie()).toEqual([
      'token=a; Path=/',
      'refresh_token=r; Path=/',
    ])
    expect(response.headers.get('content-encoding')).toBeNull()
    expect(response.headers.get('x-request-id')).toBe('req-1')
  })

  it('forwards the API cache headers and Clear-Site-Data on logout', async () => {
    const api = upstream(
      () =>
        new Response('{"success":true}', {
          status: 200,
          headers: {
            'cache-control': 'no-store',
            pragma: 'no-cache',
            expires: '0',
            'clear-site-data': '"cache"',
          },
        }),
    )

    const response = await proxyToApi(
      new Request('http://web.test/api/auth/logout', { method: 'POST' }),
      { apiUrl: API_URL, fetch: api.fetch },
    )

    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('pragma')).toBe('no-cache')
    expect(response.headers.get('expires')).toBe('0')
    expect(response.headers.get('clear-site-data')).toBe('"cache"')
  })

  it('answers 502 when the API is unreachable', async () => {
    const response = await proxyToApi(
      new Request('http://web.test/api/health'),
      {
        apiUrl: API_URL,
        fetch: vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
      },
    )

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

    expect(
      api.calls.filter((c) => c.url.endsWith('/api/auth/refresh')),
    ).toHaveLength(1)
    expect(proxied.status).toBe(200)
    expect(await proxied.json()).toEqual({ success: true })
    expect(proxied.headers.getSetCookie()).toEqual(ssr.setCookies)
    expect(ssr.user).toEqual({ id: 'u1' })
  })

  it('lets the API answer a refresh without a refresh cookie', async () => {
    const api = upstream(() =>
      Response.json({ statusCode: 401 }, { status: 401 }),
    )

    const response = await proxyToApi(
      new Request('http://web.test/api/auth/refresh', { method: 'POST' }),
      { apiUrl: API_URL, fetch: api.fetch },
    )

    expect(response.status).toBe(401)
    expect(api.calls).toHaveLength(1)
  })

  it('forgets replayable rotations on logout', async () => {
    const api = upstream((url) =>
      url.pathname === '/api/auth/refresh'
        ? rotatedResponse()
        : Response.json({ success: true }),
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
    expect(
      api.calls.filter((c) => c.url.endsWith('/api/auth/refresh')),
    ).toHaveLength(2)
  })
})

describe('proxyToApi client IP (X-Forwarded-For)', () => {
  const CADDY = '172.20.0.2'
  const CLIENT = '100.101.102.103'
  const trust = compileTrustedProxies(DEFAULT_TRUSTED_PROXIES)

  async function forwardedFor(
    socketAddress: string | undefined,
    incoming?: string,
  ): Promise<string | null> {
    const api = upstream(() => Response.json({}))
    await proxyToApi(
      new Request('http://web.test/api/auth/login', {
        method: 'POST',
        headers: incoming ? { 'x-forwarded-for': incoming } : {},
      }),
      { apiUrl: API_URL, fetch: api.fetch },
      socketAddress,
      trust,
    )
    return new Headers(api.calls[0].init.headers).get('x-forwarded-for')
  }

  it('forwards the client IP set by Caddy (a trusted proxy)', async () => {
    expect(await forwardedFor(CADDY, CLIENT)).toBe(CLIENT)
  })

  it('ignores a spoofed header from a client that is not a trusted proxy', async () => {
    expect(await forwardedFor(CLIENT, '203.0.113.99')).toBe(CLIENT)
  })

  it('ignores addresses a client prepended to the header Caddy extended', async () => {
    expect(await forwardedFor(CADDY, `203.0.113.99, ${CLIENT}`)).toBe(CLIENT)
  })

  it('forwards only the client IP, never the incoming chain', async () => {
    const header = await forwardedFor(CADDY, `10.0.0.9, ${CLIENT}, 172.20.0.7`)
    expect(header).toBe(CLIENT)
  })

  it('uses the socket address when no header is sent', async () => {
    expect(await forwardedFor(CLIENT)).toBe(CLIENT)
  })

  it('drops a client-sent header when the socket address is unknown', async () => {
    expect(await forwardedFor(undefined, '203.0.113.99')).toBeNull()
  })

  it('does not forward a malformed entry from a trusted proxy', async () => {
    expect(await forwardedFor(CADDY, 'not-an-ip')).toBe(CADDY)
  })

  it('trusts nobody with TRUSTED_PROXIES=none', async () => {
    const api = upstream(() => Response.json({}))
    await proxyToApi(
      new Request('http://web.test/api/accounts', {
        headers: { 'x-forwarded-for': CLIENT },
      }),
      { apiUrl: API_URL, fetch: api.fetch },
      CADDY,
      compileTrustedProxies('none'),
    )
    expect(new Headers(api.calls[0].init.headers).get('x-forwarded-for')).toBe(
      CADDY,
    )
  })

  it('drops other client-sent forwarding headers', async () => {
    const api = upstream(() => Response.json({}))
    await proxyToApi(
      new Request('http://web.test/api/accounts', {
        headers: {
          forwarded: 'for=203.0.113.99',
          'x-real-ip': '203.0.113.99',
          'x-forwarded-host': 'evil.test',
        },
      }),
      { apiUrl: API_URL, fetch: api.fetch },
      CLIENT,
      trust,
    )
    const headers = new Headers(api.calls[0].init.headers)
    expect(headers.get('forwarded')).toBeNull()
    expect(headers.get('x-real-ip')).toBeNull()
    expect(headers.get('x-forwarded-host')).toBe('web.test')
  })
})

describe('proxyToApi request body cap (#173)', () => {
  const MiB = 1024 * 1024

  /** A streamed body of `total` bytes in 1 MiB chunks, counting what was read. */
  function streamedBody(total: number) {
    let sent = 0
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= total) return controller.close()
        const size = Math.min(MiB, total - sent)
        sent += size
        controller.enqueue(new Uint8Array(size))
      },
      cancel() {
        cancelled = true
      },
    })
    return {
      stream,
      read: () => sent,
      cancelled: () => cancelled,
    }
  }

  it('refuses a declared Content-Length over the cap without reading or forwarding it', async () => {
    const api = upstream(() => Response.json({ ok: true }))
    const body = streamedBody(300 * MiB)

    const response = await proxyToApi(
      new Request('http://web.test/api/imports/preview', {
        method: 'POST',
        headers: {
          'content-type': MULTIPART,
          'content-length': String(300 * MiB),
        },
        body: body.stream,
        duplex: 'half',
      } as RequestInit),
      { apiUrl: API_URL, fetch: api.fetch },
    )

    expect(response.status).toBe(413)
    expect((await response.json()).statusCode).toBe(413)
    expect(api.calls).toHaveLength(0)
    expect(body.read()).toBeLessThanOrEqual(MiB)
  })

  it('stops reading a chunked body once it goes over the cap', async () => {
    const api = upstream(() => Response.json({ ok: true }))
    const body = streamedBody(300 * MiB)

    const response = await proxyToApi(
      new Request('http://web.test/api/imports/preview', {
        method: 'POST',
        headers: { 'content-type': MULTIPART },
        body: body.stream,
        duplex: 'half',
      } as RequestInit),
      { apiUrl: API_URL, fetch: api.fetch },
    )

    expect(response.status).toBe(413)
    expect(api.calls).toHaveLength(0)
    // Read stops at the first chunk past the cap (plus the stream's lookahead).
    expect(body.read()).toBeLessThan(PROXY_BODY_MAX_BYTES + 3 * MiB)
    expect(body.cancelled()).toBe(true)
  })

  it('forwards a body up to the cap unchanged', async () => {
    const api = upstream(() => Response.json({ ok: true }, { status: 201 }))
    const payload = new Uint8Array(PROXY_BODY_MAX_BYTES).fill(7)

    const response = await proxyToApi(
      new Request('http://web.test/api/imports/preview', {
        method: 'POST',
        headers: { 'content-type': MULTIPART },
        body: payload,
      }),
      { apiUrl: API_URL, fetch: api.fetch },
    )

    expect(response.status).toBe(201)
    const sent = new Uint8Array(api.calls[0].init.body as ArrayBuffer)
    expect(sent.byteLength).toBe(PROXY_BODY_MAX_BYTES)
    expect(sent[PROXY_BODY_MAX_BYTES - 1]).toBe(7)
  })

  it('passes the API 413 for a file just over the import limit through', async () => {
    const api = upstream(() =>
      Response.json(
        { statusCode: 413, message: 'The file exceeds the 5 MB limit' },
        { status: 413 },
      ),
    )

    const response = await proxyToApi(
      new Request('http://web.test/api/imports/preview', {
        method: 'POST',
        headers: { 'content-type': MULTIPART },
        body: new Uint8Array(5 * MiB + 1),
      }),
      { apiUrl: API_URL, fetch: api.fetch },
    )

    expect(response.status).toBe(413)
    expect((await response.json()).message).toBe(
      'The file exceeds the 5 MB limit',
    )
  })
  it('caps every body but multipart uploads at the API bodyLimit', () => {
    expect(bodyLimitFor(MULTIPART)).toBe(PROXY_BODY_MAX_BYTES)
    expect(bodyLimitFor('Multipart/Form-Data;boundary=x')).toBe(
      PROXY_BODY_MAX_BYTES,
    )
    expect(bodyLimitFor('application/json')).toBe(API_BODY_LIMIT_BYTES)
    expect(bodyLimitFor('application/json; charset=utf-8')).toBe(
      API_BODY_LIMIT_BYTES,
    )
    expect(bodyLimitFor('text/plain')).toBe(API_BODY_LIMIT_BYTES)
    expect(bodyLimitFor(null)).toBe(API_BODY_LIMIT_BYTES)
  })

  it('answers 413 itself for a 2 MB JSON body the API would refuse early (#201)', async () => {
    // The API answers 413 as soon as it sees the length and closes the
    // connection mid-upload: `fetch` rejects, which used to become a 502.
    const api = upstream(() => {
      throw new TypeError('fetch failed')
    })

    const response = await proxyToApi(
      new Request('http://web.test/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.test', pad: 'x'.repeat(2 * MiB) }),
      }),
      { apiUrl: API_URL, fetch: api.fetch },
    )

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({
      statusCode: 413,
      error: 'Payload Too Large',
      message: ['Request body is too large'],
    })
    expect(api.calls).toHaveLength(0)
  })

  it('stops reading a chunked JSON body past the API bodyLimit', async () => {
    const api = upstream(() => Response.json({ ok: true }))
    const body = streamedBody(300 * MiB)

    const response = await proxyToApi(
      new Request('http://web.test/api/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body.stream,
        duplex: 'half',
      } as RequestInit),
      { apiUrl: API_URL, fetch: api.fetch },
    )

    expect(response.status).toBe(413)
    expect(api.calls).toHaveLength(0)
    expect(body.read()).toBeLessThan(API_BODY_LIMIT_BYTES + 3 * MiB)
    expect(body.cancelled()).toBe(true)
  })

  it('forwards a JSON body of exactly the API bodyLimit', async () => {
    const api = upstream(() => Response.json({ ok: true }, { status: 201 }))

    const response = await proxyToApi(
      new Request('http://web.test/api/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: new Uint8Array(API_BODY_LIMIT_BYTES).fill(32),
      }),
      { apiUrl: API_URL, fetch: api.fetch },
    )

    expect(response.status).toBe(201)
    expect((api.calls[0].init.body as ArrayBuffer).byteLength).toBe(
      API_BODY_LIMIT_BYTES,
    )
  })
})
