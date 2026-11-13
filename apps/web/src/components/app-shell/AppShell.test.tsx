import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarInset, SidebarProvider } from '@finances/ui'
import { transactionsControllerReviewCount } from '#/api'
import type { UserDto } from '#/api/types.gen'
import { resetReviewCount } from '#/lib/review-count'
import { parseSidebarOpen } from '#/lib/sidebar-state'

import { AppSidebar } from './AppSidebar'
import { AppTopBar } from './AppTopBar'

vi.mock('#/api', () => ({
  profileControllerUpdate: vi.fn(),
  transactionsControllerReviewCount: vi.fn(),
}))
vi.mock('#/lib/auth-context', () => ({
  useAuth: () => ({ user: null, refresh: vi.fn(), logout: vi.fn() }),
}))

const user = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Owner Test',
  email: 'owner@example.test',
} as UserDto

function clearSidebarCookie() {
  document.cookie = 'sidebar_state=; path=/; max-age=0'
}

beforeEach(() => {
  resetReviewCount()
  vi.mocked(transactionsControllerReviewCount).mockReturnValue(
    Promise.resolve({ data: { count: 0 } }) as never,
  )
  clearSidebarCookie()
})
afterEach(clearSidebarCookie)

/** The authenticated shell as `routes/_app.tsx` builds it. */
async function renderShell(defaultOpen: boolean) {
  const rootRoute = createRootRoute({
    component: () => (
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar user={user} />
        <SidebarInset>
          <AppTopBar />
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    ),
  })
  const dashboard = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    component: () => <h1>Tableau de bord</h1>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([dashboard]),
    history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('heading', { name: 'Tableau de bord' })
}

/** The fixed sidebar column (≥ md). */
function sidebar() {
  const element = document.querySelector('[data-slot=sidebar]')
  if (!element) throw new Error('No sidebar')
  return element
}

function topBar() {
  const element = document.querySelector('[data-app-top-bar]')
  if (!element) throw new Error('No top bar')
  return element
}

describe('App shell sidebar (≥ md)', () => {
  it('shows the sidebar and hides the top bar by default', async () => {
    await renderShell(true)

    expect(sidebar()).toHaveAttribute('data-state', 'expanded')
    expect(topBar()).toHaveClass('md:hidden')
    expect(
      screen.getByRole('button', { name: 'Masquer le menu' }),
    ).toBeInTheDocument()
  })

  it('hides the sidebar, then brings it back from the top bar', async () => {
    const ue = userEvent.setup()
    await renderShell(true)

    await ue.click(screen.getByRole('button', { name: 'Masquer le menu' }))

    expect(sidebar()).toHaveAttribute('data-state', 'collapsed')
    expect(sidebar()).toHaveAttribute('data-collapsible', 'offcanvas')
    expect(topBar()).not.toHaveClass('md:hidden')
    const menuButton = screen.getByRole('button', { name: 'Ouvrir le menu' })
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(menuButton).toHaveFocus())
    expect(parseSidebarOpen(document.cookie)).toBe(false)

    await ue.click(menuButton)

    expect(sidebar()).toHaveAttribute('data-state', 'expanded')
    expect(topBar()).toHaveClass('md:hidden')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Masquer le menu' }),
      ).toHaveFocus(),
    )
    expect(parseSidebarOpen(document.cookie)).toBe(true)
  })

  it('toggles with Ctrl+B', async () => {
    await renderShell(true)

    act(() => {
      fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    })
    expect(sidebar()).toHaveAttribute('data-state', 'collapsed')

    act(() => {
      fireEvent.keyDown(window, { key: 'b', metaKey: true })
    })
    expect(sidebar()).toHaveAttribute('data-state', 'expanded')
  })

  it('renders hidden from the first render when it was hidden before', async () => {
    document.cookie = 'sidebar_state=false; path=/'

    await renderShell(parseSidebarOpen(document.cookie))

    expect(sidebar()).toHaveAttribute('data-state', 'collapsed')
    expect(topBar()).not.toHaveClass('md:hidden')
    expect(
      screen.getByRole('button', { name: 'Ouvrir le menu' }),
    ).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('App shell sidebar (< md)', () => {
  beforeEach(() => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('max-width'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens the navigation sheet from the top bar, with no hide button', async () => {
    const ue = userEvent.setup()
    await renderShell(false)

    expect(
      screen.queryByRole('button', { name: 'Masquer le menu' }),
    ).not.toBeInTheDocument()

    await ue.click(screen.getByRole('button', { name: 'Ouvrir le menu' }))

    const sheet = await screen.findByRole('dialog', { name: 'Menu' })
    expect(sheet).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Masquer le menu' }),
    ).not.toBeInTheDocument()
    // The remembered desktop state is left alone.
    expect(document.cookie).not.toContain('sidebar_state')
  })
})
