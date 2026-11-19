import { describe, expect, it, vi } from 'vitest'
import { ConfigError } from '../config.js'
import { clientIp, compileTrustedProxies, TrustedProxies } from './client-ip.js'

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
    for (const entry of [
      'not a host',
      '10.0.0.0/33',
      '10.0.0.0/x',
      'caddy/8',
      '-caddy',
    ]) {
      expect(() => compileTrustedProxies([entry]), entry).toThrow(ConfigError)
    }
  })
})

describe('TrustedProxies with host names (#328)', () => {
  const XFF = '198.51.100.1, 203.0.113.9'

  it('trusts the addresses a host name resolves to, once resolved', async () => {
    const lookup = vi.fn(async () => ['172.20.0.5', '::ffff:172.20.0.6'])
    const proxies = new TrustedProxies(['caddy'], { lookup, warn: () => {} })
    expect(proxies.hostNames).toEqual(['caddy'])
    // Before the first resolution: nobody is trusted.
    expect(clientIp('172.20.0.5', XFF, proxies)).toBe('172.20.0.5')
    await proxies.refresh()
    expect(lookup).toHaveBeenCalledWith('caddy')
    expect(clientIp('172.20.0.5', XFF, proxies)).toBe('203.0.113.9')
    expect(clientIp('::ffff:172.20.0.6', XFF, proxies)).toBe('203.0.113.9')
    // Another container on the same network is not.
    expect(clientIp('172.20.0.9', XFF, proxies)).toBe('172.20.0.9')
  })

  it('stops trusting a name that no longer resolves, and warns once', async () => {
    const answers: string[][] = [['172.20.0.5'], [], []]
    const warn = vi.fn()
    const proxies = new TrustedProxies(['caddy', 'loopback'], {
      lookup: async () => {
        const next = answers.shift() ?? []
        if (next.length === 0) throw new Error('ENOTFOUND')
        return next
      },
      warn,
    })
    await proxies.refresh()
    expect(clientIp('172.20.0.5', XFF, proxies)).toBe('203.0.113.9')
    await proxies.refresh()
    await proxies.refresh()
    expect(clientIp('172.20.0.5', XFF, proxies)).toBe('172.20.0.5')
    expect(clientIp('127.0.0.1', XFF, proxies)).toBe('203.0.113.9')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('"caddy"')
  })

  it('refreshes on a timer only when there are host names', async () => {
    vi.useFakeTimers()
    try {
      const lookup = vi.fn(async () => ['172.20.0.5'])
      new TrustedProxies(['loopback'], { lookup }).start()
      const named = new TrustedProxies(['caddy'], { lookup, refreshMs: 1000 })
      named.start()
      expect(lookup).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(2500)
      expect(lookup).toHaveBeenCalledTimes(3)
      named.stop()
      await vi.advanceTimersByTimeAsync(5000)
      expect(lookup).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })
})
