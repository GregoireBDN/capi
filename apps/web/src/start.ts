import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'
import { withCacheHeaders } from '#/lib/cache-policy'

/**
 * `Cache-Control` for every response of the Start handler (SSR pages, server
 * functions, `/api` proxy); policy in `lib/cache-policy.ts`. A global request
 * middleware rather than per-route `headers` so redirects, errors and future
 * routes are covered by default. Listed first so it also wraps responses that
 * later middleware (CSRF rejections) return early.
 */
const cacheHeadersMiddleware = createMiddleware().server(
  async ({ next, pathname }) => {
    const result = await next()
    return { ...result, response: withCacheHeaders(result.response, pathname) }
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
  requestMiddleware: [cacheHeadersMiddleware, csrfMiddleware],
}))
