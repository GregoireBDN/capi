import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { ConfigError } from '../config.js'

/**
 * The client IP of a request: the socket peer, unless the peer is a trusted
 * proxy (the server's Caddy), in which case the right-most `X-Forwarded-For`
 * entry that is not a trusted proxy. A client cannot choose its own IP (and
 * so its rate-limit bucket) by sending the header itself.
 *
 * Trusted proxies are IPs, CIDR ranges, `loopback`, `uniquelocal`, `none`, or
 * host names (#328): in production `caddy`, Caddy's service name on the shared
 * `proxy` network, resolved through Docker's DNS every 30 s like the web
 * server's `TRUSTED_PROXIES` (#183), so another container on that network
 * can't choose its client IP. A name that doesn't resolve trusts nobody.
 */
const RANGES: Record<string, [string, number, 'ipv4' | 'ipv6'][]> = {
  loopback: [
    ['127.0.0.0', 8, 'ipv4'],
    ['::1', 128, 'ipv6'],
  ],
  uniquelocal: [
    ['10.0.0.0', 8, 'ipv4'],
    ['172.16.0.0', 12, 'ipv4'],
    ['192.168.0.0', 16, 'ipv4'],
    ['fc00::', 7, 'ipv6'],
  ],
}

const HOST_NAME =
  /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i

export const TRUSTED_PROXY_REFRESH_MS = 30_000

type IpFamily = 'ipv4' | 'ipv6'
export type HostLookup = (hostName: string) => Promise<string[]>

const systemLookup: HostLookup = async (hostName) =>
  (await lookup(hostName, { all: true })).map((entry) => entry.address)

function addAddress(list: BlockList, address: string, prefix?: number): void {
  const type: IpFamily = isIP(address) === 4 ? 'ipv4' : 'ipv6'
  if (prefix === undefined) list.addAddress(address, type)
  else list.addSubnet(address, prefix, type)
}

export interface TrustedProxiesOptions {
  lookup?: HostLookup
  refreshMs?: number
  /** Receives the host name only. Defaults to stderr. */
  warn?: (line: string) => void
}

export class TrustedProxies {
  readonly hostNames: readonly string[]
  private readonly fixed = new BlockList()
  private resolved = new BlockList()
  private readonly lookup: HostLookup
  private readonly refreshMs: number
  private readonly warn: (line: string) => void
  private readonly failing = new Set<string>()
  private timer: ReturnType<typeof setInterval> | undefined
  private refreshing: Promise<void> | undefined

  constructor(entries: string[], options: TrustedProxiesOptions = {}) {
    const hostNames: string[] = []
    for (const entry of entries) {
      if (entry === 'none') continue
      const named = RANGES[entry]
      if (named) {
        for (const [address, prefix, family] of named)
          this.fixed.addSubnet(address, prefix, family)
        continue
      }
      const [address = '', prefix, ...rest] = entry.split('/')
      if (isIP(address)) {
        const bits = prefix === undefined ? undefined : Number(prefix)
        const max = isIP(address) === 4 ? 32 : 128
        if (
          rest.length > 0 ||
          (bits !== undefined &&
            (!/^\d+$/.test(prefix ?? '') || bits < 0 || bits > max))
        ) {
          throw new ConfigError(
            `MCP_TRUSTED_PROXIES: "${entry}" is not a valid CIDR range.`,
          )
        }
        addAddress(this.fixed, address, bits)
        continue
      }
      if (prefix === undefined && HOST_NAME.test(entry)) {
        hostNames.push(entry.toLowerCase())
        continue
      }
      throw new ConfigError(
        `MCP_TRUSTED_PROXIES: "${entry}" is not an IP, a CIDR range, a host name, loopback, uniquelocal or none.`,
      )
    }
    this.hostNames = [...new Set(hostNames)]
    this.lookup = options.lookup ?? systemLookup
    this.refreshMs = options.refreshMs ?? TRUSTED_PROXY_REFRESH_MS
    this.warn = options.warn ?? ((line) => console.error(line))
  }

  check(address: string, type: IpFamily): boolean {
    return this.fixed.check(address, type) || this.resolved.check(address, type)
  }

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
    const list = new BlockList()
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
          for (const address of addresses) addAddress(list, normalize(address))
        } else if (!this.failing.has(hostName)) {
          this.failing.add(hostName)
          this.warn(
            `[capi-mcp] trusted proxy "${hostName}" does not resolve: X-Forwarded-For from it is ignored until it does`,
          )
        }
      }),
    )
    this.resolved = list
  }
}

export function compileTrustedProxies(
  entries: string[],
  options?: TrustedProxiesOptions,
): TrustedProxies {
  return new TrustedProxies(entries, options)
}

/** `::ffff:10.0.0.1` → `10.0.0.1`. */
function normalize(address: string): string {
  return address.startsWith('::ffff:') && isIP(address.slice(7)) === 4
    ? address.slice(7)
    : address
}

/** What `clientIp` needs from the trusted proxies (a `BlockList` fits too). */
export interface ProxyCheck {
  check(address: string, type: IpFamily): boolean
}

function trusted(list: ProxyCheck, address: string): boolean {
  const family = isIP(address)
  return family !== 0 && list.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

export function clientIp(
  peer: string | undefined,
  forwardedFor: string | string[] | undefined,
  proxies: ProxyCheck,
): string {
  let current = normalize(peer ?? '')
  if (!current) return 'unknown'
  const hops = (
    Array.isArray(forwardedFor) ? forwardedFor.join(',') : (forwardedFor ?? '')
  )
    .split(',')
    .map((hop) => normalize(hop.trim()))
    .filter(Boolean)
  while (trusted(proxies, current) && hops.length > 0) {
    const next = hops.pop()!
    if (!isIP(next)) break
    current = next
  }
  return current
}
