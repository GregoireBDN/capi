import type { UserDto } from '#/api/types.gen'
import { NetworkUnavailableError, isOffline } from '#/lib/network-error'

/**
 * How long the browser waits for `GET /api/auth/me` before giving up. It is
 * the only request an in-app navigation waits for (the `_app` guard), and some
 * networks (iOS offline, a VPN down) hold requests instead of failing them.
 */
export const CURRENT_USER_TIMEOUT_MS = 8_000

/** What the generated client returns for `GET /api/auth/me` with `throwOnError: false`. */
export interface MeResult {
  data?: UserDto
  error?: unknown
  response?: Response
}

/**
 * The signed-in user from a `GET /api/auth/me` result, or null when the API
 * answered that nobody is signed in.
 *
 * When the request got no response at all (offline, server unreachable), the
 * error is thrown instead: returning null would make the route guards send a
 * signed-in owner to the login page just because the network dropped.
 */
export function currentUserFromResult(result: MeResult): UserDto | null {
  if (result.error !== undefined && !result.response) throw result.error
  return result.error !== undefined || !result.data ? null : result.data
}

/**
 * The current user in the browser, from `me` (`GET /api/auth/me`). While the
 * browser reports itself offline nothing is sent and a network error is thrown
 * at once, so the "Hors ligne" page shows without waiting for the request to
 * fail; otherwise the request is aborted after `CURRENT_USER_TIMEOUT_MS`.
 */
export async function loadCurrentUser(
  me: (signal: AbortSignal) => Promise<MeResult>,
): Promise<UserDto | null> {
  if (isOffline()) throw new NetworkUnavailableError()
  return currentUserFromResult(
    await me(AbortSignal.timeout(CURRENT_USER_TIMEOUT_MS)),
  )
}
