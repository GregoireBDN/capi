import { AsyncLocalStorage } from 'node:async_hooks'
import { isRedirect } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { requireUser } from './auth-guard'
import { withServerCookies } from './server-api'
import { forgetRefreshes } from './server-session'

/**
 * `requireUser` as it runs during SSR: the real guard → `fetchCurrentUser`
 * (server branch) → `getMe` → `resolveServerSession`, with only the framework
 * request context and the network faked. Covers what the browser ends up with:
 * the redirect decision and the `Set-Cookie` headers on the page response.
 */

interface RequestContext {
  request: Request
  responseHeaders: Headers
}

/** Per-request context, like the framework's own async-local event. */
const requestContext = new AsyncLocalStorage<RequestContext>()
const ctx = () => requestContext.getStore()!

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ handler: <T>(fn: T) => fn }),
  createIsomorphicFn: () => ({
    server: <T>(serverFn: T) => ({ client: () => serverFn }),
  }),
}))
vi.mock('@tanstack/react-start/server', () => ({
  getRequest: () => ctx().request,
  getRequestHeader: (name: string) =>
    ctx().request.headers.get(name) ?? undefined,
  getResponseHeaders: () => ctx().responseHeaders,
}))
// Generated client (not needed by the SSR session path).
vi.mock('#/api', () => ({}))
vi.mock('#/api/client', () => ({ createClient: vi.fn() }))

const user = { id: '00000000-0000-0000-0000-000000000001', name: 'Owner Test' }

const api = {
  refreshCalls: 0,
  rejectRefresh: false,
}

const fetchMock = vi.fn(
  async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input)
    const cookie = new Headers(init?.headers).get('cookie') ?? ''
    if (url.pathname === '/api/auth/me') {
      return /(^|; )token=(valid|rotated)(;|$)/.test(cookie)
        ? Response.json(user)
        : Response.json({ statusCode: 401 }, { status: 401 })
    }
    if (url.pathname === '/api/auth/refresh') {
      api.refreshCalls++
      await new Promise((resolve) => setTimeout(resolve, 5))
      if (api.rejectRefresh || !cookie.includes('refresh_token=r0')) {
        return Response.json({ statusCode: 401 }, { status: 401 })
      }
      const headers = new Headers()
      headers.append(
        'set-cookie',
        'token=rotated; Max-Age=900; Path=/; HttpOnly; SameSite=Lax',
      )
      headers.append(
        'set-cookie',
        'refresh_token=r1; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax',
      )
      return new Response('{"success":true}', { status: 200, headers })
    }
    return new Response(null, { status: 404 })
  },
)

/** Runs `fn` while handling a page request carrying `cookie`. */
function onPageRequest<T>(cookie: string | undefined, fn: () => Promise<T>) {
  const context: RequestContext = {
    request: new Request('http://web.test/dashboard', {
      headers: cookie ? { cookie } : {},
    }),
    responseHeaders: new Headers(),
  }
  return requestContext.run(context, async () => ({
    result: await fn(),
    setCookies: context.responseHeaders.getSetCookie(),
  }))
}

async function redirectTarget(run: () => Promise<unknown>) {
  try {
    await run()
    return undefined
  } catch (error) {
    if (!isRedirect(error)) throw error
    return error.options.to
  }
}

describe('requireUser during SSR', () => {
  beforeEach(() => {
    forgetRefreshes()
    api.refreshCalls = 0
    api.rejectRefresh = false
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('API_URL', 'http://api.test:4000')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('renders with a valid access token and sets no cookie', async () => {
    const { result, setCookies } = await onPageRequest(
      'token=valid; refresh_token=r0',
      requireUser,
    )

    expect(result).toEqual(user)
    expect(api.refreshCalls).toBe(0)
    expect(setCookies).toEqual([])
  })

  it('refreshes an expired access token and forwards the rotated cookies to the browser', async () => {
    const { result, setCookies } = await onPageRequest(
      'token=expired; refresh_token=r0',
      async () => ({
        user: await requireUser(),
        loaderCookies: withServerCookies(),
      }),
    )

    expect(result.user).toEqual(user)
    expect(api.refreshCalls).toBe(1)
    expect(setCookies).toEqual([
      'token=rotated; Max-Age=900; Path=/; HttpOnly; SameSite=Lax',
      'refresh_token=r1; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax',
    ])
    // Loaders running later in the same request use the rotated session.
    expect(result.loaderCookies).toEqual({
      headers: { cookie: 'token=rotated; refresh_token=r1' },
    })
  })

  it('redirects to /auth when the refresh is rejected', async () => {
    api.rejectRefresh = true

    const { result, setCookies } = await onPageRequest('refresh_token=r0', () =>
      redirectTarget(requireUser),
    )

    expect(result).toBe('/auth')
    expect(setCookies).toEqual([])
  })

  it('redirects to /auth without calling the API refresh when there are no cookies', async () => {
    const { result } = await onPageRequest(undefined, () =>
      redirectTarget(requireUser),
    )

    expect(result).toBe('/auth')
    expect(api.refreshCalls).toBe(0)
  })

  it('rotates once for concurrent reloads presenting the same refresh token', async () => {
    const reloads = await Promise.all(
      Array.from({ length: 3 }, () =>
        onPageRequest('refresh_token=r0', requireUser),
      ),
    )

    expect(api.refreshCalls).toBe(1)
    for (const { result, setCookies } of reloads) {
      expect(result).toEqual(user)
      expect(setCookies).toHaveLength(2)
    }
  })
})
