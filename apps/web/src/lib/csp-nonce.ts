import {
  createIsomorphicFn,
  getGlobalStartContext,
} from '@tanstack/react-start'

/** Request context set by the security headers middleware (`src/start.ts`). */
export interface CspNonceContext {
  cspNonce?: string
}

/**
 * The CSP nonce of the response being rendered, for `router.options.ssr.nonce`
 * (TanStack adds it to its inline scripts and to `<meta property="csp-nonce">`,
 * which the client reads back when it hydrates). Undefined on the client and
 * outside a request (e.g. a redirect handled before the router renders).
 */
export const getCspNonce = createIsomorphicFn()
  .server((): string | undefined => {
    try {
      const context: CspNonceContext | undefined = getGlobalStartContext()
      return context?.cspNonce
    } catch {
      return undefined
    }
  })
  .client((): string | undefined => undefined)
