import { getRequest, getRequestHeader } from '@tanstack/react-start/server'

/**
 * Origin of the API as reached from the web server (SSR calls and the `/api`
 * proxy in `routes/api/$.ts`). Read at runtime, so the production image can
 * point it at the compose service (`API_URL=http://api:4000`). The browser
 * never uses it: it always calls the relative `/api` on the web origin.
 */
export function serverApiUrl(): string {
  return process.env['API_URL'] ?? 'http://localhost:4000'
}

/**
 * Cookie header to use for the rest of a request once the SSR guard rotated the
 * session (see `getMe` in `lib/auth.ts`), keyed by the incoming request.
 */
const refreshedCookies = new WeakMap<Request, string | undefined>()

export function setRequestCookieHeader(cookie: string | undefined): void {
  refreshedCookies.set(getRequest(), cookie)
}

/** The current request's cookies, including any rotation made during SSR. */
export function getRequestCookieHeader(): string | undefined {
  const request = getRequest()
  return refreshedCookies.has(request)
    ? refreshedCookies.get(request)
    : getRequestHeader('cookie')
}

/**
 * Forward the current request's cookies to the API for SSR loaders.
 * Use inside createServerFn() handlers that call generated API services.
 */
export function withServerCookies(): { headers?: Record<string, string> } {
  const cookie = getRequestCookieHeader()
  return cookie ? { headers: { cookie } } : {}
}
