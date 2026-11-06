import { describe, expect, it } from 'vitest'

import {
  API_CACHE_HEADERS,
  PAGE_CACHE_HEADERS,
  cacheHeadersFor,
  withCacheHeaders,
} from './cache-policy'

describe('cacheHeadersFor', () => {
  it.each(['/api', '/api/auth/me', '/api/auth/logout', '/api/health'])(
    'never stores %s (mirrors the API)',
    (pathname) => {
      expect(cacheHeadersFor(pathname)).toEqual({
        'cache-control': 'no-store',
        pragma: 'no-cache',
        expires: '0',
      })
    },
  )

  it.each([
    '/dashboard',
    '/accounts/7f0c5a7e-2d1b-4c3a-9e8f-123456789abc',
    '/transactions',
    '/auth',
    '/auth/anything',
    '/reset-password',
    '/verify-email',
    '/',
    '/_serverFn/abc',
    '/apiary',
  ])('keeps %s private and unstored', (pathname) => {
    expect(cacheHeadersFor(pathname)).toEqual({
      'cache-control': 'private, no-store',
    })
  })
})

describe('withCacheHeaders', () => {
  it('overrides caching set by the page, in place', () => {
    const response = new Response('<html></html>', {
      headers: {
        'cache-control': 'public, max-age=600',
        'content-type': 'text/html',
      },
    })

    const result = withCacheHeaders(response, '/dashboard')

    expect(result).toBe(response)
    expect(result.headers.get('cache-control')).toBe(
      PAGE_CACHE_HEADERS['cache-control'],
    )
    expect(result.headers.get('content-type')).toBe('text/html')
  })

  it('keeps redirects (and their cookies) intact', () => {
    const response = new Response(null, {
      status: 307,
      headers: { location: '/auth', 'set-cookie': 'token=; Max-Age=0; Path=/' },
    })

    const result = withCacheHeaders(response, '/dashboard')

    expect(result.status).toBe(307)
    expect(result.headers.get('location')).toBe('/auth')
    expect(result.headers.getSetCookie()).toEqual(['token=; Max-Age=0; Path=/'])
    expect(result.headers.get('cache-control')).toBe('private, no-store')
  })

  it('copies responses whose headers are immutable', async () => {
    const response = Response.redirect('http://web.test/auth', 302)

    const result = withCacheHeaders(response, '/api/auth/refresh')

    expect(result.status).toBe(302)
    expect(result.headers.get('location')).toBe('http://web.test/auth')
    for (const [name, value] of Object.entries(API_CACHE_HEADERS)) {
      expect(result.headers.get(name)).toBe(value)
    }
  })
})
