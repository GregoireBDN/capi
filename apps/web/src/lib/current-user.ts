import type { UserDto } from '#/api/types.gen'
import { NetworkUnavailableError, isOffline } from '#/lib/network-error'
import {
  SessionUnavailableError,
  isTransientStatus,
  retryDelayMs,
  sleep,
} from '#/lib/session-errors'

/**
 * How long the browser waits for `GET /api/auth/me` before giving up. It is
 * the only request an in-app navigation waits for (the `_app` guard), and some
 * networks (iOS offline, a VPN down) hold requests instead of failing them.
 */
export const CURRENT_USER_TIMEOUT_MS = 8_000

/**
 * How long a signed-in answer is reused by the guards (#292). The router
 * preloads a page when a link is hovered or touched (`defaultPreload:
 * 'intent'`), running the `_app` guard each time: without it, moving over the
 * sidebar sent one `GET /api/auth/me` per link and could reach the API's rate
 * limit (60 a minute), whose 429 then read as « signed out ». Pages still call
 * the API with the session, so an ended session shows on the next request.
 */
export const CURRENT_USER_CACHE_MS = 10_000

/** Wait before the one automatic retry of a 429 / 5xx (`Retry-After` capped). */
export const CURRENT_USER_RETRY_BASE_MS = 500
export const CURRENT_USER_RETRY_MAX_MS = 3_000

/** What the generated client returns for `GET /api/auth/me` with `throwOnError: false`. */
export interface MeResult {
  data?: UserDto
  error?: unknown
  response?: Response
}

/**
 * The signed-in user from a `GET /api/auth/me` result, or null when the API
 * answered that nobody is signed in (401, and only 401).
 *
 * Anything else is thrown, so the route guards show the error page with
 * « Réessayer » rather than sending a signed-in owner to the login page: no
 * response at all (offline, server unreachable) throws the network error, any
 * other status (429 rate limit, 5xx while the API restarts) a
 * `SessionUnavailableError`.
 */
export function currentUserFromResult(result: MeResult): UserDto | null {
  if (result.error === undefined) return result.data ?? null
  if (!result.response) throw result.error
  if (result.response.status === 401) return null
  throw new SessionUnavailableError(result.response.status)
}

let cached: { user: UserDto; until: number } | undefined
let inFlight: Promise<UserDto | null> | undefined

/**
 * Drops the remembered user: on logout, and when a refresh is refused, so the
 * next navigation asks the API again.
 */
export function forgetCurrentUser(): void {
  cached = undefined
  inFlight = undefined
}

/**
 * The current user in the browser, from `me` (`GET /api/auth/me`). While the
 * browser reports itself offline nothing is sent and a network error is thrown
 * at once, so the "Hors ligne" page shows without waiting for the request to
 * fail; otherwise the request is aborted after `CURRENT_USER_TIMEOUT_MS`.
 *
 * A signed-in answer is reused for `CURRENT_USER_CACHE_MS` and concurrent
 * calls share one request. A 429 / 5xx is retried once after a short delay
 * before the error is thrown.
 */
export async function loadCurrentUser(
  me: (signal: AbortSignal) => Promise<MeResult>,
  {
    wait = sleep,
    now = Date.now,
  }: { wait?: typeof sleep; now?: () => number } = {},
): Promise<UserDto | null> {
  if (isOffline()) throw new NetworkUnavailableError()
  if (cached && cached.until > now()) return cached.user

  const request = (inFlight ??= ask(me, wait).then(
    (user) => {
      if (inFlight === request) {
        inFlight = undefined
        cached = user
          ? { user, until: now() + CURRENT_USER_CACHE_MS }
          : undefined
      }
      return user
    },
    (error: unknown) => {
      if (inFlight === request) inFlight = undefined
      throw error
    },
  ))
  return request
}

async function ask(
  me: (signal: AbortSignal) => Promise<MeResult>,
  wait: typeof sleep,
): Promise<UserDto | null> {
  const first = await me(AbortSignal.timeout(CURRENT_USER_TIMEOUT_MS))
  const status = first.error === undefined ? 200 : first.response?.status
  if (status === undefined || !isTransientStatus(status)) {
    return currentUserFromResult(first)
  }
  await wait(
    retryDelayMs(
      first.response,
      CURRENT_USER_RETRY_BASE_MS,
      CURRENT_USER_RETRY_MAX_MS,
    ),
  )
  return currentUserFromResult(
    await me(AbortSignal.timeout(CURRENT_USER_TIMEOUT_MS)),
  )
}
