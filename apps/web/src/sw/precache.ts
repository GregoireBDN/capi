import { createHash } from 'node:crypto'
import type { PrecacheManifest } from './routing'

/**
 * Build-time half of the service worker: picks which client build outputs and
 * `public/` files form the precached app shell, and derives the cache version
 * from their content (so every deploy that changes the shell gets a new cache
 * name and the previous one is deleted on activation).
 */

/** Static file types that may be precached (code, styles, fonts, images). */
const SHELL_EXTENSIONS = /\.(?:js|css|woff2?|svg|png|webp|ico)$/

/** `public/` files that belong to the shell (robots.txt etc. are left out). */
export const PUBLIC_SHELL_FILES = [
  'offline.html',
  'manifest.json',
  'favicon.ico',
  'logo.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
] as const

/** True for a client build output that belongs in the precache. */
export function isShellAsset(fileName: string, swFileName: string): boolean {
  if (fileName === swFileName) return false
  // Hidden build metadata (`.vite/manifest.json`, ...) is never served.
  if (fileName.split('/').some((segment) => segment.startsWith('.'))) {
    return false
  }
  return SHELL_EXTENSIONS.test(fileName)
}

export interface PrecacheEntry {
  /** Path relative to the client output root, e.g. `assets/main-abc123.js`. */
  fileName: string
  content: string | Uint8Array
}

export function buildPrecacheManifest(
  entries: readonly PrecacheEntry[],
  swSource: string,
): PrecacheManifest {
  const sorted = [...entries].sort((a, b) =>
    a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0,
  )
  const hash = createHash('sha256')
  for (const entry of sorted) {
    hash.update(entry.fileName).update('\0').update(entry.content).update('\0')
  }
  hash.update(swSource)
  return {
    version: hash.digest('hex').slice(0, 12),
    urls: sorted.map((entry) => `/${entry.fileName}`),
  }
}
