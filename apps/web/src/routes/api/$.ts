import { createFileRoute } from '@tanstack/react-router'
import { getRequestIP } from '@tanstack/react-start/server'
import { proxyToApi } from '#/lib/api-proxy'
import { serverApiUrl } from '#/lib/server-api'

/**
 * `/api/*` → API. The browser calls the API on the web origin so the session
 * cookies are first-party and visible to the SSR guard (see `lib/api-proxy.ts`).
 * The target is `API_URL` (default `http://localhost:4000`), read at runtime.
 * `getRequestIP()` is the socket address; the proxy only believes an incoming
 * `X-Forwarded-For` when that peer is in `TRUSTED_PROXIES` (`lib/client-ip.ts`).
 */
export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      ANY: ({ request }) =>
        proxyToApi(request, { apiUrl: serverApiUrl() }, getRequestIP()),
    },
  },
})
