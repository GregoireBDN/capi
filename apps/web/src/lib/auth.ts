import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
import { createClient } from '#/api/client'
import { authControllerMe, authControllerRegistrationStatus } from '#/api'
import { withServerCookies } from '#/lib/server-api'
import type { UserDto } from '#/api/types.gen'

function createServerClient() {
  return createClient({
    baseUrl: process.env['VITE_API_URL'] ?? 'http://localhost:4000',
  })
}

export const getMe = createServerFn().handler(
  async (): Promise<UserDto | null> => {
    const res = await authControllerMe({
      client: createServerClient(),
      throwOnError: false,
      ...withServerCookies(),
    })
    if (res.error || !res.data) return null
    return res.data
  },
)

/**
 * The current user, or null when signed out. Use this in route guards
 * (`beforeLoad`) rather than calling `getMe` directly:
 *
 * - during SSR it runs `getMe` with the incoming request's cookies, so the
 *   guard decides before any protected markup is rendered;
 * - in the browser it calls the API directly through the shared client, whose
 *   interceptor transparently renews an expired access token with the refresh
 *   cookie (which never reaches the web server, see `api-client.ts`).
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
