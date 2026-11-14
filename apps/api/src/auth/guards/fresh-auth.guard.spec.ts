import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { FRESH_AUTH_MAX_AGE_SECONDS } from '#/auth/auth.constants'
import { assertFreshSession } from './fresh-auth.guard'

describe('assertFreshSession', () => {
  const now = new Date('2026-11-14T12:00:00Z')
  const nowSeconds = Math.floor(now.getTime() / 1000)
  const check = (authTime?: number) => () =>
    assertFreshSession({ sub: 'user-1', authTime }, now)

  it('accepts a sign-in within the fresh window', () => {
    expect(check(nowSeconds)).not.toThrow()
    expect(check(nowSeconds - FRESH_AUTH_MAX_AGE_SECONDS)).not.toThrow()
  })

  it('accepts a little clock skew', () => {
    expect(check(nowSeconds + 60)).not.toThrow()
  })

  it.each([
    ['older than the window', nowSeconds - FRESH_AUTH_MAX_AGE_SECONDS - 1],
    ['too far in the future', nowSeconds + 61],
    ['without auth_time (access token, old session)', undefined],
  ])('refuses a sign-in %s', (_label, authTime) => {
    expect(check(authTime)).toThrow(ForbiddenException)
  })

  it('refuses a request without a user', () => {
    expect(() => assertFreshSession(undefined, now)).toThrow(ForbiddenException)
  })
})
