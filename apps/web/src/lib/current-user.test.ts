import { describe, expect, it } from 'vitest'
import type { UserDto } from '#/api/types.gen'
import { currentUserFromResult } from './current-user'

const user = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Owner Test',
  email: 'owner@example.test',
} as UserDto

describe('currentUserFromResult', () => {
  it('returns the signed-in user', () => {
    expect(
      currentUserFromResult({ data: user, response: new Response() }),
    ).toBe(user)
  })

  it('returns null when the API answers that nobody is signed in', () => {
    expect(
      currentUserFromResult({
        error: { message: 'Unauthorized' },
        response: new Response(null, { status: 401 }),
      }),
    ).toBeNull()
  })

  it('throws instead of signing the owner out when the API is unreachable', () => {
    const offline = new TypeError('Load failed')
    expect(() => currentUserFromResult({ error: offline })).toThrow(offline)
  })
})
