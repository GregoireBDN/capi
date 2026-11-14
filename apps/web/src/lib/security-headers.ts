import { INLINE_SCRIPTS } from './inline-scripts'

/**
 * Content-Security-Policy and frame protection for every response of the web
 * server's Start handler except the `/api` proxy (pages, redirects, errors,
 * server functions), applied by the request middleware in `src/start.ts`.
 * `/api` responses keep the API's own helmet headers.
 *
 * Scripts: same-origin bundles, plus the inline scripts TanStack renders
 * (dehydrated state, scroll restoration, ...) with a per-response nonce
 * (`router.options.ssr.nonce`, `lib/csp-nonce.ts`; the client reads it back
 * from `<meta property="csp-nonce">`), plus the app's own inline scripts of
 * `__root.tsx` by their hashes (`lib/inline-scripts.ts`). Never
 * `'unsafe-inline'` or `'unsafe-eval'`, even in dev (Zod runs jitless).
 *
 * Styles keep `'unsafe-inline'`: server-rendered `style` attributes (Radix,
 * charts) and the `<style>` elements libraries inject at runtime (toasts,
 * scroll lock) can't carry a nonce. CSS can't run script, so the XSS
 * protection rests on `script-src`.
 *
 * WebAuthn needs no directive; the service worker is same-origin
 * (`worker-src`); Google Fonts serves the stylesheet and the font files.
 */
export type CspDirectives = Readonly<Record<string, readonly string[]>>

export const GOOGLE_FONTS_STYLESHEETS = 'https://fonts.googleapis.com'
export const GOOGLE_FONTS_FILES = 'https://fonts.gstatic.com'

export interface PageCspOptions {
  /** Per-response nonce for TanStack's inline scripts. */
  nonce: string
  /** `'sha256-…'` sources of the app's own inline scripts. */
  scriptHashes: readonly string[]
  /** `vite dev`: Vite's HMR websocket. */
  dev?: boolean
}

export function pageCspDirectives({
  nonce,
  scriptHashes,
  dev = false,
}: PageCspOptions): CspDirectives {
  return {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`, ...scriptHashes],
    'style-src': ["'self'", "'unsafe-inline'", GOOGLE_FONTS_STYLESHEETS],
    'font-src': ["'self'", GOOGLE_FONTS_FILES],
    'img-src': ["'self'", 'data:'],
    // Vite's HMR (and the TanStack devtools) talk over websockets in dev.
    'connect-src': ["'self'", ...(dev ? ['ws:', 'wss:'] : [])],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  }
}

export function serializeCsp(directives: CspDirectives): string {
  return Object.entries(directives)
    .map(([name, sources]) => [name, ...sources].join(' '))
    .join('; ')
}

/** 128 random bits, base64: a fresh one for every response. */
export function createCspNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return toBase64(bytes)
}

/** CSP hash source (`'sha256-…'`) of an inline script's exact text. */
export async function sha256Source(source: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(source),
  )
  return `'sha256-${toBase64(new Uint8Array(digest))}'`
}

let inlineScriptHashes: Promise<string[]> | undefined

/** Hashes of the app's own inline scripts, computed once per process. */
export function pageInlineScriptHashes(): Promise<string[]> {
  inlineScriptHashes ??= Promise.all(INLINE_SCRIPTS.map(sha256Source))
  return inlineScriptHashes
}

export async function pageSecurityHeaders(
  nonce: string,
  { dev = false }: { dev?: boolean } = {},
): Promise<Record<string, string>> {
  const directives = pageCspDirectives({
    nonce,
    scriptHashes: await pageInlineScriptHashes(),
    dev,
  })
  return {
    'content-security-policy': serializeCsp(directives),
    // `frame-ancestors` for browsers without CSP level 2.
    'x-frame-options': 'DENY',
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
