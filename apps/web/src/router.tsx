import { QueryClient } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import './lib/api-client'
import { APP_SCROLL_ID } from './components/app-shell/app-scroll'
import { PagePending } from './components/PagePending'
import { RouteError } from './components/RouteError'
import { getCspNonce } from './lib/csp-nonce'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  // One client per router: on the server, a router (and so a cache) per request.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1 },
      mutations: { retry: false },
    },
  })

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    // The signed-in pages scroll in their own area, not the window (#418):
    // a new page starts at its top, back / forward restore it.
    scrollToTopSelectors: [`#${APP_SCROLL_ID}`],
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // French error page with "Réessayer" instead of the router's default
    // (English, no retry), e.g. for in-app navigations while offline.
    defaultErrorComponent: RouteError,
    // Page skeleton instead of the previous page when a navigation takes
    // longer than a second (the `_app` guard on a slow network).
    defaultPendingComponent: PagePending,
    defaultPendingMs: 1000,
    // Nonce of the response's Content-Security-Policy, for TanStack's inline
    // scripts (`src/start.ts`); the client reads it back from the page.
    ssr: { nonce: getCspNonce() },
  })

  // Wraps the app in a QueryClientProvider and streams SSR-fetched queries.
  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /**
     * A month page: its month (`MonthNavigator`) is in the app header, a
     * bar of its own on phones whose room is kept from the first render
     * (#401).
     */
    monthBar?: boolean
    /**
     * One of Mouvements' two tabs (#498): « Résumé · Opérations » under the
     * month, in the month bar.
     */
    movementsTab?: 'summary' | 'operations'
  }
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
