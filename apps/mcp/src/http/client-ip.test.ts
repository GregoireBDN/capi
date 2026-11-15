import { describe, expect, it } from 'vitest'
import { ConfigError } from '../config.js'
import { clientIp, compileTrustedProxies } from './client-ip.js'

describe('clientIp', () => {
  const loopback = compileTrustedProxies(['loopback'])

  it('uses the socket peer when it is not a trusted proxy', () => {
    expect(clientIp('203.0.113.7', '198.51.100.1', loopback)).toBe(
      '203.0.113.7',
    )
  })

  it('believes X-Forwarded-For from a trusted proxy, right-most first', () => {
    expect(clientIp('127.0.0.1', '198.51.100.1, 203.0.113.9', loopback)).toBe(
      '203.0.113.9',
    )
  })

  it('skips trusted hops and keeps a client-sent prefix out', () => {
    const proxies = compileTrustedProxies(['loopback', '10.0.0.0/8'])
    expect(
      clientIp('::ffff:127.0.0.1', '6.6.6.6, 160.79.104.10, 10.0.0.5', proxies),
    ).toBe('160.79.104.10')
  })

  it('trusts nobody with none', () => {
    expect(
      clientIp('127.0.0.1', '198.51.100.1', compileTrustedProxies(['none'])),
    ).toBe('127.0.0.1')
  })

  it('refuses an invalid entry', () => {
    expect(() => compileTrustedProxies(['caddy'])).toThrow(ConfigError)
  })
})
