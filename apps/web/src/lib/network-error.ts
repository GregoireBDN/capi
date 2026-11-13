/**
 * Messages browsers give the `TypeError` a `fetch` rejects with when the
 * request never got a response (offline, DNS failure, VPN down, ...):
 * Chromium "Failed to fetch", Safari "Load failed", Firefox "NetworkError when
 * attempting to fetch resource.".
 */
const NETWORK_ERROR_MESSAGES = [
  'failed to fetch',
  'load failed',
  'networkerror',
  'network error',
  'network request failed',
]

/** Whether the browser says it has no network at all. */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * Thrown instead of sending a request the browser already knows can't get
 * through (it reports itself offline).
 */
export class NetworkUnavailableError extends Error {
  override name = 'NetworkUnavailableError'
  constructor() {
    super('The browser is offline')
  }
}

/**
 * Whether `error` means the server could not be reached, as opposed to an
 * error the server answered with or a bug in the page. Any error counts while
 * the browser reports itself offline, and so does a request that timed out
 * (`AbortSignal.timeout`).
 */
export function isNetworkError(error: unknown): boolean {
  if (isOffline()) return true
  if (error instanceof NetworkUnavailableError) return true
  if (error instanceof DOMException && error.name === 'TimeoutError')
    return true
  if (!(error instanceof TypeError)) return false
  const message = error.message.toLowerCase()
  return NETWORK_ERROR_MESSAGES.some((text) => message.includes(text))
}
