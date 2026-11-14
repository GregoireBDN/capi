/** Runtime configuration, read from the environment the MCP client starts us with. */
export interface Config {
  /** Origin of the app (web or API), without a trailing slash or `/api`. */
  apiUrl: string
  /** Personal access token (`fin_pat_…`): `read`, or `write` for the write tools. */
  token: string
}

export class ConfigError extends Error {}

const TOKEN_PATTERN = /^fin_pat_[A-Za-z0-9_-]{43}$/

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rawUrl = env.FINANCES_API_URL?.trim()
  const token = env.FINANCES_API_TOKEN?.trim()
  if (!rawUrl) {
    throw new ConfigError(
      'FINANCES_API_URL is not set (e.g. http://localhost:4000 or the app URL on the tailnet).',
    )
  }
  if (!token) {
    throw new ConfigError(
      'FINANCES_API_TOKEN is not set: create a token on the profile page of the app (read scope, or write for the write tools).',
    )
  }
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new ConfigError('FINANCES_API_URL is not a valid URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError('FINANCES_API_URL must be an http(s) URL.')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ConfigError(
      'FINANCES_API_URL must be a plain origin (no credentials, query or hash).',
    )
  }
  if (!TOKEN_PATTERN.test(token)) {
    throw new ConfigError(
      'FINANCES_API_TOKEN is not a personal access token (expected fin_pat_ followed by 43 characters).',
    )
  }
  const path = url.pathname.replace(/\/+$/, '').replace(/\/api$/, '')
  return { apiUrl: `${url.origin}${path}`, token }
}
