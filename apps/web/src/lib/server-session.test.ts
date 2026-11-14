import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserDto } from '#/api/types.gen'

import {
  REFRESH_GRACE_MS,
  applySetCookies,
  forgetRefreshes,
  parseCookieHeader,
  refreshSession,
  resolveServerSession,
} from './server-session'

const API_URL = 'http://api.test:4000'

const user = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Owner Test',
  email: 'owner@example.test',
} as UserDto

/**
 * In-memory stand-in for the API's auth endpoints with the same rotation
 * semantics: a refresh token is single use, and presenting a revoked one
 * revokes the whole family (every later refresh fails).
 */
function createFakeApi() {
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
        const token = cookies.get('token')
        if (token && validAccess.has(token) && !familyRevoked)
          return Response.json(user)
        return Response.json({ statusCode: 401 }, { status: 401 })
      }

      if (url.pathname === '/api/auth/refresh' && init?.method === 'POST') {
        calls.refresh++
        // Let concurrent callers pile up before the rotation completes.
        await new Promise((resolve) => setTimeout(resolve, 5))
        const presented = cookies.get('refresh_token')
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
        headers.append(
          'set-cookie',
          `token=${access}; Max-Age=900; Path=/; HttpOnly; SameSite=Lax`,
        )
        headers.append(
          'set-cookie',
          `refresh_token=${next}; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax`,
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

  it('does not refresh when the API is unreachable rather than unauthorized', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')))

    const session = await resolveServerSession(
      'token=access-0; refresh_token=refresh-0',
      {
        apiUrl: API_URL,
        fetch: failing,
      },
    )

    expect(session.user).toBeNull()
    expect(failing).toHaveBeenCalledTimes(1)
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
    await refreshSession('forged', target())
    await refreshSession('forged', target())

    expect(api.calls.refresh).toBe(2)
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
