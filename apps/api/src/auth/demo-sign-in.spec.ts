import { NotFoundException } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthController } from './auth.controller'
import { demoSignInAllowed } from './demo-sign-in'

/**
 * The previews' demo sign-in (#608) exists only on a `_staging` database
 * named by DEMO_STAGING_DATABASE with DEMO_AUTO_SIGN_IN=true; everywhere
 * else, production first, it is a 404 that sets no cookie.
 */

const PREVIEW = {
  enabled: true,
  databaseUrl: 'postgres://capi:secret@db:5432/finances_preview_staging',
  stagingDatabase: 'finances_preview_staging',
}

describe('demoSignInAllowed', () => {
  it('allows a preview that asked for it', () => {
    expect(demoSignInAllowed(PREVIEW)).toBe(true)
  })

  it.each([
    ['without DEMO_AUTO_SIGN_IN', { ...PREVIEW, enabled: false }],
    [
      'on production (finances, no staging database)',
      {
        enabled: true,
        databaseUrl: 'postgres://capi:secret@db:5432/finances',
        stagingDatabase: undefined,
      },
    ],
    [
      'on finances even when DEMO_STAGING_DATABASE names it',
      {
        enabled: true,
        databaseUrl: 'postgres://capi:secret@db:5432/finances',
        stagingDatabase: 'finances',
      },
    ],
    [
      'on a staging database other than the named one',
      {
        ...PREVIEW,
        databaseUrl: 'postgres://capi:secret@db:5432/finances_staging',
      },
    ],
    [
      'on a named database that is not a _staging one',
      {
        enabled: true,
        databaseUrl: 'postgres://capi:secret@db:5432/finances_demo',
        stagingDatabase: 'finances_demo',
      },
    ],
    [
      'without DEMO_STAGING_DATABASE',
      { ...PREVIEW, stagingDatabase: undefined },
    ],
    [
      'without a database name',
      { ...PREVIEW, databaseUrl: 'postgres://capi:secret@db:5432/' },
    ],
    ['on an unreadable URL', { ...PREVIEW, databaseUrl: 'not a url' }],
  ])('refuses %s', (_, config) => {
    expect(demoSignInAllowed(config)).toBe(false)
  })
})

const env = vi.hoisted(() => ({
  DEMO_AUTO_SIGN_IN: false,
  DATABASE_URL: '',
  DEMO_STAGING_DATABASE: undefined as string | undefined,
}))
vi.mock('#/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/config/env')>()
  return {
    ...actual,
    env: new Proxy(actual.env, {
      get: (t, k) =>
        k in env ? env[k as keyof typeof env] : t[k as keyof typeof t],
    }),
  }
})

describe('AuthController demo sign-in', () => {
  const authService = { signInDemo: vi.fn() }
  const reply = {
    cookie: vi.fn(() => reply),
    clearCookie: vi.fn(() => reply),
    header: vi.fn(() => reply),
    send: vi.fn(() => Promise.resolve(reply)),
  }
  const controller = new AuthController(authService as never)

  beforeEach(() => {
    vi.clearAllMocks()
    authService.signInDemo.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
    })
  })

  function configure(config: typeof PREVIEW | null) {
    env.DEMO_AUTO_SIGN_IN = config?.enabled ?? false
    env.DATABASE_URL =
      config?.databaseUrl ?? 'postgres://capi:secret@db:5432/finances'
    env.DEMO_STAGING_DATABASE = config?.stagingDatabase
  }

  it('signs the demo account in on a preview that asked for it', async () => {
    configure(PREVIEW)
    expect(controller.demoSignInStatus()).toEqual({ available: true })
    await controller.demoSignIn(reply as unknown as FastifyReply, 'Safari')
    expect(authService.signInDemo).toHaveBeenCalledWith('Safari')
    expect(reply.cookie).toHaveBeenCalled()
    expect(reply.send).toHaveBeenCalledWith({ success: true })
  })

  it('is a 404 with production settings, and never reaches the account', async () => {
    configure(null)
    env.DEMO_AUTO_SIGN_IN = true
    expect(controller.demoSignInStatus()).toEqual({ available: false })
    await expect(
      controller.demoSignIn(reply as unknown as FastifyReply),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(authService.signInDemo).not.toHaveBeenCalled()
    expect(reply.cookie).not.toHaveBeenCalled()
  })

  it('is a 404 on a preview that turned it off', async () => {
    configure({ ...PREVIEW, enabled: false })
    await expect(
      controller.demoSignIn(reply as unknown as FastifyReply),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(reply.cookie).not.toHaveBeenCalled()
  })

  it('is a 404 when the database has no demo account', async () => {
    configure(PREVIEW)
    authService.signInDemo.mockResolvedValue(null)
    await expect(
      controller.demoSignIn(reply as unknown as FastifyReply),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(reply.cookie).not.toHaveBeenCalled()
  })
})
