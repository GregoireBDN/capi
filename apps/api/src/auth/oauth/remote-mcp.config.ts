/**
 * Remote MCP access (#78, ADR 0003): where the OAuth authorization server and
 * the MCP resource live. Pure (no `env` import) so specs build their own.
 */

/** Claude's connector callbacks (claude.ai today, claude.com announced). */
export const DEFAULT_REMOTE_MCP_REDIRECT_URIS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
] as const

/** Dev default: the MCP adapter (`apps/mcp --http`) on its default port. */
export const DEV_REMOTE_MCP_PUBLIC_URL = 'http://localhost:4100'

/** Path of the MCP endpoint on the adapter's public origin. */
export const MCP_ENDPOINT_PATH = '/mcp'

export interface RemoteMcpConfig {
  /** `REMOTE_MCP_ENABLED=true`. Off: no OAuth route is mounted and OAuth tokens are refused. */
  enabled: boolean
  /** OAuth issuer: the adapter's public origin (`https://capi-mcp.example.com`). */
  issuer: string
  /** The MCP endpoint, the only audience OAuth tokens are issued for (RFC 8707). */
  resource: string
  /** The consent page of the web app (on the tailnet). */
  authorizationEndpoint: string
  /** Redirect URIs a client may register, matched exactly. */
  redirectUris: string[]
}

/** Injection token of the {@link RemoteMcpConfig} (`env.remoteMcp` in the app). */
export const REMOTE_MCP_CONFIG = Symbol('REMOTE_MCP_CONFIG')

const isLoopback = (url: URL) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)

function parseRedirectUris(raw: string | undefined): string[] {
  const entries = (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  if (entries.length === 0) return [...DEFAULT_REMOTE_MCP_REDIRECT_URIS]
  return entries.map((entry) => {
    let url: URL
    try {
      url = new URL(entry)
    } catch {
      throw new Error(`REMOTE_MCP_REDIRECT_URIS: "${entry}" is not a URL`)
    }
    if (
      url.hash ||
      url.username ||
      url.password ||
      !(
        url.protocol === 'https:' ||
        (url.protocol === 'http:' && isLoopback(url))
      )
    ) {
      throw new Error(
        `REMOTE_MCP_REDIRECT_URIS: "${entry}" must be an https URL (or http on localhost) without credentials or fragment`,
      )
    }
    return entry
  })
}

/** Canonical form of a resource URI: lowercase scheme and host, no trailing slash. */
export function canonicalResource(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.hash || url.search || url.username || url.password) return null
  // `URL` already lowercases the scheme and the host.
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`
}

export function resolveRemoteMcp(values: {
  APP_URL: string
  REMOTE_MCP_ENABLED: boolean
  REMOTE_MCP_PUBLIC_URL?: string
  REMOTE_MCP_REDIRECT_URIS?: string
  isProduction: boolean
}): RemoteMcpConfig {
  const enabled = values.REMOTE_MCP_ENABLED
  if (enabled && values.isProduction && !values.REMOTE_MCP_PUBLIC_URL) {
    throw new Error(
      'REMOTE_MCP_PUBLIC_URL: required when REMOTE_MCP_ENABLED=true in production',
    )
  }
  const publicUrl = new URL(
    values.REMOTE_MCP_PUBLIC_URL ?? DEV_REMOTE_MCP_PUBLIC_URL,
  )
  if (
    publicUrl.pathname !== '/' ||
    publicUrl.search ||
    publicUrl.hash ||
    publicUrl.username ||
    publicUrl.password
  ) {
    throw new Error(
      'REMOTE_MCP_PUBLIC_URL: must be a plain origin (scheme, host and port only)',
    )
  }
  if (enabled && values.isProduction && publicUrl.protocol !== 'https:') {
    throw new Error('REMOTE_MCP_PUBLIC_URL: must use https in production')
  }
  const issuer = publicUrl.origin
  return {
    enabled,
    issuer,
    resource: `${issuer}${MCP_ENDPOINT_PATH}`,
    authorizationEndpoint: new URL('/oauth/authorize', values.APP_URL).href,
    redirectUris: parseRedirectUris(values.REMOTE_MCP_REDIRECT_URIS),
  }
}
