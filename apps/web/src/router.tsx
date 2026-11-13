import { QueryClient } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import './lib/api-client'
import { PagePending } from './components/PagePending'
import { RouteError } from './components/RouteError'
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
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // French error page with "Réessayer" instead of the router's default
    // (English, no retry), e.g. for in-app navigations while offline.
    defaultErrorComponent: RouteError,
    // Page skeleton instead of the previous page when a navigation takes
    // longer than a second (the `_app` guard on a slow network).
    defaultPendingComponent: PagePending,
    defaultPendingMs: 1000,
  })

  // Wraps the app in a QueryClientProvider and streams SSR-fetched queries.
  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
