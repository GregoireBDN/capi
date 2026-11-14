import {
  REFRESH_COOKIE,
  REFRESH_PATH,
  forgetRefreshes,
  parseCookieHeader,
  refreshSession,
} from '#/lib/server-session'
import type { ApiTarget } from '#/lib/server-session'
import { resolveClientIp, trustedProxies } from '#/lib/client-ip'
import type { TrustProxyFn } from '#/lib/client-ip'

/**
 * Same-origin gateway: the web server forwards `/api/*` to the API, so the
 * browser only ever talks to the web origin. Session cookies are therefore
 * first-party to the web app and reach the SSR guard on page requests.
 *
 * Wired as a TanStack Start server route (`routes/api/$.ts`) rather than a
 * build-time proxy rule so that (1) the target is read at runtime (`API_URL`)
 * and (2) the refresh endpoint shares the SSR guard's per-token deduplication
 * (`refreshSession`), so a client-side refresh racing a page reload can't trip
 * the API's reuse detection.
 */

/** Hop-by-hop headers (RFC 9110 §7.6.1) plus ones `fetch` recomputes. */
const DROPPED_REQUEST_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  // Let the API answer uncompressed: `fetch` would decode the body anyway.
  'accept-encoding',
  // Client-supplied forwarding headers: the proxy sets its own (see
  // `upstreamHeaders`), so a client can't choose the IP the API rate-limits.
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-real-ip',
  'forwarded',
])

const DROPPED_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  // `fetch` hands us a decoded body, so these no longer describe it.
  'content-encoding',
  'content-length',
  'set-cookie',
])

const LOGOUT_PATH = '/api/auth/logout'

/**
 * Largest request body the proxy forwards: the API's biggest accepted body is
 * an import file (`IMPORT_FILE_MAX_BYTES`, 5 MB in
 * `apps/api/src/imports/upload/multipart.ts`) plus a little multipart framing;
 * JSON bodies are capped lower by the API itself. Anything bigger is refused
 * with 413 before it is buffered, so an anonymous request can't make the web
 * process hold hundreds of MB (#173).
 */
export const PROXY_BODY_MAX_BYTES = 5 * 1024 * 1024 + 16 * 1024

export const TOO_LARGE = Symbol('too-large')

function payloadTooLarge(): Response {
  return Response.json(
    {
      statusCode: 413,
      message: `Request body exceeds the ${Math.floor(PROXY_BODY_MAX_BYTES / 1024 / 1024)} MB limit`,
    },
    { status: 413 },
  )
}

/**
 * Reads the request body, at most `max` bytes. A declared `Content-Length`
 * over the cap is refused without reading anything; a chunked body is read
 * until it goes over the cap, then the stream is cancelled.
 */
export async function readCappedBody(
  request: Request,
  max = PROXY_BODY_MAX_BYTES,
): Promise<ArrayBuffer | typeof TOO_LARGE> {
  const declared = request.headers.get('content-length')
  if (declared !== null && Number(declared) > max) return TOO_LARGE
  if (!request.body) return new ArrayBuffer(0)

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => undefined)
      return TOO_LARGE
    }
    chunks.push(value)
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body.buffer
}

/**
 * Headers for the API. `X-Forwarded-For` is rebuilt from scratch with only the
 * client IP (`resolveClientIp`): taken from the incoming header when the peer
 * is a trusted proxy (Caddy), the socket address otherwise. The API trusts it
 * because it comes from `web` (see `apps/api/src/config/trusted-proxies.ts`).
 */
function upstreamHeaders(
  request: Request,
  url: URL,
  clientIp?: string,
): Headers {
  const headers = new Headers()
  request.headers.forEach((value, name) => {
    if (!DROPPED_REQUEST_HEADERS.has(name)) headers.set(name, value)
  })
  if (clientIp) headers.set('x-forwarded-for', clientIp)
  headers.set('x-forwarded-host', url.host)
  headers.set('x-forwarded-proto', url.protocol.replace(/:$/, ''))
  return headers
}

function downstreamResponse(upstream: Response): Response {
  const headers = new Headers()
  upstream.headers.forEach((value, name) => {
    if (!DROPPED_RESPONSE_HEADERS.has(name)) headers.set(name, value)
  })
  for (const cookie of upstream.headers.getSetCookie()) {
    headers.append('set-cookie', cookie)
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
}

/** `POST /api/auth/refresh`, deduplicated with the SSR guard's refreshes. */
async function proxyRefresh(
  request: Request,
  target: ApiTarget,
): Promise<Response | null> {
  const token = parseCookieHeader(
    request.headers.get('cookie') ?? undefined,
  ).get(REFRESH_COOKIE)
  // Without a token there is nothing to dedupe: let the API answer the 401.
  if (!token) return null

  const outcome = await refreshSession(token, target)
  const headers = new Headers()
  if (outcome.contentType) headers.set('content-type', outcome.contentType)
  for (const cookie of outcome.setCookies) headers.append('set-cookie', cookie)
  return new Response(outcome.body || null, { status: outcome.status, headers })
}

/**
 * Forwards `request` to the API.
 *
 * @param socketAddress the TCP peer of the request (`getRequestIP()` without
 *   `xForwardedFor`): the client, or Caddy in production.
 * @param trust which peers may set the client IP (`TRUSTED_PROXIES`).
 */
export async function proxyToApi(
  request: Request,
  target: ApiTarget,
  socketAddress?: string,
  trust: TrustProxyFn = trustedProxies(),
): Promise<Response> {
  const url = new URL(request.url)
  const clientIp = resolveClientIp(
    socketAddress,
    request.headers.get('x-forwarded-for'),
    trust,
  )

  if (request.method === 'POST' && url.pathname === REFRESH_PATH) {
    const response = await proxyRefresh(request, target)
    if (response) return response
  }
  if (url.pathname === LOGOUT_PATH) forgetRefreshes()

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const body = hasBody ? await readCappedBody(request) : undefined
  if (body === TOO_LARGE) return payloadTooLarge()
  try {
    const upstream = await (target.fetch ?? fetch)(
      new URL(url.pathname + url.search, target.apiUrl),
      {
        method: request.method,
        headers: upstreamHeaders(request, url, clientIp),
        body,
        redirect: 'manual',
      },
    )
    return downstreamResponse(upstream)
  } catch {
    return Response.json(
      { statusCode: 502, message: 'API unreachable' },
      { status: 502 },
    )
  }
}
