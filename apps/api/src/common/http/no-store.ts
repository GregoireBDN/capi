import type { FastifyInstance } from 'fastify'

/**
 * Every API response is private to the signed-in owner (or about the session
 * itself), so none of it may be kept by the browser's HTTP cache, the
 * back/forward cache or an intermediary. `Pragma`/`Expires` cover HTTP/1.0
 * caches. Set in `onSend` so it also wins over plugins that set their own
 * `Cache-Control` (e.g. the Swagger UI static files) and applies to errors.
 */
export const NO_STORE_HEADERS = {
  'cache-control': 'no-store',
  pragma: 'no-cache',
  expires: '0',
} as const

export function registerNoStoreHeaders(fastify: FastifyInstance): void {
  fastify.addHook('onSend', (_request, reply, payload, done) => {
    reply.headers(NO_STORE_HEADERS)
    done(null, payload)
  })
}
