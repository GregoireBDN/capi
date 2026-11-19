import type { IncomingHttpHeaders } from 'node:http'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { readBearerToken } from '#/auth/guards/jwt.guard'
import { env } from '#/config/env'
import type { ErrorResponse } from '../filters/all-exceptions.filter'

/**
 * Same-site request forgery on `/api` writes (audit F7, #179).
 *
 * `SameSite=Lax` keeps the session cookies off cross-site requests but not
 * off **same-site** ones: a page on a sibling subdomain can submit a form
 * (`POST` without a body, `multipart/form-data`, `text/plain`) with the
 * owner's cookies. Browsers say where a request comes from, so unsafe
 * requests from another origin are refused:
 *
 * - `Origin` equal to the app origin (`APP_URL`, or `WEBAUTHN_ORIGIN`) passes;
 * - otherwise `Sec-Fetch-Site` decides: `same-origin` (the page and `/api` on
 *   the same origin, through the web proxy) or `none` (typed by the user)
 *   pass, `same-site` / `cross-site` are refused;
 * - without `Sec-Fetch-Site` (older browsers), an `Origin` from elsewhere is
 *   refused;
 * - without either header the request does not come from a page (the web
 *   server's SSR and server-function calls, scripts): it passes.
 *
 * Outside production only (#339), an `Origin` equal to the origin the request
 * was addressed to also passes: the phone opens the dev server at the Mac's
 * LAN address (`http://192.168.1.x:3000`), which is no secure context, so the
 * browser sends no `Sec-Fetch-Site` and its `Origin` is not `APP_URL`. That
 * origin is `X-Forwarded-Proto` + `X-Forwarded-Host`, which the web proxy
 * sets from the browser's own `Host` (`lib/api-proxy.ts`), else `Host`. A
 * page elsewhere can't make a browser send another site's `Host`, nor set
 * `X-Forwarded-Host` without a preflight only `APP_URL` passes. Production
 * keeps the rule above as audited (#102).
 *
 * Requests with `Authorization: Bearer` (personal access tokens: the MCP
 * server, scripts) skip the check: `JwtGuard` then ignores the cookies, and a
 * page can't set that header on another origin without a CORS preflight,
 * which only `APP_URL` passes. Safe methods (`GET`, `HEAD`, `OPTIONS`) never
 * change anything and are not checked.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** `Sec-Fetch-Site` values of a request made by the app's own pages. */
const SAME_ORIGIN_FETCH_SITES = new Set(['same-origin', 'none'])

export const CROSS_ORIGIN_MESSAGE = 'Cross-origin request refused'

/** The origins the web app is served from (`APP_URL`, `WEBAUTHN_ORIGIN`). */
export function appOrigins(): ReadonlySet<string> {
  return new Set([new URL(env.APP_URL).origin, env.webauthn.origin])
}

function header(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const value = headers[name]
  return Array.isArray(value) ? value[0] : value
}

/**
 * The origin a request was addressed to: the browser's `Host` as forwarded by
 * the web proxy, else the request's own (outside production only, see above).
 */
export function addressedOrigin(
  headers: IncomingHttpHeaders,
): string | undefined {
  const host = header(headers, 'x-forwarded-host') ?? header(headers, 'host')
  if (!host) return undefined
  const proto = header(headers, 'x-forwarded-proto') ?? 'http'
  return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`
}

/**
 * Whether a request is an unsafe one coming from a page on another origin
 * (see above). `allowed` holds the app's origins; `allowAddressedOrigin`
 * (outside production) also lets through the origin the request was sent to.
 */
export function isCrossOriginWrite(
  request: { method: string; headers: IncomingHttpHeaders },
  allowed: ReadonlySet<string>,
  allowAddressedOrigin = false,
): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return false
  if (readBearerToken(header(request.headers, 'authorization'))) return false

  const origin = header(request.headers, 'origin')
  if (origin !== undefined && allowed.has(origin)) return false
  if (
    allowAddressedOrigin &&
    origin !== undefined &&
    origin === addressedOrigin(request.headers)
  )
    return false

  const fetchSite = header(request.headers, 'sec-fetch-site')
  if (fetchSite !== undefined) {
    return !SAME_ORIGIN_FETCH_SITES.has(fetchSite.toLowerCase())
  }
  return origin !== undefined
}

/**
 * Refuses cross-origin writes with 403 (`onRequest`, before the body is read
 * or any guard runs), in the API's error envelope.
 */
export function registerSameOriginCheck(
  fastify: FastifyInstance,
  allowed: ReadonlySet<string> = appOrigins(),
  allowAddressedOrigin = !env.isProduction,
): void {
  fastify.addHook('onRequest', (request, reply, done) => {
    if (!isCrossOriginWrite(request, allowed, allowAddressedOrigin))
      return done()
    void reply.code(403).send(refused(request))
  })
}

function refused(request: FastifyRequest): ErrorResponse {
  return {
    statusCode: 403,
    error: 'Forbidden',
    message: [CROSS_ORIGIN_MESSAGE],
    requestId: String(request.id),
    timestamp: new Date().toISOString(),
    path: request.url,
  }
}
