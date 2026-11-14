import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { serializeCsp } from '../src/lib/security-headers'

/**
 * Headers of the static offline page (`public/offline.html`, served by Nitro
 * and precached by the service worker, which replays them when it shows the
 * page). It loads nothing but the precached logo and favicon, so its inline
 * `<style>` and `<script>` are allowed by their hashes, computed from the file
 * at build time, and nothing else.
 */
export function offlinePageHeaders(
  file = path.resolve(import.meta.dirname, '../public/offline.html'),
): Record<string, string> {
  const html = readFileSync(file, 'utf8')
  return {
    'content-security-policy': serializeCsp({
      'default-src': ["'none'"],
      'script-src': inlineHashes(html, 'script'),
      'style-src': inlineHashes(html, 'style'),
      'img-src': ["'self'"],
      'base-uri': ["'none'"],
      'form-action': ["'none'"],
      'frame-ancestors': ["'none'"],
    }),
    'x-frame-options': 'DENY',
  }
}

/** `'sha256-…'` of every inline `<tag>` element (none: `'none'`). */
export function inlineHashes(html: string, tag: 'script' | 'style'): string[] {
  const elements = html.matchAll(
    new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'),
  )
  const hashes = [...elements].map(
    ([, content]) =>
      `'sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}'`,
  )
  return hashes.length > 0 ? hashes : ["'none'"]
}
