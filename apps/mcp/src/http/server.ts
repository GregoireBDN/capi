import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createHash } from 'node:crypto'
import {
  createServer as createNodeServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { ApiClient } from '../api/client.js'
import { createServer } from '../server.js'
import { clientIp, compileTrustedProxies } from './client-ip.js'
import type { HttpConfig } from './config.js'
import { RateLimiter } from './rate-limit.js'

/**
 * Remote MCP adapter (#78, ADR 0003): the only public surface of the app.
 * Serves the MCP endpoint over Streamable HTTP (stateless, JSON responses)
 * and forwards the OAuth endpoints to the API; everything else is 404.
 *
 * - `/mcp` takes only OAuth access tokens (`fin_oat_`), checked with the API
 *   (`GET /api/oauth/token-info`) before each request; a personal access
 *   token or a session never works here.
 * - Each request gets its own MCP server whose API client carries that token:
 *   nothing is kept between requests but a 30 s cache of valid token hashes.
 * - Logs: method, a fixed route label and the status. Never a token, code,
 *   verifier, body, argument or tool output.
 */

export const MCP_PATH = '/mcp'
export const PROTECTED_RESOURCE_PATHS = [
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
]

const OAUTH_ACCESS_TOKEN_PATTERN = /^fin_oat_[A-Za-z0-9_-]{43}$/
/** OAuth bodies are a few hundred bytes. */
const OAUTH_BODY_MAX_BYTES = 16 * 1024
/** An MCP call may carry a CSV export (≤ 5 MB) as text, JSON-escaped. */
const MCP_BODY_MAX_BYTES = 8 * 1024 * 1024
const UPSTREAM_TIMEOUT_MS = 10_000
const TOKEN_CACHE_MS = 30_000
const TOKEN_CACHE_MAX = 100

/** Requests per minute: per client IP before authentication, per token after. */
export const RATE_LIMITS = { perIp: 120, perToken: 120 } as const

/** OAuth routes forwarded to the API (`public path` → `API path`). */
const OAUTH_ROUTES: Record<string, { apiPath: string; form: boolean }> = {
  '/oauth/register': { apiPath: '/api/oauth/register', form: false },
  '/oauth/token': { apiPath: '/api/oauth/token', form: true },
  '/oauth/revoke': { apiPath: '/api/oauth/revoke', form: true },
}

export interface HttpServerOptions {
  config: HttpConfig
  fetch?: typeof fetch
  now?: () => Date
  /** Defaults to stderr; receives only method, route label and status. */
  log?: (line: string) => void
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly headers: Record<string, string> = {},
  ) {
    super(`HTTP ${status}`)
  }
}

/** Fixed label of a public path for the logs (never the raw URL). */
function labelOf(path: string): string {
  if (path === MCP_PATH) return 'mcp'
  if (PROTECTED_RESOURCE_PATHS.includes(path)) return 'protected-resource'
  if (path === '/.well-known/oauth-authorization-server')
    return 'authorization-server'
  if (path in OAUTH_ROUTES) return path.slice(1)
  return 'unknown'
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  if (res.headersSent) return
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage, max: number): Promise<string> {
  const declared = Number(req.headers['content-length'])
  if (Number.isFinite(declared) && declared > max) {
    throw new HttpError(413, {
      error: 'invalid_request',
      error_description: 'Body too large',
    })
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > max) {
      throw new HttpError(413, {
        error: 'invalid_request',
        error_description: 'Body too large',
      })
    }
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const contentType = (req: IncomingMessage) =>
  (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase()

/** RFC 6749 form body → JSON object; a repeated parameter is an error. */
function formToObject(text: string): Record<string, string> {
  const params = new URLSearchParams(text)
  const object: Record<string, string> = {}
  for (const [key, value] of params) {
    if (key in object) {
      throw new HttpError(400, {
        error: 'invalid_request',
        error_description: `Repeated parameter: ${key.slice(0, 40)}`,
      })
    }
    object[key] = value
  }
  return object
}

export function createHttpHandler(options: HttpServerOptions) {
  const { config } = options
  const fetchImpl = options.fetch ?? fetch
  const now = options.now ?? (() => new Date())
  const log = options.log ?? ((line: string) => console.error(line))
  const proxies = compileTrustedProxies(config.trustedProxies)
  const ipLimiter = new RateLimiter(RATE_LIMITS.perIp, 60_000)
  const tokenLimiter = new RateLimiter(RATE_LIMITS.perToken, 60_000)
  const validTokens = new Map<string, { until: number }>()
  const resourceMetadataUrl = `${config.publicUrl}${PROTECTED_RESOURCE_PATHS[1]}`

  const protectedResource = {
    resource: `${config.publicUrl}${MCP_PATH}`,
    authorization_servers: [config.publicUrl],
    scopes_supported: ['read', 'write'],
    bearer_methods_supported: ['header'],
    resource_name: 'Finances',
  }

  const unauthorized = (error?: 'invalid_token') =>
    new HttpError(
      401,
      {
        error: error ?? 'unauthorized',
        error_description: 'OAuth access token required',
      },
      {
        'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl}"${
          error ? `, error="${error}"` : ''
        }`,
      },
    )

  async function upstream(
    method: 'GET' | 'POST',
    apiPath: string,
    ip: string,
    init: { body?: unknown; bearer?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Forwarded-For': ip,
    }
    if (init.body !== undefined) headers['Content-Type'] = 'application/json'
    if (init.bearer) headers['Authorization'] = `Bearer ${init.bearer}`
    try {
      return await fetchImpl(`${config.apiUrl}${apiPath}`, {
        method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      })
    } catch {
      throw new HttpError(503, {
        error: 'temporarily_unavailable',
        error_description: 'The authorization server is unreachable',
      })
    }
  }

  /** Forwards the API's answer as is (status and JSON body). */
  async function relay(res: ServerResponse, response: Response): Promise<void> {
    const text = await response.text()
    let body: unknown = {}
    try {
      body = text ? JSON.parse(text) : {}
    } catch {
      body = { error: 'server_error' }
    }
    const headers: Record<string, string> = {}
    const retryAfter = response.headers.get('retry-after')
    if (retryAfter) headers['Retry-After'] = retryAfter
    send(res, response.status, body, headers)
  }

  async function checkToken(bearer: string, ip: string): Promise<void> {
    const key = hash(bearer)
    const cached = validTokens.get(key)
    if (cached && cached.until > now().getTime()) return
    const response = await upstream('GET', '/api/oauth/token-info', ip, {
      bearer,
    })
    if (response.status === 401 || response.status === 403) {
      validTokens.delete(key)
      throw unauthorized('invalid_token')
    }
    if (!response.ok) {
      throw new HttpError(503, { error: 'temporarily_unavailable' })
    }
    const info = (await response.json()) as { expiresAt?: string }
    const expiresAt = info.expiresAt ? Date.parse(info.expiresAt) : 0
    if (validTokens.size >= TOKEN_CACHE_MAX) {
      const oldest = validTokens.keys().next().value
      if (oldest !== undefined) validTokens.delete(oldest)
    }
    validTokens.set(key, {
      until: Math.min(now().getTime() + TOKEN_CACHE_MS, expiresAt),
    })
  }

  async function handleMcp(
    req: IncomingMessage,
    res: ServerResponse,
    ip: string,
  ): Promise<void> {
    if (req.method !== 'POST') {
      throw new HttpError(
        405,
        { error: 'method_not_allowed' },
        { Allow: 'POST' },
      )
    }
    const header = req.headers.authorization
    const match = header ? /^Bearer[ ]+(\S+)[ ]*$/i.exec(header) : null
    if (!header) throw unauthorized()
    const bearer = match?.[1]
    if (!bearer || !OAUTH_ACCESS_TOKEN_PATTERN.test(bearer)) {
      throw unauthorized('invalid_token')
    }
    const wait = tokenLimiter.hit(hash(bearer))
    if (wait)
      throw new HttpError(
        429,
        { error: 'rate_limited' },
        { 'Retry-After': String(wait) },
      )
    await checkToken(bearer, ip)

    let message: unknown
    try {
      message = JSON.parse(await readBody(req, MCP_BODY_MAX_BYTES))
    } catch (error) {
      if (error instanceof HttpError) throw error
      throw new HttpError(400, {
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Parse error' },
        id: null,
      })
    }

    const api = new ApiClient({
      baseUrl: config.apiUrl,
      token: bearer,
      fetch: fetchImpl,
      mode: 'http',
      forwardedFor: ip,
    })
    const server = createServer({ api, now, remote: true })
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    res.on('close', () => {
      void transport.close()
      void server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, message)
  }

  async function route(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    ip: string,
  ): Promise<void> {
    // DNS rebinding / browser calls: only our own origin, or none (servers).
    const origin = req.headers.origin
    if (origin !== undefined && origin !== config.publicUrl) {
      throw new HttpError(403, { error: 'forbidden_origin' })
    }
    const wait = ipLimiter.hit(ip)
    if (wait) {
      throw new HttpError(
        429,
        { error: 'rate_limited' },
        { 'Retry-After': String(wait) },
      )
    }

    if (path === MCP_PATH) {
      await handleMcp(req, res, ip)
      return
    }
    if (PROTECTED_RESOURCE_PATHS.includes(path)) {
      if (req.method !== 'GET') throw new HttpError(405, {}, { Allow: 'GET' })
      send(res, 200, protectedResource)
      return
    }
    if (path === '/.well-known/oauth-authorization-server') {
      if (req.method !== 'GET') throw new HttpError(405, {}, { Allow: 'GET' })
      await relay(res, await upstream('GET', '/api/oauth/metadata', ip))
      return
    }
    const oauth = OAUTH_ROUTES[path]
    if (oauth) {
      if (req.method !== 'POST') throw new HttpError(405, {}, { Allow: 'POST' })
      const type = contentType(req)
      const text = await readBody(req, OAUTH_BODY_MAX_BYTES)
      let body: unknown
      if (type === 'application/x-www-form-urlencoded' && oauth.form) {
        body = formToObject(text)
      } else if (type === 'application/json') {
        try {
          body = JSON.parse(text)
        } catch {
          throw new HttpError(400, {
            error: 'invalid_request',
            error_description: 'Invalid JSON',
          })
        }
      } else {
        throw new HttpError(415, {
          error: 'invalid_request',
          error_description: oauth.form
            ? 'Expected application/x-www-form-urlencoded'
            : 'Expected application/json',
        })
      }
      await relay(res, await upstream('POST', oauth.apiPath, ip, { body }))
      return
    }
    throw new HttpError(404, { error: 'not_found' })
  }

  return async function handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const path = new URL(req.url ?? '/', 'http://adapter.invalid').pathname
    const ip = clientIp(
      req.socket.remoteAddress,
      req.headers['x-forwarded-for'],
      proxies,
    )
    try {
      await route(req, res, path, ip)
    } catch (error) {
      if (error instanceof HttpError) {
        send(res, error.status, error.body, error.headers)
      } else {
        log(
          `[finances-mcp] http: unexpected ${error instanceof Error ? error.name : 'error'}`,
        )
        send(res, 500, { error: 'server_error' })
      }
    } finally {
      log(
        `[finances-mcp] ${req.method ?? '?'} ${labelOf(path)} ${res.statusCode}`,
      )
    }
  }
}

/** Starts the adapter; resolves once it listens. */
export async function startHttpServer(
  options: HttpServerOptions,
): Promise<Server> {
  const handle = createHttpHandler(options)
  const server = createNodeServer((req, res) => {
    void handle(req, res)
  })
  // Slow clients cannot hold sockets open forever.
  server.requestTimeout = 60_000
  server.headersTimeout = 15_000
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.config.port, options.config.host, () => resolve())
  })
  return server
}
