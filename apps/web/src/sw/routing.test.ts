import { describe, expect, it } from 'vitest'
import {
  OFFLINE_URL,
  routeRequest,
  shellCacheName,
  staleCaches,
} from './routing'
import type { SwRequest } from './routing'

const origin = 'https://capi.example.test'
const precached = new Set([
  '/assets/main-abc123.js',
  '/assets/globals-def456.css',
  '/icons/icon-192.png',
  OFFLINE_URL,
])

function route(path: string, init: Partial<SwRequest> = {}) {
  return routeRequest(
    { url: `${origin}${path}`, method: 'GET', mode: 'no-cors', ...init },
    { origin, precached },
  )
}

describe('routeRequest', () => {
  it('serves precached shell assets from the cache', () => {
    expect(route('/assets/main-abc123.js')).toBe('precache')
    expect(route('/assets/globals-def456.css', { mode: 'cors' })).toBe(
      'precache',
    )
    expect(route('/icons/icon-192.png')).toBe('precache')
  })

  it('sends page navigations to the network with the offline fallback', () => {
    for (const path of ['/dashboard', '/transactions?page=2', '/', '/auth']) {
      expect(route(path, { mode: 'navigate' })).toBe('navigate')
    }
  })

  it('never intercepts the API, whatever the method or mode', () => {
    expect(route('/api/transactions')).toBe('passthrough')
    expect(route('/api/auth/me', { mode: 'cors' })).toBe('passthrough')
    expect(route('/api', { mode: 'navigate' })).toBe('passthrough')
    expect(route('/api/imports/preview', { method: 'POST' })).toBe(
      'passthrough',
    )
  })

  it('does not treat lookalike paths as the API', () => {
    expect(route('/apix', { mode: 'navigate' })).toBe('navigate')
  })

  it('ignores non-GET requests', () => {
    expect(route('/assets/main-abc123.js', { method: 'HEAD' })).toBe(
      'passthrough',
    )
    expect(route('/dashboard', { method: 'POST', mode: 'navigate' })).toBe(
      'passthrough',
    )
  })

  it('ignores cross-origin requests', () => {
    expect(
      routeRequest(
        {
          url: 'https://fonts.example.com/assets/main-abc123.js',
          method: 'GET',
          mode: 'no-cors',
        },
        { origin, precached },
      ),
    ).toBe('passthrough')
  })

  it('does not cache same-origin URLs outside the precache', () => {
    expect(route('/assets/unknown-000000.js')).toBe('passthrough')
    expect(route('/robots.txt')).toBe('passthrough')
    expect(route('/_serverFn/abc')).toBe('passthrough')
    // Query strings never match a precached file.
    expect(route('/assets/main-abc123.js?v=2')).toBe('passthrough')
  })

  it('passes malformed URLs through', () => {
    expect(
      routeRequest(
        { url: 'not a url', method: 'GET', mode: 'no-cors' },
        { origin, precached },
      ),
    ).toBe('passthrough')
  })
})

describe('staleCaches', () => {
  it('deletes every cache but the current shell cache', () => {
    const current = shellCacheName('new123')
    expect(
      staleCaches([shellCacheName('old456'), current, 'unexpected'], current),
    ).toEqual([shellCacheName('old456'), 'unexpected'])
  })

  it('deletes the shell caches named before #464 (finances-shell-)', () => {
    const current = shellCacheName('new123')
    expect(current.startsWith('capi-shell-')).toBe(true)
    expect(staleCaches(['finances-shell-old456', current], current)).toEqual([
      'finances-shell-old456',
    ])
  })
})
