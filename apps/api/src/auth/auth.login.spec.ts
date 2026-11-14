import { UnauthorizedException } from '@nestjs/common'
import type { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthService } from './auth.service'

vi.mock('bcryptjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bcryptjs')>()
  return {
    ...actual,
    compare: vi.fn(() => Promise.resolve(false)),
    hash: vi.fn(() => Promise.resolve('$2a$10$synthetic-dummy-hash')),
  }
})

/** Select chain stub resolving to `rows`. */
const selectReturning = (rows: unknown[]) => {
  const chain: Record<string, unknown> = {}
  chain.from = () => chain
  chain.where = () => chain
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve)
  return chain
}

describe('AuthService.login timing', () => {
  const db = { select: vi.fn() }
  const service = new AuthService(
    { db } as never,
    { sign: vi.fn() } as unknown as JwtService,
    {} as never,
  )

  beforeEach(() => vi.clearAllMocks())

  it('runs bcrypt for an unknown email too, then refuses it like a wrong password', async () => {
    db.select.mockReturnValue(selectReturning([]))

    await expect(
      service.login({ email: 'nobody@example.test', password: 'whatever-pw' }),
    ).rejects.toThrow(UnauthorizedException)

    expect(bcrypt.compare).toHaveBeenCalledTimes(1)
    expect(bcrypt.compare).toHaveBeenCalledWith(
      'whatever-pw',
      '$2a$10$synthetic-dummy-hash',
    )
  })

  it('runs bcrypt once for a wrong password', async () => {
    db.select.mockReturnValue(
      selectReturning([{ id: 'user-1', passwordHash: '$2a$10$stored' }]),
    )

    await expect(
      service.login({ email: 'owner@example.test', password: 'wrong-pw' }),
    ).rejects.toThrow(UnauthorizedException)

    expect(bcrypt.compare).toHaveBeenCalledTimes(1)
    expect(bcrypt.compare).toHaveBeenCalledWith('wrong-pw', '$2a$10$stored')
  })
})
