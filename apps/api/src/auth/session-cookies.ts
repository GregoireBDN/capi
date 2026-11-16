import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '#/auth/auth.constants'
import type { SessionTokens } from '#/auth/auth.service'
import { env } from '#/config/env'

/** Unprefixed names: every cookie before #217, and the names outside production. */
export const UNPREFIXED_ACCESS_COOKIE = 'token'
export const UNPREFIXED_REFRESH_COOKIE = 'refresh_token'
/**
 * `__Host-` (ASVS 3.4.4, #217): the browser only accepts such a cookie with
 * `Secure`, `Path=/` and no `Domain`, so a sibling subdomain can't set one for
 * the app (cookie tossing) the way it can set a plain `token` on the parent
 * domain.
 */
export const HOST_COOKIE_PREFIX = '__Host-'

/**
 * Path the refresh cookie used before it moved to `/`. A leftover cookie there
 * would shadow the current one on `/api/auth/*` requests (the most specific
 * path is sent first) and present a revoked token, so it is cleared whenever
 * the session cookies are set or cleared.
 */
export const LEGACY_REFRESH_COOKIE_PATH = '/api/auth'

/** Names and attributes of the session cookies, for one deployment. */
export interface SessionCookieConfig {
  /** `Secure` cookies, `__Host-` names (production). */
  secure: boolean
  /** Access token cookie, read by `JwtGuard`. */
  access: string
  /**
   * Refresh token cookie (httpOnly, first-party: the browser reaches the API
   * through the web origin's `/api` proxy). Scoped to `/` rather than
   * `/api/auth` because the web app's SSR guard must see it on page requests
   * (`/dashboard`, ...) to renew an expired access token before deciding to
   * redirect to the login page.
   */
  refresh: string
  /**
   * The unprefixed names the cookies had before `__Host-` (production only).
   * One-release migration: a refresh still accepts the old refresh cookie when
   * the prefixed one is missing, and every reply that sets or clears the
   * session clears the old pair, so a signed-in owner moves to the new names
   * at their next refresh without signing in again.
   */
  legacy: { access: string; refresh: string } | null
}

/**
 * `__Host-` needs `Secure`, which browsers refuse over plain HTTP outside
 * `localhost` (the phone reaching `vite dev --host` on the LAN, Safari on
 * `localhost`): outside production the cookies keep their plain names.
 */
export function sessionCookieConfig(secure: boolean): SessionCookieConfig {
  if (!secure) {
    return {
      secure,
      access: UNPREFIXED_ACCESS_COOKIE,
      refresh: UNPREFIXED_REFRESH_COOKIE,
      legacy: null,
    }
  }
  return {
    secure,
    access: `${HOST_COOKIE_PREFIX}${UNPREFIXED_ACCESS_COOKIE}`,
    refresh: `${HOST_COOKIE_PREFIX}${UNPREFIXED_REFRESH_COOKIE}`,
    legacy: {
      access: UNPREFIXED_ACCESS_COOKIE,
      refresh: UNPREFIXED_REFRESH_COOKIE,
    },
  }
}

export const SESSION_COOKIES = sessionCookieConfig(env.isProduction)

function cookieOptions(config: SessionCookieConfig) {
  return {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: config.secure,
  } as const
}

/** The access token presented by the browser (current name only). */
export function readAccessCookie(
  req: FastifyRequest,
  config: SessionCookieConfig = SESSION_COOKIES,
): string | undefined {
  return req.cookies?.[config.access] || undefined
}

/**
 * The refresh token presented by the browser: the current cookie, else (one
 * release, see `SessionCookieConfig.legacy`) the unprefixed one.
 */
export function readRefreshCookie(
  req: FastifyRequest,
  config: SessionCookieConfig = SESSION_COOKIES,
): string | undefined {
  const current = req.cookies?.[config.refresh]
  if (current) return current
  return (config.legacy && req.cookies?.[config.legacy.refresh]) || undefined
}

/** Clears the cookies of older releases (legacy names and path). */
function clearLegacyCookies(
  reply: FastifyReply,
  config: SessionCookieConfig,
): FastifyReply {
  const options = cookieOptions(config)
  reply.clearCookie(UNPREFIXED_REFRESH_COOKIE, {
    ...options,
    path: LEGACY_REFRESH_COOKIE_PATH,
  })
  if (config.legacy) {
    reply
      .clearCookie(config.legacy.access, options)
      .clearCookie(config.legacy.refresh, options)
  }
  return reply
}

/**
 * Sets the session pair on a JSON reply via the Fastify cookie API. Every
 * sign-in (password, passkey, sign-up) and refresh goes through here. The
 * cookies of older releases are cleared first, so the new ones win.
 */
export function setSessionCookies(
  reply: FastifyReply,
  { accessToken, refreshToken }: SessionTokens,
  config: SessionCookieConfig = SESSION_COOKIES,
): void {
  const options = cookieOptions(config)
  clearLegacyCookies(reply, config)
    .cookie(config.access, accessToken, {
      ...options,
      maxAge: ACCESS_TOKEN_TTL_SECONDS,
    })
    .cookie(config.refresh, refreshToken, {
      ...options,
      maxAge: REFRESH_TOKEN_TTL_SECONDS,
    })
}

/** Logout: clears the session pair and the cookies of older releases. */
export function clearSessionCookies(
  reply: FastifyReply,
  config: SessionCookieConfig = SESSION_COOKIES,
): FastifyReply {
  const options = cookieOptions(config)
  return clearLegacyCookies(
    reply
      .clearCookie(config.access, options)
      .clearCookie(config.refresh, options),
    config,
  )
}
