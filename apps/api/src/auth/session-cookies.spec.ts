import fastifyCookie from '@fastify/cookie'
import Fastify from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearSessionCookies,
  readAccessCookie,
  readRefreshCookie,
  sessionCookieConfig,
  setSessionCookies,
  type SessionCookieConfig,
} from './session-cookies'

/**
 * Session cookie names (#217, ASVS 3.4.4): `__Host-` in production with a
 * one-release migration from the plain names, plain names over HTTP (dev).
 * Driven through Fastify so the `Set-Cookie` headers are the real ones.
 */

const production = sessionCookieConfig(true)
const development = sessionCookieConfig(false)

let apps: ReturnType<typeof Fastify>[] = []
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()))
  apps = []
})

async function server(config: SessionCookieConfig) {
  const app = Fastify()
  apps.push(app)
  await app.register(fastifyCookie)
  app.post('/set', (_req, reply) => {
    setSessionCookies(reply, { accessToken: 'a1', refreshToken: 'r1' }, config)
    return { ok: true }
  })
  app.post('/clear', (_req, reply) => {
    clearSessionCookies(reply, config)
    return { ok: true }
  })
  app.get('/read', (req) => ({
    access: readAccessCookie(req, config) ?? null,
    refresh: readRefreshCookie(req, config) ?? null,
  }))
  return app
}

const setCookies = (headers: Record<string, unknown>): string[] => {
  const value = headers['set-cookie']
  return Array.isArray(value) ? (value as string[]) : [value as string]
}

describe('session cookies in production', () => {
  it('names them __Host- with Secure, Path=/ and no Domain', async () => {
    const app = await server(production)
    const res = await app.inject({ method: 'POST', url: '/set' })

    const cookies = setCookies(res.headers)
    const access = cookies.find((c) => c.startsWith('__Host-token=a1'))
    const refresh = cookies.find((c) => c.startsWith('__Host-refresh_token=r1'))
    for (const cookie of [access, refresh]) {
      expect(cookie).toBeDefined()
      expect(cookie).toMatch(/; Secure/)
      expect(cookie).toMatch(/; Path=\/(;|$)/)
      expect(cookie).toMatch(/; HttpOnly/)
      expect(cookie).toMatch(/; SameSite=Lax/)
      expect(cookie).not.toMatch(/Domain=/i)
    }
  })

  it('clears the unprefixed pair and the legacy path before setting the new pair', async () => {
    const app = await server(production)
    const res = await app.inject({ method: 'POST', url: '/set' })

    const cookies = setCookies(res.headers)
    const names = cookies.map((c) => c.split('=')[0])
    expect(names).toEqual([
      'refresh_token',
      'token',
      'refresh_token',
      '__Host-token',
      '__Host-refresh_token',
    ])
    const cleared = cookies.slice(0, 3)
    for (const cookie of cleared) expect(cookie).toMatch(/Max-Age=0|Expires=/)
    expect(cleared[0]).toMatch(/Path=\/api\/auth/)
    expect(cleared[1]).toMatch(/Path=\/(;|$)/)
    expect(cleared[2]).toMatch(/Path=\/(;|$)/)
  })

  it('clears both pairs on logout', async () => {
    const app = await server(production)
    const res = await app.inject({ method: 'POST', url: '/clear' })

    const names = setCookies(res.headers).map((c) => c.split('=')[0])
    expect(names.sort()).toEqual(
      [
        '__Host-refresh_token',
        '__Host-token',
        'refresh_token',
        'refresh_token',
        'token',
      ].sort(),
    )
  })

  it('reads the access token from the prefixed cookie only', async () => {
    const app = await server(production)
    const legacy = await app.inject({
      url: '/read',
      headers: { cookie: 'token=old' },
    })
    expect(legacy.json()).toMatchObject({ access: null })

    const current = await app.inject({
      url: '/read',
      headers: { cookie: 'token=tossed; __Host-token=a1' },
    })
    expect(current.json()).toMatchObject({ access: 'a1' })
  })

  it('migrates: reads the unprefixed refresh cookie only when the prefixed one is missing', async () => {
    const app = await server(production)
    const legacy = await app.inject({
      url: '/read',
      headers: { cookie: 'refresh_token=old' },
    })
    expect(legacy.json()).toMatchObject({ refresh: 'old' })

    const both = await app.inject({
      url: '/read',
      headers: { cookie: 'refresh_token=tossed; __Host-refresh_token=r1' },
    })
    expect(both.json()).toMatchObject({ refresh: 'r1' })
  })
})

describe('session cookies over HTTP (development)', () => {
  it('keeps the plain names, without Secure', async () => {
    const app = await server(development)
    const res = await app.inject({ method: 'POST', url: '/set' })

    const cookies = setCookies(res.headers)
    expect(cookies.map((c) => c.split('=')[0])).toEqual([
      'refresh_token',
      'token',
      'refresh_token',
    ])
    expect(cookies[0]).toMatch(/Path=\/api\/auth/)
    for (const cookie of cookies) expect(cookie).not.toMatch(/Secure/)
  })

  it('reads the plain names', async () => {
    const app = await server(development)
    const res = await app.inject({
      url: '/read',
      headers: { cookie: 'token=a1; refresh_token=r1' },
    })
    expect(res.json()).toEqual({ access: 'a1', refresh: 'r1' })
  })
})
