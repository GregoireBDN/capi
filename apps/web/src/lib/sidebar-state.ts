import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { SIDEBAR_COOKIE_NAME } from '@capi/ui'

/**
 * Whether the fixed sidebar (≥ md) is shown, from a `Cookie` header or
 * `document.cookie`. `SidebarProvider` writes `sidebar_state=true|false` each
 * time the owner shows or hides it; shown by default.
 */
export function parseSidebarOpen(cookieHeader: string | undefined): boolean {
  for (const part of cookieHeader?.split(';') ?? []) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    if (part.slice(0, separator).trim() !== SIDEBAR_COOKIE_NAME) continue
    return part.slice(separator + 1).trim() !== 'false'
  }
  return true
}

/**
 * The remembered sidebar state for the current render: the request's cookie
 * during SSR, `document.cookie` in the browser. Passed as `defaultOpen` by the
 * authenticated layout so the page is rendered in the right state, with no
 * flash of the other one on hydration.
 */
export const readSidebarOpen = createIsomorphicFn()
  .server(() => parseSidebarOpen(getRequestHeader('cookie')))
  .client(() => parseSidebarOpen(document.cookie))
