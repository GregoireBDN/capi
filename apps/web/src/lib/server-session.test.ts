import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserDto } from '#/api/types.gen'

import {
  REFRESH_GRACE_MS,
  applySetCookies,
  findCookie,
  forgetRefreshes,
  parseCookieHeader,
  refreshSession,
  resolveServerSession,
} from './server-session'

const API_URL = 'http://api.test:4000'
const noWait = () => Promise.resolve()

const user = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Owner Test',
  email: 'owner@example.test',
} as UserDto

/**
 * In-memory stand-in for the API's auth endpoints with the same rotation
 * semantics: a refresh token is single use, and presenting a revoked one
 * revokes the whole family (every later refresh fails). With `hostPrefix`
 * it behaves like the production API (#217): `__Host-` names, the plain
 * refresh cookie still accepted when the prefixed one is missing, the plain
 * pair cleared on rotation.
 */
function createFakeApi({ hostPrefix = false } = {}) {
  const prefix = hostPrefix ? '__Host-' : ''
  const validAccess = new Set<string>()
  const refresh = new Map<string, 'valid' | 'revoked'>()
  let familyRevoked = false
  let counter = 0
  const calls = { me: 0, refresh: 0 }

  const fetchImpl = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input)
      const cookies = parseCookieHeader(
        new Headers(init?.headers).get('cookie') ?? undefined,
      )

      if (url.pathname === '/api/auth/me') {
        calls.me++
        const token = cookies.get(`${prefix}token`)
        if (token && validAccess.has(token) && !familyRevoked)
          return Response.json(user)
        return Response.json({ statusCode: 401 }, { status: 401 })
      }

      if (url.pathname === '/api/auth/refresh' && init?.method === 'POST') {
        calls.refresh++
        // Let concurrent callers pile up before the rotation completes.
        await new Promise((resolve) => setTimeout(resolve, 5))
        const presented =
          cookies.get(`${prefix}refresh_token`) ||
          (hostPrefix ? cookies.get('refresh_token') : undefined)
        const state = presented ? refresh.get(presented) : undefined
        if (state === 'revoked') familyRevoked = true
        if (!presented || state !== 'valid' || familyRevoked) {
          return Response.json({ statusCode: 401 }, { status: 401 })
        }
        refresh.set(presented, 'revoked')
        counter++
        const access = `access-${counter}`
        const next = `refresh-${counter}`
        validAccess.add(access)
        refresh.set(next, 'valid')
        const headers = new Headers({ 'content-type': 'application/json' })
        headers.append(
          'set-cookie',
          'refresh_token=; Max-Age=0; Path=/api/auth; HttpOnly',
        )
        if (hostPrefix) {
          headers.append('set-cookie', 'token=; Max-Age=0; Path=/; HttpOnly')
          headers.append(
            'set-cookie',
            'refresh_token=; Max-Age=0; Path=/; HttpOnly',
          )
        }
        const secure = hostPrefix ? '; Secure' : ''
        headers.append(
          'set-cookie',
          `${prefix}token=${access}; Max-Age=900; Path=/; HttpOnly${secure}; SameSite=Lax`,
        )
        headers.append(
          'set-cookie',
          `${prefix}refresh_token=${next}; Max-Age=2592000; Path=/; HttpOnly${secure}; SameSite=Lax`,
        )
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers,
        })
      }

      return new Response(null, { status: 404 })
    },
  )

  return {
    fetch: fetchImpl as unknown as typeof fetch,
    calls,
    issue(access: string, refreshToken: string) {
      validAccess.add(access)
      refresh.set(refreshToken, 'valid')
    },
    expire(access: string) {
      validAccess.delete(access)
    },
    get familyRevoked() {
      return familyRevoked
    },
  }
}

describe('resolveServerSession (SSR guard)', () => {
  let api: ReturnType<typeof createFakeApi>
  const target = () => ({ apiUrl: API_URL, fetch: api.fetch })

  beforeEach(() => {
    forgetRefreshes()
    api = createFakeApi()
    api.issue('access-0', 'refresh-0')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the user for a valid access token without refreshing', async () => {
    const session = await resolveServerSession(
      'token=access-0; refresh_token=refresh-0',
      target(),
    )

    expect(session.user).toEqual(user)
    expect(session.setCookies).toEqual([])
    expect(api.calls.refresh).toBe(0)
  })

  it('refreshes an expired access token and returns the Set-Cookie headers to forward', async () => {
    api.expire('access-0')

    const session = await resolveServerSession(
      'token=access-0; refresh_token=refresh-0; theme=dark',
      target(),
    )

    expect(session.user).toEqual(user)
    expect(api.calls.refresh).toBe(1)
    expect(session.setCookies).toEqual([
      'refresh_token=; Max-Age=0; Path=/api/auth; HttpOnly',
      'token=access-1; Max-Age=900; Path=/; HttpOnly; SameSite=Lax',
      'refresh_token=refresh-1; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax',
    ])
    // Later API calls in the same request use the rotated pair.
    expect(session.cookieHeader).toBe(
      'token=access-1; theme=dark; refresh_token=refresh-1',
    )
  })

  it('refreshes straight away when the access cookie is gone (cookie expired with the JWT)', async () => {
    const session = await resolveServerSession(
      'refresh_token=refresh-0',
      target(),
    )

    expect(session.user).toEqual(user)
    expect(api.calls.me).toBe(1) // only the retry after the rotation
    expect(session.setCookies).toHaveLength(3)
  })

  it('lets a second reload work with the rotated cookies', async () => {
    const first = await resolveServerSession(
      'refresh_token=refresh-0',
      target(),
    )
    api.expire('access-1')

    const second = await resolveServerSession(first.cookieHeader, target())

    expect(second.user).toEqual(user)
    expect(second.cookieHeader).toContain('refresh_token=refresh-2')
    expect(api.familyRevoked).toBe(false)
  })

  it('returns no user (→ redirect) when the refresh is rejected', async () => {
    const session = await resolveServerSession('refresh_token=forged', target())

    expect(session.user).toBeNull()
    expect(session.setCookies).toEqual([])
  })

  it('returns no user (→ redirect) without calling refresh when there are no cookies', async () => {
    const session = await resolveServerSession(undefined, target())

    expect(session.user).toBeNull()
    expect(api.calls.refresh).toBe(0)
  })

  it('does not refresh, nor sign out, when the API is unreachable rather than unauthorized', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')))

    const session = await resolveServerSession(
      'token=access-0; refresh_token=refresh-0',
      { apiUrl: API_URL, fetch: failing, sleep: noWait },
    )

    expect(session.user).toBeNull()
    expect(session.unavailable).toBe(0)
    // Tried twice, never a refresh.
    expect(failing).toHaveBeenCalledTimes(2)
  })

  it('shares one rotation between concurrent requests presenting the same refresh token', async () => {
    const sessions = await Promise.all(
      Array.from({ length: 5 }, () =>
        resolveServerSession('refresh_token=refresh-0', target()),
      ),
    )

    expect(api.calls.refresh).toBe(1)
    expect(api.familyRevoked).toBe(false)
    for (const session of sessions) {
      expect(session.user).toEqual(user)
      expect(session.cookieHeader).toBe(
        'token=access-1; refresh_token=refresh-1',
      )
    }
  })

  it('replays a completed rotation to a straggler within the grace window', async () => {
    const first = await resolveServerSession(
      'refresh_token=refresh-0',
      target(),
    )
    // A request sent before the browser stored the rotated cookies.
    const straggler = await resolveServerSession(
      'refresh_token=refresh-0',
      target(),
    )

    expect(api.calls.refresh).toBe(1)
    expect(api.familyRevoked).toBe(false)
    expect(straggler.user).toEqual(user)
    expect(straggler.setCookies).toEqual(first.setCookies)
  })

  it('replays the newest pair when the replayed rotation was itself rotated', async () => {
    const first = await resolveServerSession(
      'refresh_token=refresh-0',
      target(),
    )
    api.expire('access-1')
    await resolveServerSession(first.cookieHeader, target()) // refresh-1 → refresh-2

    const straggler = await resolveServerSession(
      'refresh_token=refresh-0',
      target(),
    )

    expect(api.calls.refresh).toBe(2)
    expect(api.familyRevoked).toBe(false)
    expect(straggler.user).toEqual(user)
    expect(straggler.cookieHeader).toBe(
      'token=access-2; refresh_token=refresh-2',
    )
  })

  it('lets the API detect reuse once the grace window is over', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    await resolveServerSession('refresh_token=refresh-0', target())

    vi.setSystemTime(Date.now() + REFRESH_GRACE_MS + 1)
    const replay = await resolveServerSession(
      'refresh_token=refresh-0',
      target(),
    )

    expect(replay.user).toBeNull()
    expect(api.calls.refresh).toBe(2)
    expect(api.familyRevoked).toBe(true)
  })

  it('does not cache a rejected refresh', async () => {
    await refreshSession({ name: 'refresh_token', value: 'forged' }, target())
    await refreshSession({ name: 'refresh_token', value: 'forged' }, target())

    expect(api.calls.refresh).toBe(2)
  })
})

describe('resolveServerSession when the API cannot tell (#292)', () => {
  beforeEach(() => {
    forgetRefreshes()
  })

  const json = (status: number, body: unknown = {}, headers?: HeadersInit) =>
    Response.json(body, { status, headers })

  /** Answers each call to `path` with the next response of the list. */
  function scripted(script: Partial<Record<string, (() => Response)[]>>) {
    const calls: { path: string; cookie: string | null }[] = []
    const fetchImpl = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const path = new URL(input instanceof Request ? input.url : input)
          .pathname
        calls.push({ path, cookie: new Headers(init?.headers).get('cookie') })
        const next = script[path]?.shift()
        if (!next) throw new Error(`unexpected call to ${path}`)
        return next()
      },
    )
    return { fetch: fetchImpl as unknown as typeof fetch, calls }
  }

  const rotated = () => {
    const headers = new Headers({ 'content-type': 'application/json' })
    headers.append('set-cookie', 'token=access-1; Max-Age=900; Path=/')
    headers.append(
      'set-cookie',
      'refresh_token=refresh-1; Max-Age=2592000; Path=/',
    )
    return new Response('{"success":true}', { status: 200, headers })
  }

  it('retries a rate-limited `me` once, honouring Retry-After', async () => {
    const api = scripted({
      '/api/auth/me': [
        () => json(429, {}, { 'retry-after': '1' }),
        () => json(200, user),
      ],
    })
    const sleep = vi.fn(noWait)

    const session = await resolveServerSession('token=access-0', {
      apiUrl: API_URL,
      fetch: api.fetch,
      sleep,
    })

    expect(session.user).toEqual(user)
    expect(session.unavailable).toBeUndefined()
    expect(sleep).toHaveBeenCalledWith(1000)
  })

  it('reports a failing `me` as unavailable, never as signed out', async () => {
    const api = scripted({
      '/api/auth/me': [() => json(503), () => json(503)],
    })

    const session = await resolveServerSession(
      'token=access-0; refresh_token=refresh-0',
      { apiUrl: API_URL, fetch: api.fetch, sleep: noWait },
    )

    expect(session).toMatchObject({ user: null, unavailable: 503 })
    expect(api.calls.map((c) => c.path)).not.toContain('/api/auth/refresh')
  })

  it('reports a rate-limited refresh as unavailable after one retry', async () => {
    const api = scripted({
      '/api/auth/refresh': [() => json(429), () => json(429)],
    })

    const session = await resolveServerSession('refresh_token=refresh-0', {
      apiUrl: API_URL,
      fetch: api.fetch,
      sleep: noWait,
    })

    expect(session).toMatchObject({
      user: null,
      unavailable: 429,
      setCookies: [],
    })
    expect(api.calls).toHaveLength(2)
  })

  it('retries a refresh whose answer was lost with the same token', async () => {
    const api = scripted({
      '/api/auth/refresh': [
        () => {
          throw new TypeError('fetch failed')
        },
        rotated,
      ],
      '/api/auth/me': [() => json(200, user)],
    })

    const session = await resolveServerSession('refresh_token=refresh-0', {
      apiUrl: API_URL,
      fetch: api.fetch,
      sleep: noWait,
    })

    expect(session.user).toEqual(user)
    expect(session.setCookies).toHaveLength(2)
    const refreshes = api.calls.filter((c) => c.path === '/api/auth/refresh')
    expect(refreshes.map((c) => c.cookie)).toEqual([
      'refresh_token=refresh-0',
      'refresh_token=refresh-0',
    ])
  })

  it('still signs out when the API refuses the refresh', async () => {
    const api = scripted({ '/api/auth/refresh': [() => json(401)] })

    const session = await resolveServerSession('refresh_token=refresh-0', {
      apiUrl: API_URL,
      fetch: api.fetch,
      sleep: noWait,
    })

    expect(session.user).toBeNull()
    expect(session.unavailable).toBeUndefined()
    expect(api.calls).toHaveLength(1)
  })

  it('forwards the rotated cookies even when `me` then fails', async () => {
    const api = scripted({
      '/api/auth/refresh': [rotated],
      '/api/auth/me': [() => json(502), () => json(502)],
    })

    const session = await resolveServerSession('refresh_token=refresh-0', {
      apiUrl: API_URL,
      fetch: api.fetch,
      sleep: noWait,
    })

    expect(session.unavailable).toBe(502)
    expect(session.setCookies).toHaveLength(2)
  })
})

describe('cookie helpers', () => {
  it('parses a Cookie header, keeping the first occurrence of a name', () => {
    const cookies = parseCookieHeader(
      'a=1; refresh_token=new; refresh_token=old; b=x=y',
    )
    expect(cookies.get('refresh_token')).toBe('new')
    expect(cookies.get('b')).toBe('x=y')
  })

  it('applies Set-Cookie values, dropping cleared cookies', () => {
    expect(
      applySetCookies('token=old; refresh_token=r0; theme=dark', [
        'token=new; Path=/; HttpOnly',
        'refresh_token=; Max-Age=0; Path=/api/auth',
        'theme=dark; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      ]),
    ).toBe('token=new')
  })
})

describe('resolveServerSession with __Host- cookies (production, #217)', () => {
  let api: ReturnType<typeof createFakeApi>
  const target = () => ({ apiUrl: API_URL, fetch: api.fetch })

  beforeEach(() => {
    forgetRefreshes()
    api = createFakeApi({ hostPrefix: true })
    api.issue('access-0', 'refresh-0')
  })

  it('uses a valid __Host- access token as is', async () => {
    const session = await resolveServerSession(
      '__Host-token=access-0; __Host-refresh_token=refresh-0',
      target(),
    )

    expect(session.user).toEqual(user)
    expect(session.setCookies).toEqual([])
    expect(api.calls.refresh).toBe(0)
  })

  it('moves a session from before #217 to the __Host- names without signing out', async () => {
    const session = await resolveServerSession(
      'token=access-0; refresh_token=refresh-0; theme=dark',
      target(),
    )

    expect(session.user).toEqual(user)
    expect(api.calls.refresh).toBe(1)
    const names = session.setCookies.map((c) => c.split('=')[0])
    expect(names).toContain('__Host-token')
    expect(names).toContain('__Host-refresh_token')
    expect(session.cookieHeader).toBe(
      'theme=dark; __Host-token=access-1; __Host-refresh_token=refresh-1',
    )
  })

  it('presents the __Host- refresh cookie over a plain one set by a sibling domain', async () => {
    api.issue('unused', 'tossed')
    const session = await resolveServerSession(
      'refresh_token=tossed; __Host-refresh_token=refresh-0',
      target(),
    )

    expect(session.user).toEqual(user)
    const refreshCall = vi
      .mocked(api.fetch)
      .mock.calls.find(([url]) => String(url).endsWith('/api/auth/refresh'))
    expect(new Headers(refreshCall?.[1]?.headers).get('cookie')).toBe(
      '__Host-refresh_token=refresh-0',
    )
  })
})

describe('findCookie', () => {
  it('returns the first non-empty cookie in the given order', () => {
    const cookies = parseCookieHeader(
      'token=plain; __Host-token=; refresh_token=r',
    )
    expect(findCookie(cookies, ['__Host-token', 'token'])).toEqual({
      name: 'token',
      value: 'plain',
    })
    expect(findCookie(cookies, ['missing'])).toBeUndefined()
  })
})
