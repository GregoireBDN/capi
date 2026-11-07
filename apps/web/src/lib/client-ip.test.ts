import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_TRUSTED_PROXIES,
  compileTrustedProxies,
  parseTrustedProxies,
  resolveClientIp,
  trustedProxies,
} from './client-ip'

const CADDY = '172.20.0.2'
const CLIENT = '100.101.102.103'

describe('parseTrustedProxies', () => {
  it('splits and trims a comma-separated list', () => {
    expect(parseTrustedProxies(' loopback , 172.20.0.0/16,,10.0.0.1 ')).toEqual(
      ['loopback', '172.20.0.0/16', '10.0.0.1'],
    )
  })

  it('trusts nobody for "none" or an empty value', () => {
    expect(parseTrustedProxies('none')).toEqual([])
    expect(parseTrustedProxies('')).toEqual([])
  })
})

describe('compileTrustedProxies', () => {
  it('trusts loopback and private ranges by default, not public or tailnet IPs', () => {
    const trust = compileTrustedProxies(DEFAULT_TRUSTED_PROXIES)
    expect(trust('127.0.0.1', 0)).toBe(true)
    expect(trust('::1', 0)).toBe(true)
    expect(trust('172.20.0.2', 0)).toBe(true)
    expect(trust('192.168.1.10', 0)).toBe(true)
    expect(trust('10.1.2.3', 0)).toBe(true)
    expect(trust('100.101.102.103', 0)).toBe(false)
    expect(trust('203.0.113.7', 0)).toBe(false)
  })

  it('throws an explicit error on an invalid entry', () => {
    expect(() => compileTrustedProxies('caddy')).toThrow(
      /Invalid TRUSTED_PROXIES/,
    )
  })
})

describe('resolveClientIp', () => {
  const trust = compileTrustedProxies(DEFAULT_TRUSTED_PROXIES)

  it('takes the header from a trusted proxy', () => {
    expect(resolveClientIp(CADDY, CLIENT, trust)).toBe(CLIENT)
  })

  it('ignores the header from an untrusted peer', () => {
    expect(resolveClientIp(CLIENT, '203.0.113.99', trust)).toBe(CLIENT)
  })

  it('stops at the first untrusted hop from the right', () => {
    expect(resolveClientIp(CADDY, `203.0.113.99, ${CLIENT}`, trust)).toBe(
      CLIENT,
    )
  })

  it('walks through several trusted hops', () => {
    expect(resolveClientIp('127.0.0.1', `${CLIENT}, ${CADDY}`, trust)).toBe(
      CLIENT,
    )
  })

  it('handles IPv6 and IPv4-mapped addresses', () => {
    expect(resolveClientIp('::ffff:172.20.0.2', '2001:db8::1', trust)).toBe(
      '2001:db8::1',
    )
  })

  it('falls back to the last trusted hop on a malformed entry', () => {
    expect(resolveClientIp(CADDY, 'unknown', trust)).toBe(CADDY)
  })

  it('returns undefined without a socket address', () => {
    expect(resolveClientIp(undefined, CLIENT, trust)).toBeUndefined()
  })
})

describe('trustedProxies (TRUSTED_PROXIES env)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to loopback and private ranges', () => {
    vi.stubEnv('TRUSTED_PROXIES', undefined)
    expect(trustedProxies()(CADDY, 0)).toBe(true)
  })

  it('follows the configured value', () => {
    vi.stubEnv('TRUSTED_PROXIES', '172.30.0.0/16')
    expect(trustedProxies()(CADDY, 0)).toBe(false)
    expect(trustedProxies()('172.30.0.5', 0)).toBe(true)
  })
})
