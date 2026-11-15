/**
 * Where to go after signing in. Only the OAuth consent page (#78) asks to be
 * returned to, through `/auth?redirect=…`: anything else is ignored, so the
 * parameter can never send the owner to another page or another site.
 */
export const OAUTH_AUTHORIZE_PATH = '/oauth/authorize'

/** The return path when it is the consent page on this origin, else null. */
export function safeReturnPath(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !value.startsWith(`${OAUTH_AUTHORIZE_PATH}?`)
  )
    return null
  try {
    const base = 'https://app.invalid'
    const url = new URL(value, base)
    if (url.origin !== base || url.pathname !== OAUTH_AUTHORIZE_PATH)
      return null
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}

/** The return path carried by the current page's `?redirect=` (browser only). */
export function postLoginReturnPath(): string | null {
  if (typeof window === 'undefined') return null
  return safeReturnPath(
    new URLSearchParams(window.location.search).get('redirect'),
  )
}
