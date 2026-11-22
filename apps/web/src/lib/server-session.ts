import type { UserDto } from '#/api/types.gen'
import { isTransientStatus, retryDelayMs, sleep } from '#/lib/session-errors'

/**
 * Server-side session resolution for SSR guards and the `/api` proxy.
 *
 * The browser reaches the API through the web origin (see `routes/api/$.ts`),
 * so page requests carry both session cookies: the short-lived access JWT and
 * the rotating refresh token (`__Host-token` / `__Host-refresh_token` in
 * production, `token` / `refresh_token` over HTTP in dev; see
 * `ACCESS_COOKIES`). When the access token has expired, the
 * SSR guard renews the session itself — exactly like the browser client does on
 * a 401 — and forwards the rotated cookies to the browser, so a full reload of
 * a protected page renders instead of bouncing through `/auth`.
 *
 * This module is deliberately framework-free (plain `fetch`, cookie strings in,
 * `Set-Cookie` strings out) so it can be unit tested without the TanStack Start
 * request context; `lib/auth.ts` and `routes/api/$.ts` wire it to the request.
 */

/**
 * Session cookie names, most trusted first. The API sets `__Host-` names in
 * production (#217) and plain ones outside it (HTTP dev, where `Secure`
 * cookies can't be set); the web server never sets them itself, it only reads
 * and forwards what the browser holds. A plain refresh cookie in production is
 * a session from before #217: it is presented as is, and the API moves it to
 * the `__Host-` names when it rotates it.
 */
export const ACCESS_COOKIES = ['__Host-token', 'token'] as const
export const REFRESH_COOKIES = [
  '__Host-refresh_token',
  'refresh_token',
] as const

/** A cookie as the browser sent it: name and value. */
export interface SessionCookie {
  name: string
  value: string
}

/** The first non-empty cookie among `names` (in that order). */
export function findCookie(
  cookies: Map<string, string>,
  names: readonly string[],
): SessionCookie | undefined {
  for (const name of names) {
    const value = cookies.get(name)
    if (value) return { name, value }
  }
  return undefined
}

export const ME_PATH = '/api/auth/me'
export const REFRESH_PATH = '/api/auth/refresh'

/**
 * How long a successful rotation is replayed to callers presenting the same
 * (now revoked) refresh token. See `refreshSession`.
 */
export const REFRESH_GRACE_MS = 10_000

/** Wait before the one retry of a 429 / 5xx during SSR (`Retry-After` capped). */
export const SSR_RETRY_BASE_MS = 300
export const SSR_RETRY_MAX_MS = 2_000

export interface ApiTarget {
  /** Origin of the API as seen from the web server, e.g. `http://api:4000`. */
  apiUrl: string
  /** Injectable for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** Injectable for tests; defaults to a timer. */
  sleep?: (ms: number) => Promise<void>
}

/** Result of a `POST /api/auth/refresh`, replayable to several callers. */
export interface RefreshOutcome {
  ok: boolean
  status: number
  /** The API's `Retry-After`, when it answered 429 / 503 with one. */
  retryAfter?: string | null
  /** Raw `Set-Cookie` header values returned by the API. */
  setCookies: string[]
  contentType: string | null
  body: string
}

export interface ServerSession {
  user: UserDto | null
  /** `Set-Cookie` values to forward to the browser (empty when nothing rotated). */
  setCookies: string[]
  /**
   * Cookie header to use for further API calls made while handling the same
   * request (the incoming one, or the refreshed one after a rotation).
   */
  cookieHeader: string | undefined
  /**
   * Set when the API could not say whether anyone is signed in (429, 5xx,
   * unreachable; the status, 0 without an answer): the caller forwards
   * `setCookies`, then throws a `SessionUnavailableError` instead of
   * redirecting to `/auth` (#292).
   */
  unavailable?: number
}

/** Parses a `Cookie` request header; the first occurrence of a name wins. */
export function parseCookieHeader(
  header: string | undefined,
): Map<string, string> {
  const cookies = new Map<string, string>()
  if (!header) return cookies
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const name = part.slice(0, eq).trim()
    if (!name || cookies.has(name)) continue
    cookies.set(name, part.slice(eq + 1).trim())
  }
  return cookies
}

function serializeCookieHeader(
  cookies: Map<string, string>,
): string | undefined {
  if (cookies.size === 0) return undefined
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
}

/**
 * Applies `Set-Cookie` values to a request cookie jar, so follow-up calls in the
 * same SSR request use the rotated tokens. Expired/cleared cookies are removed.
 */
export function applySetCookies(
  header: string | undefined,
  setCookies: string[],
): string | undefined {
  const cookies = parseCookieHeader(header)
  for (const setCookie of setCookies) {
    const [pair = '', ...attributes] = setCookie.split(';')
    const eq = pair.indexOf('=')
    if (eq <= 0) continue
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    const cleared =
      value === '' ||
      attributes.some((attr) => /^\s*max-age\s*=\s*0\s*$/i.test(attr)) ||
      attributes.some((attr) => {
        const match = /^\s*expires\s*=(.*)$/i.exec(attr)
        return match ? new Date(match[1].trim()).getTime() <= Date.now() : false
      })
    if (cleared) cookies.delete(name)
    else cookies.set(name, value)
  }
  return serializeCookieHeader(cookies)
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}

interface RefreshEntry {
  outcome: Promise<RefreshOutcome>
  /** Set once a successful rotation settled: replayable until then + grace. */
  expiresAt?: number
}

/**
 * Rotations keyed by the SHA-256 of the presented refresh token (the raw token
 * is never kept as a key). Process-local: Capi runs a single web instance.
 */
const refreshes = new Map<string, RefreshEntry>()

function isLive(entry: RefreshEntry, now: number): boolean {
  return entry.expiresAt === undefined || entry.expiresAt > now
}

/**
 * Rotates the session behind `refreshToken` (`POST /api/auth/refresh`).
 *
 * The API revokes a refresh token as soon as it is rotated and treats any later
 * use of it as theft, revoking the whole family. Several requests can however
 * legitimately present the same token: two tabs reloaded together, a page
 * reload racing a client-side refresh, or a request sent before the browser
 * stored the previous response's cookies. To keep those from logging the user
 * out, rotations are deduplicated per token within this process:
 *
 * - callers presenting a token whose rotation is in flight share its result;
 * - a successful result is replayed for `REFRESH_GRACE_MS` afterwards, so a
 *   straggler gets the new pair instead of tripping reuse detection (if that
 *   pair was itself rotated meanwhile, the straggler gets the latest one);
 * - failures are not cached.
 *
 * The API's rotation and reuse detection are unchanged: a token presented after
 * the grace window (or to another process) still revokes the family.
 */
export async function refreshSession(
  refreshCookie: SessionCookie,
  target: ApiTarget,
): Promise<RefreshOutcome> {
  const key = await sha256(refreshCookie.value)
  const now = Date.now()
  for (const [k, entry] of refreshes)
    if (!isLive(entry, now)) refreshes.delete(k)

  const existing = refreshes.get(key)
  if (existing) return latestRotation(await existing.outcome)

  const entry: RefreshEntry = {
    outcome: requestRefresh(refreshCookie, target).then((result) => {
      if (result.ok) entry.expiresAt = Date.now() + REFRESH_GRACE_MS
      else if (refreshes.get(key) === entry) refreshes.delete(key)
      return result
    }),
  }
  refreshes.set(key, entry)
  return entry.outcome
}

/** The refresh token a successful rotation hands out, if any. */
function rotatedRefreshToken(setCookies: string[]): string | undefined {
  for (const setCookie of setCookies) {
    const [pair = ''] = setCookie.split(';')
    const eq = pair.indexOf('=')
    if (eq <= 0) continue
    const name = pair.slice(0, eq).trim()
    if (!(REFRESH_COOKIES as readonly string[]).includes(name)) continue
    const value = pair.slice(eq + 1).trim()
    if (value) return value
  }
  return undefined
}

/**
 * Follows a replayed rotation to the newest pair: replaying a token whose
 * successor was already rotated would hand out a revoked refresh token.
 */
async function latestRotation(
  outcome: RefreshOutcome,
  depth = 5,
): Promise<RefreshOutcome> {
  if (!outcome.ok || depth === 0) return outcome
  const next = rotatedRefreshToken(outcome.setCookies)
  const entry = next ? refreshes.get(await sha256(next)) : undefined
  if (!entry || !isLive(entry, Date.now())) return outcome
  const nextOutcome = await entry.outcome
  return nextOutcome.ok ? latestRotation(nextOutcome, depth - 1) : outcome
}

async function requestRefresh(
  { name, value }: SessionCookie,
  target: ApiTarget,
): Promise<RefreshOutcome> {
  try {
    const res = await (target.fetch ?? fetch)(
      new URL(REFRESH_PATH, target.apiUrl),
      {
        method: 'POST',
        headers: { cookie: `${name}=${value}` },
        redirect: 'manual',
      },
    )
    return {
      ok: res.ok,
      status: res.status,
      retryAfter: res.headers.get('retry-after'),
      setCookies: res.headers.getSetCookie(),
      contentType: res.headers.get('content-type'),
      body: await res.text(),
    }
  } catch {
    return {
      ok: false,
      status: 502,
      setCookies: [],
      contentType: null,
      body: '',
    }
  }
}

/**
 * Drops every replayable rotation. Called on logout so a stale refresh token
 * can't be traded for the cached (now revoked) pair, and between tests.
 */
export function forgetRefreshes(): void {
  refreshes.clear()
}

interface MeOutcome {
  status: number
  user: UserDto | null
  retryAfter?: string | null
}

async function fetchMeOnce(
  cookieHeader: string | undefined,
  target: ApiTarget,
): Promise<MeOutcome> {
  const doFetch = target.fetch ?? fetch
  try {
    const res = await doFetch(new URL(ME_PATH, target.apiUrl), {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
      redirect: 'manual',
    })
    if (!res.ok) {
      return {
        status: res.status,
        user: null,
        retryAfter: res.headers.get('retry-after'),
      }
    }
    return { status: res.status, user: (await res.json()) as UserDto }
  } catch {
    return { status: 0, user: null }
  }
}

/** Waits as a transient failure asks (its `Retry-After`, capped). */
function waitBeforeRetry(
  retryAfter: string | null | undefined,
  target: ApiTarget,
): Promise<void> {
  const headers = new Headers(retryAfter ? { 'retry-after': retryAfter } : {})
  return (target.sleep ?? sleep)(
    retryDelayMs({ headers }, SSR_RETRY_BASE_MS, SSR_RETRY_MAX_MS),
  )
}

/** `GET /api/auth/me`, retried once after a 429 / 5xx / no answer. */
async function fetchMe(
  cookieHeader: string | undefined,
  target: ApiTarget,
): Promise<MeOutcome> {
  const first = await fetchMeOnce(cookieHeader, target)
  if (first.user || !isRetryable(first.status)) return first
  await waitBeforeRetry(first.retryAfter, target)
  return fetchMeOnce(cookieHeader, target)
}

/** No answer (0) or a transient status: worth one more try, never « signed out ». */
function isRetryable(status: number): boolean {
  return status === 0 || isTransientStatus(status)
}

/**
 * Resolves the signed-in user for an incoming request, renewing an expired
 * access token with the refresh cookie when needed.
 *
 * - valid access token → the user, nothing to forward;
 * - missing/expired access token + refresh token → rotate, then retry with the new
 *   access token; the rotated `Set-Cookie` values are returned for forwarding;
 * - no usable cookie, or a refresh the API refused (401) → `user: null` (the
 *   guard redirects to `/auth` before rendering anything);
 * - the API rate-limited, failing or unreachable, on `me` or on the refresh
 *   (after one retry) → `unavailable`: the guard shows the error page, never
 *   the login page (#292).
 */
export async function resolveServerSession(
  cookieHeader: string | undefined,
  target: ApiTarget,
): Promise<ServerSession> {
  const cookies = parseCookieHeader(cookieHeader)
  const anonymous: ServerSession = { user: null, setCookies: [], cookieHeader }

  if (findCookie(cookies, ACCESS_COOKIES)) {
    const me = await fetchMe(cookieHeader, target)
    if (me.user) return { user: me.user, setCookies: [], cookieHeader }
    // Only an auth failure is worth a refresh, or means signed out.
    if (me.status !== 401) return { ...anonymous, unavailable: me.status }
  }

  const refreshCookie = findCookie(cookies, REFRESH_COOKIES)
  if (!refreshCookie) return anonymous

  let refreshed = await refreshSession(refreshCookie, target)
  if (!refreshed.ok && isRetryable(refreshed.status)) {
    // Its response may have been lost after the API rotated the token: the
    // API accepts the same token again within its grace.
    await waitBeforeRetry(refreshed.retryAfter, target)
    refreshed = await refreshSession(refreshCookie, target)
  }
  if (!refreshed.ok) {
    return isRetryable(refreshed.status)
      ? { ...anonymous, unavailable: refreshed.status }
      : anonymous
  }

  const nextCookieHeader = applySetCookies(cookieHeader, refreshed.setCookies)
  const me = await fetchMe(nextCookieHeader, target)
  return {
    user: me.user,
    // Forward the rotation even if `/me` failed: the old refresh token is
    // revoked now, so the browser must not keep presenting it.
    setCookies: refreshed.setCookies,
    cookieHeader: nextCookieHeader,
    ...(me.user || me.status === 401 ? {} : { unavailable: me.status }),
  }
}
