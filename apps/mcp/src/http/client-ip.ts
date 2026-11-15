import { BlockList, isIP } from 'node:net'
import { ConfigError } from '../config.js'

/**
 * The client IP of a request: the socket peer, unless the peer is a trusted
 * proxy (the server's Caddy), in which case the right-most `X-Forwarded-For`
 * entry that is not a trusted proxy. A client cannot choose its own IP (and
 * so its rate-limit bucket) by sending the header itself.
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

export function compileTrustedProxies(entries: string[]): BlockList {
  const list = new BlockList()
  for (const entry of entries) {
    if (entry === 'none') continue
    const named = RANGES[entry]
    if (named) {
      for (const [address, prefix, family] of named)
        list.addSubnet(address, prefix, family)
      continue
    }
    const [address = '', prefix] = entry.split('/')
    const family = isIP(address)
    if (!family) {
      throw new ConfigError(
        `MCP_TRUSTED_PROXIES: "${entry}" is not an IP, a CIDR range, loopback, uniquelocal or none.`,
      )
    }
    const type = family === 4 ? 'ipv4' : 'ipv6'
    if (prefix === undefined) list.addAddress(address, type)
    else list.addSubnet(address, Number(prefix), type)
  }
  return list
}

/** `::ffff:10.0.0.1` → `10.0.0.1`. */
function normalize(address: string): string {
  return address.startsWith('::ffff:') && isIP(address.slice(7)) === 4
    ? address.slice(7)
    : address
}

function trusted(list: BlockList, address: string): boolean {
  const family = isIP(address)
  return family !== 0 && list.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

export function clientIp(
  peer: string | undefined,
  forwardedFor: string | string[] | undefined,
  proxies: BlockList,
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
