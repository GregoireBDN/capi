import { describe, expect, it } from 'vitest'
import { safeReturnPath } from './post-login'

describe('safeReturnPath', () => {
  it('keeps the consent page with its query', () => {
    expect(
      safeReturnPath('/oauth/authorize?client_id=fin_cli_x&state=a%20b'),
    ).toBe('/oauth/authorize?client_id=fin_cli_x&state=a%20b')
  })

  it.each([
    undefined,
    '',
    '/dashboard',
    '/oauth/authorize',
    'https://evil.example/oauth/authorize?x=1',
    '//evil.example/oauth/authorize?x=1',
    '/oauth/authorize/../../dashboard?x=1',
    '/oauth/authorizex?x=1',
  ])('refuses %s', (value) => {
    expect(safeReturnPath(value)).toBeNull()
  })
})
