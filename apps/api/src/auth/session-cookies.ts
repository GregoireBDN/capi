import type { FastifyReply } from 'fastify'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '#/auth/auth.constants'
import type { SessionTokens } from '#/auth/auth.service'
import { env } from '#/config/env'

export const COOKIE_DEFAULTS = {
  httpOnly: true,
  path: '/',
  sameSite: 'lax',
  secure: env.isProduction,
} as const

/** Access token cookie — sent on every API request for the JwtGuard. */
export const ACCESS_COOKIE = 'token'
/**
 * Refresh token cookie (httpOnly, first-party: the browser reaches the API
 * through the web origin's `/api` proxy). Scoped to `/` rather than `/api/auth`
 * because the web app's SSR guard must see it on page requests (`/dashboard`,
 * ...) to renew an expired access token before deciding to redirect to the
 * login page.
 */
export const REFRESH_COOKIE = 'refresh_token'
export const REFRESH_COOKIE_PATH = '/'
/**
 * Path the refresh cookie used before it moved to `/`. A leftover cookie there
 * would shadow the current one on `/api/auth/*` requests (the most specific
 * path is sent first) and present a revoked token, so it is cleared whenever
 * the session cookies are set or cleared.
 */
export const LEGACY_REFRESH_COOKIE_PATH = '/api/auth'

/**
 * Sets the session pair on a JSON reply via the Fastify cookie API. Every
 * sign-in (password, passkey, sign-up) and refresh goes through here.
 */
export function setSessionCookies(
  reply: FastifyReply,
  { accessToken, refreshToken }: SessionTokens,
): void {
  reply
    .clearCookie(REFRESH_COOKIE, {
      ...COOKIE_DEFAULTS,
      path: LEGACY_REFRESH_COOKIE_PATH,
    })
    .cookie(ACCESS_COOKIE, accessToken, {
      ...COOKIE_DEFAULTS,
      maxAge: ACCESS_TOKEN_TTL_SECONDS,
    })
    .cookie(REFRESH_COOKIE, refreshToken, {
      ...COOKIE_DEFAULTS,
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_TOKEN_TTL_SECONDS,
    })
}
