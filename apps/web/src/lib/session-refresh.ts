import { isOffline } from '#/lib/network-error'
import { isTransientStatus, retryDelayMs, sleep } from '#/lib/session-errors'

/**
 * Renewal of the access token in the browser (`api-client.ts`), kept free of
 * the generated client so it can be tested on its own.
 *
 * `POST /api/auth/refresh` answers 200 (renewed), 401 (the session is over)
 * or something transient: a 429 (rate limit), a 5xx (the API restarting) or
 * no answer at all (network drop, the response lost while iOS suspended the
 * app). Only a 401 means signed out (#292): a transient failure is retried
 * after a short delay (honouring `Retry-After`), and if it keeps failing the
 * caller gets that failure, never the 401 that would send the owner to
 * `/auth`. Retrying a refresh whose response was lost presents the previous
 * refresh token again, which the API accepts within its grace
 * (`SESSION_REFRESH_REUSE_GRACE_MS`).
 */

export const REFRESH_URL = '/api/auth/refresh'
/** Tries of one renewal, the first included. */
export const REFRESH_ATTEMPTS = 3
/** Delay before the n-th retry when the API gives no `Retry-After`. */
export const REFRESH_RETRY_BASE_MS = 1_000
/** Longest wait between two tries, whatever `Retry-After` says. */
export const REFRESH_RETRY_MAX_MS = 5_000

export type RefreshResult =
  | { kind: 'renewed' }
  /** The API refused the refresh token (401...): signed out. */
  | { kind: 'refused' }
  /** No verdict: `status` of the last try (0 without an answer). */
  | { kind: 'unavailable'; status: number; retryAfter: string | null }

export interface SessionRefresherOptions {
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  /** Called when the session is over (e.g. to drop the cached user). */
  onRefused?: () => void
}

export function createSessionRefresher({
  fetch: doFetch = (...args) => fetch(...args),
  sleep: wait = sleep,
  onRefused,
}: SessionRefresherOptions = {}) {
  let inFlight: Promise<RefreshResult> | null = null

  async function attempt(): Promise<RefreshResult> {
    for (let tries = 1; ; tries++) {
      let response: Response | undefined
      try {
        response = await doFetch(REFRESH_URL, {
          method: 'POST',
          credentials: 'same-origin',
        })
      } catch {
        response = undefined
      }
      if (response?.ok) return { kind: 'renewed' }
      if (response && !isTransientStatus(response.status)) {
        onRefused?.()
        return { kind: 'refused' }
      }
      if (tries >= REFRESH_ATTEMPTS || isOffline()) {
        return {
          kind: 'unavailable',
          status: response?.status ?? 0,
          retryAfter: response?.headers.get('retry-after') ?? null,
        }
      }
      await wait(
        retryDelayMs(
          response,
          REFRESH_RETRY_BASE_MS * tries,
          REFRESH_RETRY_MAX_MS,
        ),
      )
    }
  }

  /** One renewal at a time: concurrent 401s share it. */
  function refresh(): Promise<RefreshResult> {
    inFlight ??= attempt().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  return { refresh }
}

/**
 * What a request that came back 401 resolves to when the renewal gave no
 * verdict: the renewal's own status (503 without an answer), so the guards and
 * pages see a temporary error rather than « signed out ». A new `Response` per
 * caller, since concurrent callers share one renewal.
 */
export function unavailableResponse(
  result: Extract<RefreshResult, { kind: 'unavailable' }>,
): Response {
  const status = result.status || 503
  const headers = new Headers({ 'content-type': 'application/json' })
  if (result.retryAfter) headers.set('retry-after', result.retryAfter)
  return new Response(
    JSON.stringify({
      statusCode: status,
      message: ['Session renewal unavailable'],
    }),
    { status, headers },
  )
}
