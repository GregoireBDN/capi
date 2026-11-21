/// <reference lib="webworker" />
/**
 * Hand-written service worker, emitted as `/sw.js` by the Vite plugin in
 * `plugins/service-worker.ts` (production client build only).
 *
 * Security first: only the static app shell is cached. `/api/*`, non-GET and
 * cross-origin requests are not intercepted, and server-rendered pages are
 * never stored (network first, offline page as the only fallback). See
 * `../routing.ts` for the decisions and docs/domain/pwa.md for the overview.
 *
 * Must stay self-contained: the plugin fails the build if this chunk imports
 * anything (it is registered as a classic script).
 */
import {
  OFFLINE_URL,
  routeRequest,
  shellCacheName,
  staleCaches,
} from '../routing'
import type { PrecacheManifest } from '../routing'

declare const self: ServiceWorkerGlobalScope
/** Replaced at build time with the precache manifest (JSON literal). */
declare const __SW_MANIFEST__: PrecacheManifest

const manifest = __SW_MANIFEST__
const CACHE = shellCacheName(manifest.version)
const precached = new Set(manifest.urls)

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await Promise.all(
        manifest.urls.map(async (url) => {
          // No cookies on precache requests, and bypass the HTTP cache.
          const response = await fetch(url, {
            credentials: 'omit',
            cache: 'reload',
          })
          if (!response.ok || response.redirected) {
            throw new Error(`Precache failed for ${url} (${response.status})`)
          }
          await cache.put(url, response)
        }),
      )
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        staleCaches(keys, CACHE).map((key) => caches.delete(key)),
      )
      // Take control of pages opened before the first install.
      await self.clients.claim()
    })(),
  )
})

// New versions wait until the user accepts the "Nouvelle version disponible"
// toast (see `lib/pwa/service-worker-registration.ts`).
self.addEventListener('message', (event) => {
  const data: unknown = event.data
  if (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'SKIP_WAITING'
  ) {
    void self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const strategy = routeRequest(request, {
    origin: self.location.origin,
    precached,
  })

  if (strategy === 'precache') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        const pathname = new URL(request.url).pathname
        return (await cache.match(pathname)) ?? fetch(request)
      })(),
    )
    return
  }

  if (strategy === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Never cached: server-rendered pages may contain financial data.
          return await fetch(request)
        } catch {
          const cache = await caches.open(CACHE)
          return (await cache.match(OFFLINE_URL)) ?? Response.error()
        }
      })(),
    )
  }
  // 'passthrough': not intercepted, the browser handles it as without a SW.
})
