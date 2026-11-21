import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { PlusIcon, UploadIcon } from 'lucide-react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarInset, SidebarProvider } from '@finances/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { MonthNavigator } from '#/components/month/MonthNavigator'
import { MonthToolbar } from '#/components/month/MonthToolbar'
import { transactionsControllerReviewCount } from '#/api'
import type { UserDto } from '#/api/types.gen'
import { resetReviewCount } from '#/lib/review-count'
import { parseSidebarOpen } from '#/lib/sidebar-state'

import { AppSidebar } from './AppSidebar'
import { AppHeader } from './AppHeader'
import { MonthBarSlot } from './MonthBarSlot'
import { PageHeader } from './PageHeader'
import { PageActionsSlotProvider } from './page-actions'
import type { PageAction } from './page-actions'

vi.mock('#/api', () => ({
  profileControllerUpdate: vi.fn(),
  transactionsControllerReviewCount: vi.fn(),
  coverageControllerCoverage: vi.fn(() =>
    Promise.resolve({
      data: {
        dataUntil: '2026-11-03',
        currentMonth: '2026-11',
        defaultMonth: '2026-11',
        months: ['2026-10', '2026-11'],
      },
    }),
  ),
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
      <SidebarProvider defaultOpen={defaultOpen} className="flex-col">
        <PageActionsSlotProvider>
          <AppHeader user={user} />
          <div className="flex">
            <AppSidebar />
            <SidebarInset id="main-content">
              <MonthBarSlot />
              <Outlet />
            </SidebarInset>
          </div>
        </PageActionsSlotProvider>
      </SidebarProvider>
    ),
  })
  const dashboard = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    component: () => <PageHeader title="Tableau de bord" actions={actions} />,
  })
  const transactions = createRoute({
    getParentRoute: () => rootRoute,
    path: '/transactions',
    component: () => <PageHeader title="Opérations" />,
  })
  const spending = createRoute({
    getParentRoute: () => rootRoute,
    path: '/spending',
    staticData: { monthBar: true },
    component: SpendingLike,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([dashboard, transactions, spending]),
    history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  return router
}

/** A month page: its month and filters, as Mouvements lays them out. */
function SpendingLike() {
  const [month, setMonth] = useState('2026-11')
  return (
    <>
      <PageHeader title="Mouvements" />
      <MonthToolbar
        navigator={<MonthNavigator month={month} onMonthChange={setMonth} />}
        filters={() => <select aria-label="Compte" />}
      />
    </>
  )
}

/** The fixed sidebar column (≥ md). */
function sidebar() {
  const element = document.querySelector('[data-slot=sidebar]')
  if (!element) throw new Error('No sidebar')
  return element
}

function header() {
  const element = document.querySelector('[data-app-header]')
  if (!element) throw new Error('No header')
  return element as HTMLElement
}

/** Synthetic queue size for the « À revoir » counter. */
function reviewQueue(count: number) {
  vi.mocked(transactionsControllerReviewCount).mockReturnValue(
    Promise.resolve({ data: { count } }) as never,
  )
}

describe('App shell sidebar (≥ md)', () => {
  it('shows the header above the full sidebar by default (#386)', async () => {
    await renderShell(true)

    expect(sidebar()).toHaveAttribute('data-state', 'expanded')
    expect(header()).not.toHaveClass('md:hidden')
    expect(header().tagName).toBe('HEADER')
    // The column folds from its own foot, not from the header (#386).
    expect(
      within(sidebar() as HTMLElement).getByRole('button', {
        name: 'Réduire le menu',
      }),
    ).toHaveAttribute('aria-expanded', 'true')
    expect(
      within(header()).queryByRole('button', { name: /le menu$/ }),
    ).toHaveClass('md:hidden')
    // Logo and account in the header.
    expect(
      within(header()).getByRole('link', { name: 'Finances' }),
    ).toHaveAttribute('href', '/dashboard')
    // No search: Opérations has its own (#386).
    expect(within(header()).queryByRole('searchbox')).not.toBeInTheDocument()
    // No permanent quick entry, and no menu on a page without actions.
    expect(
      within(header()).queryByRole('button', { name: /Ajouter/ }),
    ).toBeNull()
    expect(
      within(header()).queryByRole('button', { name: 'Actions de la page' }),
    ).toBeNull()
    expect(
      within(header()).getByRole('button', { name: 'Compte, Owner Test' }),
    ).toBeInTheDocument()
  })

  it('opens with a skip link to the page', async () => {
    await renderShell(true)

    const skip = within(header()).getByRole('link', {
      name: 'Aller au contenu',
    })
    expect(skip).toHaveAttribute('href', '#main-content')
    expect(document.getElementById('main-content')?.tagName).toBe('MAIN')
  })

  it('keeps a dot on Mouvements for the transactions to review while folded (#393)', async () => {
    reviewQueue(4)
    await renderShell(false)

    const dot = await screen.findByTestId('nav-review-dot')
    expect(dot).toHaveClass('group-data-[collapsible=icon]:block')
    expect(dot.closest('li')).toContainElement(
      screen.getByRole('link', { name: 'Mouvements' }),
    )
  })

  it('puts Réglages and the fold button at the sidebar’s foot (#386)', async () => {
    await renderShell(true)

    const settings = within(sidebar() as HTMLElement).getByRole('link', {
      name: 'Réglages',
    })
    expect(settings).toHaveAttribute('href', '/settings')
    // After the pages, and the only link to the settings.
    expect(
      screen
        .getByRole('link', { name: 'Relevés' })
        .compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(document.querySelectorAll('a[href="/settings"]')).toHaveLength(1)
    expect(
      settings.compareDocumentPosition(
        screen.getByRole('button', { name: 'Réduire le menu' }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('folds down to its icons and back from the sidebar’s foot', async () => {
    const ue = userEvent.setup()
    await renderShell(true)

    const fold = screen.getByRole('button', { name: 'Réduire le menu' })
    await ue.click(fold)

    expect(sidebar()).toHaveAttribute('data-state', 'collapsed')
    expect(sidebar()).toHaveAttribute('data-collapsible', 'icon')
    // Still on screen: the pages stay reachable.
    expect(screen.getByRole('link', { name: 'Budget' })).toBeInTheDocument()
    // The same control, which keeps the focus, unfolds it.
    expect(fold).toHaveAccessibleName('Agrandir le menu')
    expect(fold).toHaveAttribute('aria-expanded', 'false')
    expect(fold).toHaveFocus()
    expect(parseSidebarOpen(document.cookie)).toBe(false)

    await ue.click(fold)
    expect(sidebar()).toHaveAttribute('data-state', 'expanded')
    expect(fold).toHaveAccessibleName('Réduire le menu')
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

  it('opens the navigation sheet from the header, with no fold button', async () => {
    reviewQueue(12)
    const ue = userEvent.setup()
    await renderShell(false)
    // ☰ carries no dot (the owner, #393); the count is still loaded for
    // the pages that show it.
    await vi.waitFor(() =>
      expect(transactionsControllerReviewCount).toHaveBeenCalled(),
    )
    expect(
      screen.getByRole('button', { name: 'Ouvrir le menu' }),
    ).not.toContainElement(
      document.querySelector('[data-slot="notification-dot"]'),
    )

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

  it('puts the page actions in the header’s « ⋮ » menu (#386)', async () => {
    const ue = userEvent.setup()
    const upload = vi.fn()
    await renderShell(false, [
      {
        label: 'Ajouter une opération',
        icon: <PlusIcon />,
        onSelect: vi.fn(),
        primary: true,
      },
      { label: 'Importer un relevé', icon: <UploadIcon />, onSelect: upload },
    ])

    await ue.click(
      await within(header()).findByRole('button', {
        name: 'Actions de la page',
      }),
    )
    await ue.click(
      await screen.findByRole('menuitem', { name: 'Importer un relevé' }),
    )
    expect(upload).toHaveBeenCalledOnce()
    const title = screen
      .getByRole('heading', { name: 'Tableau de bord' })
      .closest('header') as HTMLElement
    expect(within(title).queryByRole('button')).not.toBeInTheDocument()
  })

  it('puts a month page’s month in its bar, not the header, and « Filtres » by its title (#401)', async () => {
    const ue = userEvent.setup()
    const router = await renderShell(false)
    // Not a month page: no room kept for a month.
    expect(
      document.querySelector('[data-month-placeholder]'),
    ).not.toBeInTheDocument()

    await act(() => router.navigate({ to: '/spending' }))
    await screen.findByRole('heading', { name: 'Mouvements' })
    const month = document.querySelector<HTMLElement>('[data-page-month]')!
    expect(header()).not.toContainElement(month)
    await ue.click(
      within(month).getByRole('button', { name: 'Mois précédent' }),
    )
    expect(
      within(month).getByRole('button', {
        name: 'Octobre 2026, choisir un mois',
      }),
    ).toBeInTheDocument()
    // Its room is kept from the first render (#401).
    expect(document.querySelector('[data-month-placeholder]')).not.toBeNull()

    const titleEnd = document.querySelector<HTMLElement>(
      '[data-page-title-end]',
    )!
    expect(
      within(titleEnd).getByRole('button', { name: 'Filtres' }),
    ).toBeInTheDocument()
  })
})
