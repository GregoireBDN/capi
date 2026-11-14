import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import proxyAddr from '@fastify/proxy-addr'

/**
 * Client IP of a request reaching the web server, for the `/api` proxy.
 *
 * In production the browser reaches `web` through Caddy (on the shared `proxy`
 * network), which sets `X-Forwarded-For` to the client's address. That header
 * is only believed when the TCP peer is a trusted proxy; anyone else (a client
 * reaching `web` directly, a neighbour container on `proxy`, or a spoofed
 * header) gets the socket address. The API applies the same rule to `web`
 * (`apps/api/src/config/trusted-proxies.ts`), so per-IP rate limits follow the
 * real client and can't be dodged by sending a made-up `X-Forwarded-For`.
 *
 * `TRUSTED_PROXIES` (runtime env, server only) is a comma-separated list of
 * IPs, CIDR ranges, the names `loopback`, `linklocal`, `uniquelocal` (private
 * ranges, which Docker networks use), or host names; `none` trusts no one.
 * A host name (`caddy` in the production compose file, #183) is resolved
 * through DNS (Docker's resolver on the `proxy` network) at start-up and every
 * 30 s, so a restarted Caddy with a new IP is followed; while it doesn't
 * resolve, nobody is trusted for it and one warning is logged (no IP in it).
 */

export const DEFAULT_TRUSTED_PROXIES = 'loopback,uniquelocal'

/** How often host names in `TRUSTED_PROXIES` are resolved again. */
export const TRUSTED_PROXY_REFRESH_MS = 30_000
const LOOKUP_TIMEOUT_MS = 5_000

export type TrustProxyFn = (address: string, hop: number) => boolean

const KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal'])
const HOST_NAME =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i

const trustNobody: TrustProxyFn = () => false

/** Parses a `TRUSTED_PROXIES` value into its entries. */
export function parseTrustedProxies(value: string): string[] {
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return entries.length === 1 && entries[0].toLowerCase() === 'none'
    ? []
    : entries
}

/** Splits the entries into `proxy-addr` ones and host names to resolve. */
export function splitTrustedProxies(value: string): {
  addresses: string[]
  hostNames: string[]
} {
  const addresses: string[] = []
  const hostNames: string[] = []
  for (const entry of parseTrustedProxies(value)) {
    const isAddress =
      KEYWORDS.has(entry.toLowerCase()) || isIP(entry) || entry.includes('/')
    if (!isAddress && HOST_NAME.test(entry)) {
      hostNames.push(entry.toLowerCase())
    } else {
      addresses.push(entry)
    }
  }
  return { addresses, hostNames }
}

function compileAddresses(addresses: string[]): TrustProxyFn {
  try {
    return addresses.length === 0 ? trustNobody : proxyAddr.compile(addresses)
  } catch (error) {
    throw new Error(
      `Invalid TRUSTED_PROXIES (${(error as Error).message}): expected IPs, CIDR ranges, loopback, linklocal, uniquelocal, host names or none`,
    )
  }
}

/**
 * Compiles the IP, CIDR and keyword entries of a `TRUSTED_PROXIES` value
 * (host names need `TrustedProxies`); throws on an invalid entry.
 */
export function compileTrustedProxies(value: string): TrustProxyFn {
  const { addresses, hostNames } = splitTrustedProxies(value)
  if (hostNames.length > 0) {
    throw new Error(
      `Invalid TRUSTED_PROXIES: host names (${hostNames.join(', ')}) need DNS resolution`,
    )
  }
  return compileAddresses(addresses)
}

/** Resolves a host name to all its addresses. */
export type HostLookup = (hostName: string) => Promise<string[]>

const systemLookup: HostLookup = async (hostName) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('DNS lookup timed out')),
      LOOKUP_TIMEOUT_MS,
    )
  })
  try {
    const results = await Promise.race([
      dnsLookup(hostName, { all: true }),
      timeout,
    ])
    return results.map((result) => result.address)
  } finally {
    clearTimeout(timer)
  }
}

export interface TrustedProxiesOptions {
  lookup?: HostLookup
  refreshMs?: number
  warn?: (message: string) => void
}

/**
 * A `TRUSTED_PROXIES` value whose host names are resolved now and every
 * `refreshMs`. `trust` is synchronous and always uses the latest addresses.
 */
export class TrustedProxies {
  readonly hostNames: readonly string[]
  private readonly staticTrust: TrustProxyFn
  private readonly lookup: HostLookup
  private readonly refreshMs: number
  private readonly warn: (message: string) => void
  private readonly resolved = new Map<string, string[]>()
  private readonly failing = new Set<string>()
  private resolvedTrust: TrustProxyFn = trustNobody
  private timer: ReturnType<typeof setInterval> | undefined
  private refreshing: Promise<void> | undefined

  constructor(value: string, options: TrustedProxiesOptions = {}) {
    const { addresses, hostNames } = splitTrustedProxies(value)
    this.staticTrust = compileAddresses(addresses)
    this.hostNames = hostNames
    this.lookup = options.lookup ?? systemLookup
    this.refreshMs = options.refreshMs ?? TRUSTED_PROXY_REFRESH_MS
    this.warn = options.warn ?? ((message) => console.warn(message))
  }

  readonly trust: TrustProxyFn = (address, hop) =>
    this.staticTrust(address, hop) || this.resolvedTrust(address, hop)

  /** Resolves the host names now, then every `refreshMs` (no-op without any). */
  start(): void {
    if (this.hostNames.length === 0 || this.timer) return
    void this.refresh()
    this.timer = setInterval(() => void this.refresh(), this.refreshMs)
    this.timer.unref()
  }

  stop(): void {
    clearInterval(this.timer)
    this.timer = undefined
  }

  /** Resolves every host name once (concurrent calls share one round). */
  refresh(): Promise<void> {
    this.refreshing ??= this.resolveAll().finally(() => {
      this.refreshing = undefined
    })
    return this.refreshing
  }

  private async resolveAll(): Promise<void> {
    await Promise.all(
      this.hostNames.map(async (hostName) => {
        let addresses: string[] = []
        try {
          addresses = (await this.lookup(hostName)).filter((a) => isIP(a))
        } catch {
          addresses = []
        }
        if (addresses.length > 0) {
          this.failing.delete(hostName)
        } else if (!this.failing.has(hostName)) {
          this.failing.add(hostName)
          this.warn(
            `Trusted proxy "${hostName}" does not resolve: X-Forwarded-For from it is ignored until it does`,
          )
        }
        this.resolved.set(hostName, addresses)
      }),
    )
    const all = [...new Set([...this.resolved.values()].flat())]
    this.resolvedTrust = compileAddresses(all)
  }
}

let current: { value: string; proxies: TrustedProxies } | undefined

/** The trust function for the current `TRUSTED_PROXIES` (one resolver per value). */
export function trustedProxies(): TrustProxyFn {
  const value = process.env['TRUSTED_PROXIES'] ?? DEFAULT_TRUSTED_PROXIES
  if (current?.value !== value) {
    current?.proxies.stop()
    current = { value, proxies: new TrustedProxies(value) }
    current.proxies.start()
  }
  return current.proxies.trust
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
