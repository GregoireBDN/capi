import { describe, expect, it } from 'vitest'
import { ApiRequestError } from '#/lib/queries'
import { needsReauth } from './reauth'

describe('needsReauth', () => {
  it('spots the API refusal for a stale session', () => {
    expect(
      needsReauth(new ApiRequestError(403, 'Recent authentication required')),
    ).toBe(true)
  })

  it.each([
    ['another 403', new ApiRequestError(403, 'Insufficient scope')],
    ['a 401', new ApiRequestError(401, 'Recent authentication required')],
    ['a network failure', new ApiRequestError(null, null)],
    ['any other error', new Error('Recent authentication required')],
  ])('ignores %s', (_label, error) => {
    expect(needsReauth(error)).toBe(false)
  })
})
