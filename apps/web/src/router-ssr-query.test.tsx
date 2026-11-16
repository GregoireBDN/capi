// @vitest-environment node
import { QueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  Outlet,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import {
  RouterServer,
  attachRouterServerSsrUtils,
  normalizeSsrResponse,
  renderRouterToStream,
} from '@tanstack/react-router/ssr/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Server rendering of a page that reads React Query, through the same packages
 * and steps as a Start request (`attachRouterServerSsrUtils`, `load`,
 * `dehydrate`, `renderRouterToStream`), with a synthetic route instead of the
 * app's. It fails when the installed TanStack Router / Start / router-ssr-query
 * versions disagree, e.g. `router.serverSsr?.isDehydrated is not a function`
 * thrown from the query cache subscription: React then gives up on the page,
 * sends the pending skeleton and switches to client rendering.
 */

function Greeting() {
  const { data } = useSuspenseQuery({
    queryKey: ['greeting'],
    queryFn: () => Promise.resolve('Bonjour depuis le serveur'),
  })
  return <p>{data}</p>
}

function buildRouter() {
  const rootRoute = createRootRoute({ component: Outlet })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: Greeting,
    pendingComponent: () => <p>Chargement</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
  })
  setupRouterSsrQueryIntegration({ router, queryClient: new QueryClient() })
  return router
}

async function renderOnServer() {
  const router = buildRouter()
  const request = new Request('http://localhost/')
  attachRouterServerSsrUtils({ router, manifest: undefined })
  await router.load()
  await router.serverSsr!.dehydrate()
  const result = await renderRouterToStream({
    request,
    router,
    responseHeaders: new Headers(),
    children: <RouterServer router={router} />,
  })
  return normalizeSsrResponse(result).response.text()
}

describe('server rendering with React Query', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the query result on the server, without a render error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const html = await renderOnServer()

    expect(consoleError).not.toHaveBeenCalled()
    expect(html).toContain('Bonjour depuis le serveur')
    // React's marker of a boundary left to the client after a server error.
    expect(html).not.toContain('<!--$!-->')
    expect(html).not.toContain('Chargement')
  })
})
