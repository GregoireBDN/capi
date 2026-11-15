import { ConfigError } from '../config.js'

/**
 * Configuration of the remote (Streamable HTTP) transport (#78, ADR 0003).
 * It only starts when `REMOTE_MCP_ENABLED=true`, the same kill switch as the
 * API's OAuth routes.
 */
export interface HttpConfig {
  /** Origin of the API as reached from this process (`http://api:4000`). */
  apiUrl: string
  /** Public origin of this adapter: the OAuth issuer; the MCP endpoint is `<origin>/mcp`. */
  publicUrl: string
  host: string
  port: number
  /** Peers whose `X-Forwarded-For` is believed (the server's Caddy). */
  trustedProxies: string[]
}

export const DEFAULT_HTTP_PORT = 4100
const DEFAULT_TRUSTED_PROXIES = 'loopback'

const isLoopbackHost = (host: string) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(host)

function plainOrigin(name: string, raw: string | undefined): URL {
  if (!raw?.trim()) throw new ConfigError(`${name} is not set.`)
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new ConfigError(`${name} is not a valid URL.`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError(`${name} must be an http(s) URL.`)
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ConfigError(
      `${name} must be a plain origin (no credentials, query or hash).`,
    )
  }
  return url
}

export function loadHttpConfig(
  env: NodeJS.ProcessEnv = process.env,
): HttpConfig {
  if (env.REMOTE_MCP_ENABLED !== 'true') {
    throw new ConfigError(
      'remote access is off (REMOTE_MCP_ENABLED is not "true"). See docs/runbooks/remote-mcp.md before enabling it.',
    )
  }
  const api = plainOrigin('FINANCES_API_URL', env.FINANCES_API_URL)
  const publicUrl = plainOrigin(
    'REMOTE_MCP_PUBLIC_URL',
    env.REMOTE_MCP_PUBLIC_URL,
  )
  if (publicUrl.pathname !== '/') {
    throw new ConfigError(
      'REMOTE_MCP_PUBLIC_URL must be an origin without a path (the MCP endpoint is <origin>/mcp).',
    )
  }
  if (publicUrl.protocol !== 'https:' && !isLoopbackHost(publicUrl.hostname)) {
    throw new ConfigError('REMOTE_MCP_PUBLIC_URL must use https.')
  }
  const port = Number(env.MCP_HTTP_PORT ?? DEFAULT_HTTP_PORT)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new ConfigError('MCP_HTTP_PORT must be a port number.')
  }
  const apiPath = api.pathname.replace(/\/+$/, '').replace(/\/api$/, '')
  return {
    apiUrl: `${api.origin}${apiPath}`,
    publicUrl: publicUrl.origin,
    host: env.MCP_HTTP_HOST?.trim() || '127.0.0.1',
    port,
    trustedProxies: (env.MCP_TRUSTED_PROXIES ?? DEFAULT_TRUSTED_PROXIES)
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  }
}
