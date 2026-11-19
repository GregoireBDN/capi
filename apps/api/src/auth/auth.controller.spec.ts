import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_ERRORS } from './auth.constants'
import { AuthController } from './auth.controller'
import type { AuthService } from './auth.service'

/**
 * Single-user registration lock, at the HTTP boundary: the status endpoint
 * mirrors `AuthService.isRegistrationOpen`, and a closed instance rejects
 * `register` without setting any session cookie.
 */

const authService = {
  getUser: vi.fn(),
  isRegistrationOpen: vi.fn(),
  register: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeSession: vi.fn(),
}

function createReply() {
  const reply = {
    cookie: vi.fn(() => reply),
    header: vi.fn(() => reply),
    clearCookie: vi.fn(() => reply),
    status: vi.fn(() => reply),
    send: vi.fn(() => Promise.resolve(reply)),
  }
  return reply
}

describe('AuthController registration lock', () => {
  let controller: AuthController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new AuthController(authService as unknown as AuthService)
  })

  it('reports registration as open while no account exists', async () => {
    authService.isRegistrationOpen.mockResolvedValue(true)

    await expect(controller.registrationStatus()).resolves.toEqual({
      open: true,
    })
  })

  it('reports registration as closed once the owner account exists', async () => {
    authService.isRegistrationOpen.mockResolvedValue(false)

    await expect(controller.registrationStatus()).resolves.toEqual({
      open: false,
    })
  })

  it('propagates a 403 from register and sets no session cookie', async () => {
    authService.register.mockRejectedValue(
      new ForbiddenException(AUTH_ERRORS.REGISTRATION_CLOSED),
    )
    const reply = createReply()

    const error = await controller
      .register(
        {
          email: 'intruder@test.com',
          name: 'Intruder',
          password: 'password123',
        },
        reply as unknown as FastifyReply,
      )
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ForbiddenException)
    expect((error as ForbiddenException).getStatus()).toBe(403)
    expect(reply.cookie).not.toHaveBeenCalled()
    expect(reply.send).not.toHaveBeenCalled()
  })

  it('sets the session cookies and replies 201 when registration succeeds', async () => {
    authService.register.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
    })
    const reply = createReply()

    await controller.register(
      { email: 'owner@test.com', name: 'Owner', password: 'password123' },
      reply as unknown as FastifyReply,
    )

    expect(reply.cookie).toHaveBeenCalledTimes(2)
    expect(reply.status).toHaveBeenCalledWith(201)
    expect(reply.send).toHaveBeenCalledWith({ success: true })
  })
})

describe('AuthController session cookies', () => {
  let controller: AuthController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new AuthController(authService as unknown as AuthService)
  })

  it('rotates the refresh cookie at path / (visible to the web SSR guard) and clears the legacy /api/auth one', async () => {
    authService.rotateRefreshToken.mockResolvedValue({
      accessToken: 'a2',
      refreshToken: 'r2',
    })
    const reply = createReply()

    await controller.refresh(
      { cookies: { refresh_token: 'r1' } } as unknown as FastifyRequest,
      reply as unknown as FastifyReply,
    )

    expect(authService.rotateRefreshToken).toHaveBeenCalledWith('r1')
    expect(reply.cookie).toHaveBeenCalledWith(
      'token',
      'a2',
      expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'lax' }),
    )
    expect(reply.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'r2',
      expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'lax' }),
    )
    expect(reply.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ path: '/api/auth' }),
    )
    // The legacy cookie is cleared before the new one is set.
    const clearOrder = reply.clearCookie.mock.invocationCallOrder[0]!
    const setOrder = Math.min(...reply.cookie.mock.invocationCallOrder)
    expect(clearOrder).toBeLessThan(setOrder)
  })

  it('rejects a refresh without a refresh cookie', async () => {
    const reply = createReply()

    await expect(
      controller.refresh(
        { cookies: {} } as unknown as FastifyRequest,
        reply as unknown as FastifyReply,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException)
    expect(authService.rotateRefreshToken).not.toHaveBeenCalled()
  })

  it('revokes the session and clears both cookies (current and legacy paths) on logout', async () => {
    const reply = createReply()

    await controller.logout(
      { cookies: { refresh_token: 'r1' } } as unknown as FastifyRequest,
      reply as unknown as FastifyReply,
    )

    expect(authService.revokeSession).toHaveBeenCalledWith('r1')
    expect(reply.clearCookie).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ path: '/' }),
    )
    expect(reply.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ path: '/' }),
    )
    expect(reply.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ path: '/api/auth' }),
    )
    expect(reply.header).toHaveBeenCalledWith('Clear-Site-Data', '"cache"')
  })
})

describe('AuthController me', () => {
  it('answers 401 when the token outlives its user', async () => {
    authService.getUser.mockResolvedValue(undefined)
    const controller = new AuthController(authService as unknown as AuthService)
    const req = { user: { sub: 'gone' } } as unknown as FastifyRequest
    await expect(controller.me(req)).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })
})
