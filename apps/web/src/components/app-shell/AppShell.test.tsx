import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { PlusIcon } from 'lucide-react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarInset, SidebarProvider } from '@finances/ui'
import { transactionsControllerReviewCount } from '#/api'
import type { UserDto } from '#/api/types.gen'
import { resetReviewCount } from '#/lib/review-count'
import { parseSidebarOpen } from '#/lib/sidebar-state'

import { AppSidebar } from './AppSidebar'
import { AppTopBar } from './AppTopBar'
import { PageHeader } from './PageHeader'
import { PageActionsSlotProvider } from './page-actions'
import type { PageAction } from './page-actions'

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
async function renderShell(defaultOpen: boolean, actions: PageAction[] = []) {
  const rootRoute = createRootRoute({
    component: () => (
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar user={user} />
        <SidebarInset>
          <PageActionsSlotProvider>
            <AppTopBar />
            <Outlet />
          </PageActionsSlotProvider>
        </SidebarInset>
      </SidebarProvider>
    ),
  })
  const dashboard = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    component: () => <PageHeader title="Tableau de bord" actions={actions} />,
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
  it('shows the full sidebar and no top bar by default', async () => {
    await renderShell(true)

    expect(sidebar()).toHaveAttribute('data-state', 'expanded')
    expect(topBar()).toHaveClass('md:hidden')
    expect(
      screen.getByRole('button', { name: 'Réduire le menu' }),
    ).toHaveAttribute('aria-expanded', 'true')
  })

  it('folds down to its icons and back from its header', async () => {
    const ue = userEvent.setup()
    await renderShell(true)

    const header = screen.getByRole('button', { name: 'Réduire le menu' })
    await ue.click(header)

    expect(sidebar()).toHaveAttribute('data-state', 'collapsed')
    expect(sidebar()).toHaveAttribute('data-collapsible', 'icon')
    // Still on screen: no top bar from md up, the pages stay reachable.
    expect(topBar()).toHaveClass('md:hidden')
    expect(screen.getByRole('link', { name: 'Budget' })).toBeInTheDocument()
    // The same control, which keeps the focus, unfolds it.
    expect(header).toHaveAccessibleName('Agrandir le menu')
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(header).toHaveFocus()
    expect(parseSidebarOpen(document.cookie)).toBe(false)

    await ue.click(header)
    expect(sidebar()).toHaveAttribute('data-state', 'expanded')
    expect(header).toHaveAccessibleName('Réduire le menu')
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

  it('renders folded from the first render when it was folded before', async () => {
    document.cookie = 'sidebar_state=false; path=/'

    await renderShell(parseSidebarOpen(document.cookie))

    expect(sidebar()).toHaveAttribute('data-state', 'collapsed')
    expect(sidebar()).toHaveAttribute('data-collapsible', 'icon')
    expect(
      screen.getByRole('button', { name: 'Agrandir le menu' }),
    ).toBeInTheDocument()
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

  it('opens the navigation sheet from the top bar, with no fold button', async () => {
    const ue = userEvent.setup()
    await renderShell(false)

    expect(
      screen.queryByRole('button', {
        name: /Réduire le menu|Agrandir le menu/,
      }),
    ).not.toBeInTheDocument()

    await ue.click(screen.getByRole('button', { name: 'Ouvrir le menu' }))

    const sheet = await screen.findByRole('dialog', { name: 'Menu' })
    expect(sheet).toBeInTheDocument()
    // In the sheet, the header links to the dashboard instead.
    expect(
      screen.queryByRole('button', {
        name: /Réduire le menu|Agrandir le menu/,
      }),
    ).not.toBeInTheDocument()
    // The remembered desktop state is left alone.
    expect(document.cookie).not.toContain('sidebar_state')
  })

  it('hosts the page actions in the top bar', async () => {
    const ue = userEvent.setup()
    const onSelect = vi.fn()
    await renderShell(false, [
      { label: 'Ajouter une opération', icon: <PlusIcon />, onSelect },
    ])

    await ue.click(
      await within(topBar() as HTMLElement).findByRole('button', {
        name: 'Ajouter une opération',
      }),
    )
    expect(onSelect).toHaveBeenCalledOnce()
    // Not also beside the title.
    expect(
      screen.getAllByRole('button', { name: 'Ajouter une opération' }),
    ).toHaveLength(1)
  })
})
