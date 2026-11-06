/**
 * HTTP cache policy for every response produced by the web server itself
 * (SSR pages, server functions, the `/api` proxy). Static files (`/assets/*`
 * hashed bundles, icons, manifest, `sw.js`) are served by Nitro before the
 * TanStack Start handler runs, so they never reach this policy and keep their
 * own caching.
 *
 * Nothing the handler renders is public: signed-in pages carry financial data,
 * and `/auth`, `/reset-password`, `/verify-email` or `/` depend on the session
 * (redirects) or carry one-time tokens. So everything is `no-store`, which
 * also keeps pages out of the back/forward cache after logout. `/api` responses
 * mirror the API's own headers (`apps/api/src/common/http/no-store.ts`), so
 * responses the proxy builds itself (deduplicated refresh, 502) match.
 */
export type CacheHeaders = Readonly<Record<string, string>>

export const API_CACHE_HEADERS: CacheHeaders = {
  'cache-control': 'no-store',
  pragma: 'no-cache',
  expires: '0',
}

export const PAGE_CACHE_HEADERS: CacheHeaders = {
  'cache-control': 'private, no-store',
}

export function cacheHeadersFor(pathname: string): CacheHeaders {
  return pathname === '/api' || pathname.startsWith('/api/')
    ? API_CACHE_HEADERS
    : PAGE_CACHE_HEADERS
}

/**
 * Applies the policy in place, so the response keeps its identity (TanStack
 * reads extra properties off redirect responses). Responses with immutable
 * headers (`Response.redirect`, raw `fetch` results) are copied instead.
 */
export function withCacheHeaders(
  response: Response,
  pathname: string,
): Response {
  const policy = Object.entries(cacheHeadersFor(pathname))
  try {
    for (const [name, value] of policy) response.headers.set(name, value)
    return response
  } catch {
    const copy = new Response(response.body, response)
    for (const [name, value] of policy) copy.headers.set(name, value)
    return copy
  }
}
