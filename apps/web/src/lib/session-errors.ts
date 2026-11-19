/**
 * Telling « signed out » apart from « could not check » (#292).
 *
 * Only a 401 from the API means nobody is signed in. A 429 (rate limit), a 5xx
 * (the API restarting during a deploy) or no answer at all says nothing about
 * the session: the guards show the error page with « Réessayer » instead of
 * sending a signed-in owner to `/auth`.
 */

/**
 * The API could not say whether the owner is signed in (`status`: the HTTP
 * status it answered with, 0 when there was no answer). Never means signed out.
 */
export class SessionUnavailableError extends Error {
  override name = 'SessionUnavailableError'
  constructor(readonly status: number) {
    super(`Session check unavailable (${status || 'no response'})`)
  }
}

/** Whether a status is worth retrying: timeouts, rate limits, server errors. */
export function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

/**
 * How long to wait before retrying `response`: its `Retry-After` (seconds or
 * an HTTP date) when it has one, else `fallbackMs`; never more than `maxMs`.
 */
export function retryDelayMs(
  response: Pick<Response, 'headers'> | undefined,
  fallbackMs: number,
  maxMs: number,
  now = Date.now(),
): number {
  const header = response?.headers.get('retry-after')?.trim()
  let delay = fallbackMs
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds) && seconds >= 0) delay = seconds * 1000
    else {
      const date = Date.parse(header)
      if (!Number.isNaN(date)) delay = Math.max(0, date - now)
    }
  }
  return Math.min(delay, maxMs)
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))
