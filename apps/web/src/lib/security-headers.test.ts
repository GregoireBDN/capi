import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  PERMISSIONS_POLICY,
  createCspNonce,
  crossOriginHeaders,
  keepsOpener,
  pageCspDirectives,
  pageInlineScriptHashes,
  pageSecurityHeaders,
  serializeCsp,
  serializePermissionsPolicy,
  sha256Source,
} from './security-headers'
import { INLINE_SCRIPTS, THEME_INIT_SCRIPT } from './inline-scripts'

function directivesOf(policy: string): Map<string, string[]> {
  return new Map(
    policy.split('; ').map((directive) => {
      const [name, ...sources] = directive.split(' ')
      return [name, sources]
    }),
  )
}

describe('createCspNonce', () => {
  it('returns 128 random bits in base64, different every time', () => {
    const nonces = new Set(Array.from({ length: 50 }, createCspNonce))

    expect(nonces.size).toBe(50)
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/)
    }
  })
})

describe('sha256Source', () => {
  const nodeHash = (source: string) =>
    `'sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}'`

  it('matches the hash a browser computes for an inline script', async () => {
    expect(await sha256Source(THEME_INIT_SCRIPT)).toBe(
      nodeHash(THEME_INIT_SCRIPT),
    )
  })

  it('covers each of the app inline scripts', async () => {
    expect(await pageInlineScriptHashes()).toEqual(INLINE_SCRIPTS.map(nodeHash))
  })
})

describe('pageCspDirectives', () => {
  const production = directivesOf(
    serializeCsp(
      pageCspDirectives({ nonce: 'abc', scriptHashes: ["'sha256-xyz'"] }),
    ),
  )

  it('locks down framing, plugins, base URLs and form targets', () => {
    expect(production.get('default-src')).toEqual(["'self'"])
    expect(production.get('frame-ancestors')).toEqual(["'none'"])
    expect(production.get('object-src')).toEqual(["'none'"])
    expect(production.get('base-uri')).toEqual(["'none'"])
    expect(production.get('form-action')).toEqual(["'self'"])
  })

  it('allows scripts only from the origin, the nonce and the hashes', () => {
    expect(production.get('script-src')).toEqual([
      "'self'",
      "'nonce-abc'",
      "'sha256-xyz'",
    ])
  })

  it('allows exactly what the app loads', () => {
    expect(production.get('style-src')).toEqual([
      "'self'",
      "'unsafe-inline'",
      'https://fonts.googleapis.com',
    ])
    expect(production.get('font-src')).toEqual([
      "'self'",
      'https://fonts.gstatic.com',
    ])
    expect(production.get('connect-src')).toEqual(["'self'"])
    expect(production.get('worker-src')).toEqual(["'self'"])
    expect(production.get('img-src')).toEqual(["'self'", 'data:'])
  })

  it('relaxes only what vite dev needs, in dev', () => {
    const dev = pageCspDirectives({ nonce: 'abc', scriptHashes: [], dev: true })

    expect(dev['connect-src']).toEqual(["'self'", 'ws:', 'wss:'])
    expect(dev['script-src']).not.toContain("'unsafe-inline'")
    expect(dev['frame-ancestors']).toEqual(["'none'"])
  })
})

describe('pageSecurityHeaders', () => {
  it('sends the CSP with the nonce and the theme script hash, and DENY', async () => {
    const headers = await pageSecurityHeaders('n0nce')
    const policy = directivesOf(headers['content-security-policy'] ?? '')

    expect(headers['x-frame-options']).toBe('DENY')
    expect(policy.get('script-src')).toEqual([
      "'self'",
      "'nonce-n0nce'",
      ...(await pageInlineScriptHashes()),
    ])
    expect(headers['content-security-policy']).not.toMatch(/unsafe-eval/)
  })

  it('isolates the page from other origins and denies unused features (#204)', async () => {
    const headers = await pageSecurityHeaders('n0nce')

    expect(headers['cross-origin-opener-policy']).toBe('same-origin')
    expect(headers['cross-origin-resource-policy']).toBe('same-origin')
    expect(headers['permissions-policy']).toBe(serializePermissionsPolicy())
    expect(headers).not.toHaveProperty('cross-origin-embedder-policy')
  })

  it('leaves COOP out on the OAuth consent flow', async () => {
    const headers = await pageSecurityHeaders('n0nce', { keepOpener: true })

    expect(headers).not.toHaveProperty('cross-origin-opener-policy')
    expect(headers['cross-origin-resource-policy']).toBe('same-origin')
  })
})

describe('Permissions-Policy', () => {
  const policy = new Map(
    serializePermissionsPolicy()
      .split(', ')
      .map((entry) => entry.split('=') as [string, string]),
  )

  it('keeps passkeys on the app origin only', () => {
    expect(policy.get('publickey-credentials-get')).toBe('(self)')
    expect(policy.get('publickey-credentials-create')).toBe('(self)')
  })

  it('denies the powerful features the app never uses', () => {
    for (const feature of [
      'camera',
      'microphone',
      'geolocation',
      'payment',
      'usb',
      'browsing-topics',
    ]) {
      expect(policy.get(feature)).toBe('()')
    }
  })

  it('leaves the clipboard (copying an access token) at its default', () => {
    expect(Object.keys(PERMISSIONS_POLICY)).not.toContain('clipboard-write')
  })
})

describe('keepsOpener', () => {
  const at = (path: string) => keepsOpener(new URL(path, 'https://app.test'))

  it('is true on the consent page and on sign-in returning to it', () => {
    expect(at('/oauth/authorize?client_id=c')).toBe(true)
    expect(
      at(
        `/auth?redirect=${encodeURIComponent('/oauth/authorize?client_id=c')}`,
      ),
    ).toBe(true)
  })

  it('is false anywhere else', () => {
    expect(at('/auth')).toBe(false)
    expect(at('/auth?redirect=%2Fdashboard')).toBe(false)
    expect(
      at('/auth?redirect=https%3A%2F%2Fevil.test%2Foauth%2Fauthorize%3F'),
    ).toBe(false)
    expect(at('/dashboard')).toBe(false)
    expect(crossOriginHeaders()).toHaveProperty('cross-origin-opener-policy')
  })
})
