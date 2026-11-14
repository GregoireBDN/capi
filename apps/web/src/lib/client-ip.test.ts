import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_TRUSTED_PROXIES,
  TRUSTED_PROXY_REFRESH_MS,
  TrustedProxies,
  compileTrustedProxies,
  parseTrustedProxies,
  resolveClientIp,
  splitTrustedProxies,
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
    expect(() => compileTrustedProxies('10.0.0.0/99')).toThrow(
      /Invalid TRUSTED_PROXIES/,
    )
    expect(() => compileTrustedProxies('caddy')).toThrow(/need DNS resolution/)
  })
})

describe('splitTrustedProxies', () => {
  it('tells host names from IPs, ranges and keywords', () => {
    expect(
      splitTrustedProxies(
        'Caddy, loopback, 10.0.0.1, 172.20.0.0/16, ::1, proxy.internal',
      ),
    ).toEqual({
      addresses: ['loopback', '10.0.0.1', '172.20.0.0/16', '::1'],
      hostNames: ['caddy', 'proxy.internal'],
    })
  })

  it('keeps invalid entries as addresses so they are refused', () => {
    expect(() => new TrustedProxies('caddy, bad_name!')).toThrow(
      /Invalid TRUSTED_PROXIES/,
    )
  })
})

describe('TrustedProxies (host names)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function setup(answers: (string[] | Error)[]) {
    const lookup = vi.fn((_hostName: string) => {
      const answer = answers.length > 1 ? answers.shift()! : answers[0]
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(answer)
    })
    const warn = vi.fn()
    const proxies = new TrustedProxies('caddy', { lookup, warn })
    return { proxies, lookup, warn }
  }

  it('trusts the resolved address only, once it is resolved', async () => {
    const { proxies, lookup } = setup([[CADDY]])
    expect(proxies.trust(CADDY, 0)).toBe(false)
    await proxies.refresh()
    expect(lookup).toHaveBeenCalledWith('caddy')
    expect(proxies.trust(CADDY, 0)).toBe(true)
    expect(proxies.trust(`::ffff:${CADDY}`, 0)).toBe(true)
    // A neighbour container on the same network is not trusted.
    expect(proxies.trust('172.20.0.9', 0)).toBe(false)
    expect(resolveClientIp('172.20.0.9', '203.0.113.99', proxies.trust)).toBe(
      '172.20.0.9',
    )
    expect(resolveClientIp(CADDY, CLIENT, proxies.trust)).toBe(CLIENT)
  })

  it('resolves again every 30 s and follows a restarted Caddy', async () => {
    vi.useFakeTimers()
    const { proxies, lookup } = setup([[CADDY], ['172.20.0.7']])
    proxies.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(proxies.trust(CADDY, 0)).toBe(true)

    await vi.advanceTimersByTimeAsync(TRUSTED_PROXY_REFRESH_MS - 1)
    expect(lookup).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(lookup).toHaveBeenCalledTimes(2)
    expect(proxies.trust(CADDY, 0)).toBe(false)
    expect(proxies.trust('172.20.0.7', 0)).toBe(true)
    proxies.stop()
  })

  it('trusts nobody while the name does not resolve, warning once without an IP', async () => {
    const { proxies, warn } = setup([
      [CADDY],
      new Error('getaddrinfo ENOTFOUND caddy'),
      new Error('getaddrinfo ENOTFOUND caddy'),
      [CADDY],
      [],
    ])
    await proxies.refresh()
    expect(proxies.trust(CADDY, 0)).toBe(true)

    await proxies.refresh()
    await proxies.refresh()
    expect(proxies.trust(CADDY, 0)).toBe(false)
    expect(resolveClientIp(CADDY, CLIENT, proxies.trust)).toBe(CADDY)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('"caddy" does not resolve')
    expect(warn.mock.calls[0][0]).not.toMatch(/\d+\.\d+\.\d+\.\d+/)

    await proxies.refresh()
    expect(proxies.trust(CADDY, 0)).toBe(true)
    // An empty answer counts as a failure too, and warns again.
    await proxies.refresh()
    expect(proxies.trust(CADDY, 0)).toBe(false)
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('keeps IP and range entries trusted alongside host names', async () => {
    const { lookup, warn } = setup([new Error('ENOTFOUND')])
    const proxies = new TrustedProxies('loopback, caddy', { lookup, warn })
    await proxies.refresh()
    expect(proxies.trust('127.0.0.1', 0)).toBe(true)
    expect(proxies.trust(CADDY, 0)).toBe(false)
  })

  it('does not start a timer without host names', () => {
    vi.useFakeTimers()
    const lookup = vi.fn()
    new TrustedProxies('loopback', { lookup }).start()
    vi.advanceTimersByTime(TRUSTED_PROXY_REFRESH_MS * 2)
    expect(lookup).not.toHaveBeenCalled()
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
