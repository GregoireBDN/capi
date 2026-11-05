import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
import { getResponseHeaders } from '@tanstack/react-start/server'
import { createClient } from '#/api/client'
import { authControllerMe, authControllerRegistrationStatus } from '#/api'
import {
  getRequestCookieHeader,
  serverApiUrl,
  setRequestCookieHeader,
} from '#/lib/server-api'
import { resolveServerSession } from '#/lib/server-session'
import type { UserDto } from '#/api/types.gen'

function createServerClient() {
  return createClient({ baseUrl: serverApiUrl() })
}

/**
 * The signed-in user for the current SSR request, or null.
 *
 * When the access token has expired but the refresh cookie is still valid, the
 * session is rotated server-side (`resolveServerSession`) and the new cookies
 * are appended to this response, so the browser keeps the rotated pair and the
 * page renders without a detour through `/auth`.
 */
export const getMe = createServerFn().handler(
  async (): Promise<UserDto | null> => {
    const session = await resolveServerSession(getRequestCookieHeader(), {
      apiUrl: serverApiUrl(),
    })
    if (session.setCookies.length > 0) {
      const headers = getResponseHeaders()
      for (const value of session.setCookies) headers.append('set-cookie', value)
      setRequestCookieHeader(session.cookieHeader)
    }
    return session.user
  },
)

/**
 * The current user, or null when signed out. Use this in route guards
 * (`beforeLoad`) rather than calling `getMe` directly:
 *
 * - during SSR it runs `getMe` with the incoming request's cookies (renewing
 *   an expired access token with the refresh cookie), so the guard decides
 *   before any protected markup is rendered;
 * - in the browser it calls the API through the shared client, whose
 *   interceptor transparently renews an expired access token (`api-client.ts`).
 */
export const fetchCurrentUser = createIsomorphicFn()
  .server((): Promise<UserDto | null> => getMe())
  .client(async (): Promise<UserDto | null> => {
    const res = await authControllerMe({ throwOnError: false })
    return res.error || !res.data ? null : res.data
  })

/**
 * Whether public sign-up is still open. Finances is single-user: once the owner
 * account exists the API rejects registration, so the UI hides it too. Fails
 * closed (returns false) if the API can't be reached.
 */
export const getRegistrationOpen = createServerFn().handler(
  async (): Promise<boolean> => {
    const res = await authControllerRegistrationStatus({
      client: createServerClient(),
      throwOnError: false,
    })
    return res.data?.open ?? false
  },
)
