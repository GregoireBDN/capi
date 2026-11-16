import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'
import { isApiPath, withCacheHeaders, withHeaders } from '#/lib/cache-policy'
import type { CspNonceContext } from '#/lib/csp-nonce'
import {
  createCspNonce,
  keepsOpener,
  pageSecurityHeaders,
} from '#/lib/security-headers'

/**
 * `Cache-Control` for every response of the Start handler (SSR pages, server
 * functions, `/api` proxy); policy in `lib/cache-policy.ts`. A global request
 * middleware rather than per-route `headers` so redirects, errors and future
 * routes are covered by default. Listed first so it also wraps responses that
 * later middleware (CSRF rejections) return early.
 */
export const cacheHeadersMiddleware = createMiddleware().server(
  async ({ next, pathname }) => {
    const result = await next()
    return { ...result, response: withCacheHeaders(result.response, pathname) }
  },
)

/**
 * Content-Security-Policy, frame protection, `Permissions-Policy` and
 * cross-origin isolation (COOP / CORP, but no COOP on the OAuth consent flow,
 * `keepsOpener`) for everything but the `/api`
 * proxy (which keeps the API's helmet headers); policy in
 * `lib/security-headers.ts`. The nonce is passed down in the request context,
 * where `getRouter` picks it up for TanStack's inline scripts
 * (`lib/csp-nonce.ts`). Listed before CSRF so its rejections get the headers.
 */
export const securityHeadersMiddleware = createMiddleware().server(
  async ({ next, pathname, request }) => {
    if (isApiPath(pathname)) return next<CspNonceContext>({ context: {} })
    const cspNonce = createCspNonce()
    const result = await next<CspNonceContext>({ context: { cspNonce } })
    const headers = await pageSecurityHeaders(cspNonce, {
      dev: import.meta.env.DEV,
      keepOpener: keepsOpener(new URL(request.url)),
    })
    return { ...result, response: withHeaders(result.response, headers) }
  },
)

/**
 * Declaring a Start instance replaces Start's default request middleware, so
 * its CSRF protection for server functions is restated here unchanged.
 */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [
    cacheHeadersMiddleware,
    securityHeadersMiddleware,
    csrfMiddleware,
  ],
}))
