/**
 * Service worker routing decisions, kept pure so they can be unit tested.
 *
 * The app holds financial data, so the service worker is deliberately narrow:
 * - `precache`: an exact same-origin URL of the static app shell (hashed JS/CSS,
 *   icons, offline page) is served cache-first from the precache;
 * - `navigate`: page navigations go to the network and are never stored; when
 *   the network fails, the precached offline page is shown instead;
 * - `passthrough`: everything else (`/api/*`, non-GET, cross-origin, any other
 *   same-origin URL) is not intercepted at all, so it is never cached.
 */
export type SwStrategy = 'precache' | 'navigate' | 'passthrough'

export interface SwRequest {
  url: string
  method: string
  mode: string
}

/** Precache manifest injected into the service worker at build time. */
export interface PrecacheManifest {
  /** Content hash of the shell: part of the cache name. */
  version: string
  /** Absolute same-origin paths, e.g. `/assets/main-abc123.js`. */
  urls: string[]
}

/** Precached offline page, shown when a navigation cannot reach the server. */
export const OFFLINE_URL = '/offline.html'

/** Prefix of the precache name; the suffix is the build's content hash. */
export const CACHE_PREFIX = 'finances-shell-'

export function shellCacheName(version: string): string {
  return `${CACHE_PREFIX}${version}`
}

export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/')
}

export function routeRequest(
  request: SwRequest,
  scope: { origin: string; precached: ReadonlySet<string> },
): SwStrategy {
  if (request.method !== 'GET') return 'passthrough'

  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return 'passthrough'
  }
  if (url.origin !== scope.origin) return 'passthrough'
  // Financial data: never intercepted, never cached, even for navigations.
  if (isApiPath(url.pathname)) return 'passthrough'

  if (request.mode === 'navigate') return 'navigate'

  if (url.search === '' && scope.precached.has(url.pathname)) return 'precache'

  return 'passthrough'
}

/** Caches to delete when a new version activates: every cache but its own. */
export function staleCaches(
  keys: readonly string[],
  current: string,
): string[] {
  return keys.filter((key) => key !== current)
}
