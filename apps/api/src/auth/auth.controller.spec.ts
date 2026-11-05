import { ForbiddenException } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
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
  isRegistrationOpen: vi.fn(),
  register: vi.fn(),
}

function createReply() {
  const reply = {
    cookie: vi.fn(() => reply),
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

    await expect(controller.registrationStatus()).resolves.toEqual({ open: true })
  })

  it('reports registration as closed once the owner account exists', async () => {
    authService.isRegistrationOpen.mockResolvedValue(false)

    await expect(controller.registrationStatus()).resolves.toEqual({ open: false })
  })

  it('propagates a 403 from register and sets no session cookie', async () => {
    authService.register.mockRejectedValue(
      new ForbiddenException(AUTH_ERRORS.REGISTRATION_CLOSED),
    )
    const reply = createReply()

    const error = await controller
      .register(
        { email: 'intruder@test.com', name: 'Intruder', password: 'password123' },
        reply as unknown as FastifyReply,
      )
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ForbiddenException)
    expect((error as ForbiddenException).getStatus()).toBe(403)
    expect(reply.cookie).not.toHaveBeenCalled()
    expect(reply.send).not.toHaveBeenCalled()
  })

  it('sets the session cookies and replies 201 when registration succeeds', async () => {
    authService.register.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' })
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
