import { createServerFn } from '@tanstack/react-start'
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
