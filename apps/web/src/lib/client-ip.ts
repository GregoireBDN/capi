import { isIP } from 'node:net'
import proxyAddr from '@fastify/proxy-addr'

/**
 * Client IP of a request reaching the web server, for the `/api` proxy.
 *
 * In production the browser reaches `web` through Caddy (on the shared `proxy`
 * network), which sets `X-Forwarded-For` to the client's address. That header
 * is only believed when the TCP peer is a trusted proxy; anyone else (a client
 * reaching `web` directly, or a spoofed header) gets the socket address. The
 * API applies the same rule to `web` (`apps/api/src/config/trusted-proxies.ts`),
 * so per-IP rate limits follow the real client and can't be dodged by sending
 * a made-up `X-Forwarded-For`.
 *
 * `TRUSTED_PROXIES` (runtime env, server only) is a comma-separated list of
 * IPs, CIDR ranges or the names `loopback`, `linklocal`, `uniquelocal`
 * (private ranges, which Docker networks use); `none` trusts no one. Same
 * syntax and default as the API. Narrow it to the `proxy` network's subnet
 * (`docker network inspect proxy`) to stop other containers on that network
 * from choosing their client IP.
 */

export const DEFAULT_TRUSTED_PROXIES = 'loopback,uniquelocal'

export type TrustProxyFn = (address: string, hop: number) => boolean

/** Parses a `TRUSTED_PROXIES` value into `proxy-addr` entries. */
export function parseTrustedProxies(value: string): string[] {
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return entries.length === 1 && entries[0].toLowerCase() === 'none'
    ? []
    : entries
}

/** Compiles a `TRUSTED_PROXIES` value; throws on an invalid entry. */
export function compileTrustedProxies(value: string): TrustProxyFn {
  try {
    return proxyAddr.compile(parseTrustedProxies(value))
  } catch (error) {
    throw new Error(
      `Invalid TRUSTED_PROXIES (${(error as Error).message}): expected IPs, CIDR ranges, loopback, linklocal, uniquelocal or none`,
    )
  }
}

let compiled: { value: string; trust: TrustProxyFn } | undefined

/** The trust function for the current `TRUSTED_PROXIES` (compiled once per value). */
export function trustedProxies(): TrustProxyFn {
  const value = process.env['TRUSTED_PROXIES'] ?? DEFAULT_TRUSTED_PROXIES
  if (compiled?.value !== value) {
    compiled = { value, trust: compileTrustedProxies(value) }
  }
  return compiled.trust
}

/**
 * The client IP: walk `X-Forwarded-For` from the right, starting at the socket
 * address, while the current hop is a trusted proxy (the same rule as
 * Fastify's `request.ip`). A malformed entry is never forwarded: the last
 * trusted hop is used instead.
 */
export function resolveClientIp(
  socketAddress: string | undefined,
  forwardedFor: string | null | undefined,
  trust: TrustProxyFn,
): string | undefined {
  if (!socketAddress) return undefined
  const request = {
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
    socket: { remoteAddress: socketAddress },
  } as unknown as Parameters<typeof proxyAddr.all>[0]
  const chain = proxyAddr.all(request, trust)
  for (let i = chain.length - 1; i >= 0; i--) {
    if (isIP(chain[i])) return chain[i]
  }
  return socketAddress
}
