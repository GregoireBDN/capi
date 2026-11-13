import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouteError } from './RouteError'

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * A real in-memory router whose `/page` guard throws `error` until `heal()`
 * is called, with `RouteError` as the default error component (as in
 * `router.tsx`).
 */
async function renderFailingPage(error: unknown) {
  let failing = true
  const rootRoute = createRootRoute()
  const page = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    beforeLoad: () => {
      if (failing) throw error
    },
    component: () => <p>Contenu de la page</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
    defaultErrorComponent: RouteError,
  })
  await act(async () => {
    render(<RouterProvider router={router} />)
    await router.load()
  })
  return {
    heal: () => {
      failing = false
    },
  }
}

describe('RouteError', () => {
  it('shows a French offline page for a network error, never the router default', async () => {
    await renderFailingPage(new TypeError('Load failed'))

    expect(
      await screen.findByRole('heading', { name: 'Hors ligne' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Load failed')).not.toBeInTheDocument()
  })

  it('"Réessayer" reloads the requested page once it works again', async () => {
    const { heal } = await renderFailingPage(new TypeError('Load failed'))
    await screen.findByRole('heading', { name: 'Hors ligne' })

    heal()
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    expect(await screen.findByText('Contenu de la page')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('retries by itself when the network comes back', async () => {
    const { heal } = await renderFailingPage(new TypeError('Failed to fetch'))
    await screen.findByRole('heading', { name: 'Hors ligne' })

    heal()
    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(await screen.findByText('Contenu de la page')).toBeInTheDocument()
  })

  it('shows a generic message for other errors, without their details', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    await renderFailingPage(new Error('Internal detail'))

    expect(
      await screen.findByRole('heading', { name: 'Une erreur est survenue' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Internal detail/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeEnabled()
  })
})
