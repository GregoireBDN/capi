import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '#/config/env'
import { AuthService } from './auth.service'

// Mutable copy of the validated env, so tests can switch SMTP on and off.
vi.mock('#/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/config/env')>()
  return { ...actual, env: { ...actual.env } }
})

const mockDb: Record<string, ReturnType<typeof vi.fn>> = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  execute: vi.fn(),
  // Run the callback against the same stub, as if it were the transaction.
  transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(mockDb)),
}

const mockEmail = {
  sendPasswordReset: vi.fn(),
  sendEmailVerification: vi.fn(),
}

const mockJwt = {
  sign: vi.fn(() => 'mock-token'),
  verify: vi.fn(() => ({ sub: 'user-id' })),
}

function buildChain(result: unknown[]) {
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.limit = vi.fn(() => chain)
  chain.returning = vi.fn(() => Promise.resolve(result))
  chain.values = vi.fn(() => chain)
  chain.set = vi.fn(() => chain)
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(result).then(resolve)
  return chain
}

describe('AuthService', () => {
  let service: AuthService

  beforeEach(() => {
    vi.clearAllMocks()
    env.smtpEnabled = true
    service = new AuthService(
      { db: mockDb } as never,
      mockJwt as unknown as JwtService,
      mockEmail as never,
    )
  })

  describe('isRegistrationOpen', () => {
    it('is open while no user exists', async () => {
      mockDb.select.mockReturnValue(buildChain([]))

      await expect(service.isRegistrationOpen()).resolves.toBe(true)
    })

    it('is closed once a user exists', async () => {
      mockDb.select.mockReturnValue(buildChain([{ id: 'owner-id' }]))

      await expect(service.isRegistrationOpen()).resolves.toBe(false)
    })
  })

  describe('register', () => {
    const dto = {
      email: 'new@test.com',
      name: 'New User',
      password: 'password123',
    }

    it('throws ForbiddenException when a user already exists', async () => {
      mockDb.select.mockReturnValue(buildChain([{ id: 'owner-id' }]))

      await expect(service.register(dto)).rejects.toThrow(ForbiddenException)
      expect(mockDb.transaction).not.toHaveBeenCalled()
      expect(mockDb.insert).not.toHaveBeenCalled()
      expect(mockEmail.sendEmailVerification).not.toHaveBeenCalled()
    })

    it('rejects when another sign-up wins the race (re-check under the lock)', async () => {
      mockDb.select
        .mockReturnValueOnce(buildChain([])) // pre-check: empty table
        .mockReturnValueOnce(buildChain([{ id: 'owner-id' }])) // under the lock
      await expect(service.register(dto)).rejects.toThrow(ForbiddenException)
      expect(mockDb.execute).toHaveBeenCalledOnce() // advisory lock taken
      expect(mockDb.insert).not.toHaveBeenCalled()
    })

    it('creates the first account and returns an access + refresh token pair', async () => {
      mockDb.select.mockReturnValue(buildChain([]))
      mockDb.insert.mockReturnValue(
        buildChain([{ id: 'new-id', email: 'new@test.com' }]),
      )

      const tokens = await service.register(dto)

      expect(mockDb.transaction).toHaveBeenCalledOnce()
      expect(mockDb.execute).toHaveBeenCalledOnce()
      expect(tokens.accessToken).toBe('mock-token')
      expect(tokens.refreshToken).toMatch(/^[a-f0-9]{64}$/) // 32 random bytes, hex
      expect(mockJwt.sign).toHaveBeenCalledWith(
        { sub: 'new-id' },
        expect.any(Object),
      )
    })

    it('leaves the account unverified and sends a verification email when SMTP is on', async () => {
      mockDb.select.mockReturnValue(buildChain([]))
      const userChain = buildChain([{ id: 'new-id', email: 'new@test.com' }])
      const tokenChain = buildChain([])
      mockDb.insert.mockReturnValueOnce(userChain).mockReturnValue(tokenChain)

      await service.register(dto)

      expect(userChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@test.com',
          emailVerifiedAt: null,
        }),
      )
      expect(mockEmail.sendEmailVerification).toHaveBeenCalledOnce()
    })

    it('creates the owner already verified and sends no email when SMTP is off', async () => {
      env.smtpEnabled = false
      mockDb.select.mockReturnValue(buildChain([]))
      const userChain = buildChain([{ id: 'new-id', email: 'new@test.com' }])
      mockDb.insert.mockReturnValue(userChain)

      await service.register(dto)

      expect(userChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
      )
      expect(mockEmail.sendEmailVerification).not.toHaveBeenCalled()
    })
  })

  describe('getUser', () => {
    const unverified = {
      id: 'owner-id',
      email: 'owner@test.com',
      emailVerifiedAt: null,
    }

    it('returns the user unchanged when SMTP is on', async () => {
      mockDb.select.mockReturnValue(buildChain([unverified]))

      await expect(service.getUser('owner-id')).resolves.toEqual(unverified)
      expect(mockDb.update).not.toHaveBeenCalled()
    })

    it('marks an unverified owner verified when SMTP is off', async () => {
      env.smtpEnabled = false
      mockDb.select.mockReturnValue(buildChain([unverified]))
      const updateChain = buildChain([])
      mockDb.update.mockReturnValue(updateChain)

      const user = await service.getUser('owner-id')

      expect(user?.emailVerifiedAt).toBeInstanceOf(Date)
      expect(updateChain.set).toHaveBeenCalledWith({
        emailVerifiedAt: expect.any(Date),
      })
    })

    it('does not write for an already verified owner', async () => {
      env.smtpEnabled = false
      const verified = {
        ...unverified,
        emailVerifiedAt: new Date('2026-01-01'),
      }
      mockDb.select.mockReturnValue(buildChain([verified]))

      await expect(service.getUser('owner-id')).resolves.toEqual(verified)
      expect(mockDb.update).not.toHaveBeenCalled()
    })

    it('returns undefined for an unknown user', async () => {
      env.smtpEnabled = false
      mockDb.select.mockReturnValue(buildChain([]))

      await expect(service.getUser('missing')).resolves.toBeUndefined()
      expect(mockDb.update).not.toHaveBeenCalled()
    })
  })

  describe('login', () => {
    it('throws UnauthorizedException when user not found', async () => {
      mockDb.select.mockReturnValue(buildChain([]))

      await expect(
        service.login({ email: 'nobody@test.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('throws UnauthorizedException for accounts without a password', async () => {
      mockDb.select.mockReturnValue(
        buildChain([{ id: 'id', passwordHash: null }]),
      )

      await expect(
        service.login({
          email: 'nopassword@test.com',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('forgotPassword', () => {
    it('does nothing silently when user not found', async () => {
      mockDb.select.mockReturnValue(buildChain([]))

      await expect(
        service.forgotPassword({ email: 'nobody@test.com' }),
      ).resolves.toBeUndefined()

      expect(mockEmail.sendPasswordReset).not.toHaveBeenCalled()
    })

    it('does nothing silently for accounts without a password', async () => {
      mockDb.select.mockReturnValue(
        buildChain([
          { id: 'id', email: 'nopassword@test.com', passwordHash: null },
        ]),
      )

      await service.forgotPassword({ email: 'nopassword@test.com' })

      expect(mockEmail.sendPasswordReset).not.toHaveBeenCalled()
    })

    it('sends a reset email for password accounts', async () => {
      mockDb.select.mockReturnValue(
        buildChain([
          { id: 'user-id', email: 'user@test.com', passwordHash: 'hash' },
        ]),
      )
      mockDb.insert.mockReturnValue(buildChain([{}]))

      await service.forgotPassword({ email: 'user@test.com' })

      expect(mockEmail.sendPasswordReset).toHaveBeenCalledWith(
        'user@test.com',
        expect.stringContaining('/reset-password?token='),
      )
    })
  })
})
