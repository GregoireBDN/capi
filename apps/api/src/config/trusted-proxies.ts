import type { IncomingMessage } from 'node:http'
import proxyAddr from '@fastify/proxy-addr'

/**
 * Which peers may set the client IP through `X-Forwarded-For`.
 *
 * The browser never calls the API directly: it goes through the web server's
 * `/api` proxy (behind Caddy in production), which forwards the real client IP
 * in `X-Forwarded-For`. Fastify only honours that header when the TCP peer is
 * a trusted proxy (`trustProxy`), so per-IP rate limits and logs use the real
 * client IP while a client talking to the API directly can't pick its own.
 *
 * `TRUSTED_PROXIES` is a comma-separated list of IPs, CIDR ranges or the
 * `proxy-addr` names `loopback`, `linklocal` and `uniquelocal` (private
 * ranges: 10/8, 172.16/12, 192.168/16, fc00::/7). The default trusts loopback
 * (the dev web server on localhost) and the private ranges Docker networks use
 * (the `web` container in production). That is only safe while the API is
 * unreachable from anything but the stack's internal network: no published
 * port in the production compose file. `none` (or an empty value) trusts no
 * one: `request.ip` is then always the socket address.
 */
export const DEFAULT_TRUSTED_PROXIES = 'loopback,uniquelocal'

/** Parses `TRUSTED_PROXIES` into `proxy-addr` entries. */
export function parseTrustedProxies(value: string): string[] {
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return entries.length === 1 && entries[0].toLowerCase() === 'none'
    ? []
    : entries
}

export type TrustProxyFn = (address: string, hop: number) => boolean

/** Compiles the entries into Fastify's `trustProxy` function (throws on an invalid entry). */
export function compileTrustedProxies(entries: string[]): TrustProxyFn {
  return proxyAddr.compile(entries)
}

/**
 * The client IP of a raw request, with the same rule as Fastify's
 * `request.ip`: walk `X-Forwarded-For` from the right while the hop is trusted.
 */
export function clientIp(
  request: IncomingMessage,
  trust: TrustProxyFn,
): string | undefined {
  if (!request.socket?.remoteAddress) return undefined
  return proxyAddr(request, trust)
}
