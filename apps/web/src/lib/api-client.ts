import { client } from '#/api/client.gen'
import { forgetCurrentUser } from '#/lib/current-user'
import {
  createSessionRefresher,
  unavailableResponse,
} from '#/lib/session-refresh'

/**
 * The browser always calls the API on its own origin: the web server proxies
 * `/api/*` to the API (`routes/api/$.ts`), so the session cookies belong to the
 * web origin and reach the SSR guard too. Generated paths already start with
 * `/api`, hence the empty (relative) base URL. On the server, the default
 * client targets the API directly.
 */
const baseUrl = import.meta.env.SSR
  ? (process.env['API_URL'] ?? 'http://localhost:4000')
  : ''

// Configure the default client used by all generated API services.
// Import this file at the app entry point (router.tsx) before any API call.
client.setConfig({
  baseUrl,
  credentials: 'same-origin',
})

/**
 * Transparent access-token renewal.
 *
 * Access tokens are short-lived (15 min); refresh tokens live in an httpOnly
 * cookie the browser never exposes to JS. When a request comes back `401`, we
 * hit `/api/auth/refresh` to rotate the pair, then replay the original
 * request. Concurrent 401s share a single in-flight refresh so we never fire
 * multiple rotations for one expiry. A refresh that fails for a transient
 * reason (429, 5xx, no answer) is retried, and never turned into « signed
 * out » (#292, `session-refresh.ts`).
 */

/**
 * Endpoints where a 401 is a genuine auth failure (bad credentials, missing
 * session) rather than an expired access token — replaying them makes no sense.
 */
const NO_RETRY = [
  '/api/auth/refresh',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/passkeys/authentication',
]

/** Clones taken before the body is consumed, so a 401 can be replayed. */
const replayable = new WeakMap<Request, Request>()

const sessionRefresher = createSessionRefresher({
  // The session is over: the guard must ask the API again.
  onRefused: forgetCurrentUser,
})

client.interceptors.request.use((request) => {
  // Stash a pristine clone now — after fetch consumes the body it can't clone.
  replayable.set(request, request.clone())
  return request
})

client.interceptors.response.use(async (response, request) => {
  const retry = replayable.get(request)
  replayable.delete(request)

  if (
    response.status !== 401 ||
    !retry ||
    // On the server the session was renewed by the guard (`getMe`), and a
    // relative refresh URL means nothing there.
    import.meta.env.SSR ||
    NO_RETRY.some((path) => request.url.includes(path))
  ) {
    return response
  }

  const refreshed = await sessionRefresher.refresh()
  if (refreshed.kind === 'refused') return response
  if (refreshed.kind === 'unavailable') return unavailableResponse(refreshed)

  // Replay with a bypass of these interceptors (raw fetch) to avoid loops.
  return fetch(retry)
})

export { client }
