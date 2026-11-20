import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarProvider } from '@finances/ui'
import { transactionsControllerReviewCount } from '#/api'
import type { UserDto } from '#/api/types.gen'
import { resetReviewCount, setReviewCount } from '#/lib/review-count'

import { AppSidebar } from './AppSidebar'
import {
  NAV_ITEMS,
  SETTINGS_ITEM,
  isNavEntryActive,
  isNavItemActive,
} from './nav-items'

vi.mock('#/api', () => ({
  profileControllerUpdate: vi.fn(),
  transactionsControllerReviewCount: vi.fn(),
}))

const reviewCount = vi.mocked(transactionsControllerReviewCount)

/** A generated-client result carrying `data`. */
function ok<T>(data: T) {
  return Promise.resolve({ data }) as never
}

function reviewCountIs(count: number) {
  reviewCount.mockReturnValue(ok({ count }))
}

beforeEach(() => {
  resetReviewCount()
  reviewCountIs(0)
})
vi.mock('#/lib/auth-context', () => ({
  useAuth: () => ({ user: null, refresh: vi.fn(), logout: vi.fn() }),
}))

const user = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Owner Test',
  email: 'owner@example.test',
} as UserDto

/** Renders the sidebar inside a real in-memory router at `path`. */
async function renderAt(path: string) {
  return (await renderAtWithRouter(path)).nav
}

async function renderAtWithRouter(path: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <SidebarProvider>
        <AppSidebar user={user} />
        <Outlet />
      </SidebarProvider>
    ),
  })
  const pages = [
    '/dashboard',
    '/spending',
    '/transactions',
    '/transactions/$id',
    '/budget',
    '/subscriptions',
    '/savings',
    '/crypto',
    '/accounts',
    '/accounts/$accountId',
    '/import',
    '/categories',
    '/rules',
    '/settings',
    '/settings/security',
  ].map((p) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path: p,
      component: () => null,
    }),
  )
  const router = createRouter({
    routeTree: rootRoute.addChildren(pages),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(<RouterProvider router={router} />)
  const nav = within(
    await screen.findByRole('navigation', { name: 'Navigation principale' }),
  )
  return { nav, router }
}

describe('AppSidebar', () => {
  it('renders every section with its link, in order', async () => {
    const nav = await renderAt('/dashboard')
    const links = nav.getAllByRole('link')

    expect(
      links.map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Tableau de bord', '/dashboard'],
      ['Dépenses', '/spending'],
      ['Opérations', '/transactions'],
      ['Budget', '/budget'],
      ['Abonnements', '/subscriptions'],
      ['Épargne', '/savings'],
      ['Crypto', '/crypto'],
      ['Entre proches', '/owed'],
      ['Comptes', '/accounts'],
      ['Import', '/import'],
    ])
  })

  it('highlights only the item of the current page', async () => {
    const nav = await renderAt('/budget')

    const active = nav.getByRole('link', { name: 'Budget' })
    expect(active).toHaveAttribute('aria-current', 'page')
    expect(active).toHaveAttribute('data-active', 'true')

    for (const { label } of NAV_ITEMS.filter(
      (item) => item.label !== 'Budget',
    )) {
      const link = screen.getByRole('link', { name: label })
      expect(link).not.toHaveAttribute('aria-current')
      expect(link).not.toHaveAttribute('data-active')
    }
    expect(settingsLink()).not.toHaveAttribute('aria-current')
  })

  it('highlights "Dépenses" on the spending page', async () => {
    const nav = await renderAt('/spending')
    expect(nav.getByRole('link', { name: 'Dépenses' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      nav.getByRole('link', { name: 'Tableau de bord' }),
    ).not.toHaveAttribute('aria-current')
  })

  it('highlights "Comptes" on an account page', async () => {
    const nav = await renderAt('/accounts/00000000-0000-0000-0000-000000000002')
    expect(nav.getByRole('link', { name: 'Comptes' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('keeps the section highlighted on nested pages', async () => {
    const nav = await renderAt('/transactions/42')
    expect(nav.getByRole('link', { name: 'Opérations' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('shows the number to review on « Opérations », opening the filter (#322)', async () => {
    reviewCountIs(7)
    const { nav, router } = await renderAtWithRouter('/dashboard')

    const badge = await nav.findByTestId('nav-badge-/transactions')
    expect(badge).toHaveAccessibleName('7 opérations à revoir')
    expect(reviewCount).toHaveBeenCalled()
    // No « À revoir » entry any more; the item keeps its own link.
    expect(
      nav.queryByRole('link', { name: 'À revoir' }),
    ).not.toBeInTheDocument()
    expect(nav.getByRole('link', { name: 'Opérations' })).toHaveAttribute(
      'href',
      '/transactions',
    )

    await userEvent.click(
      nav.getByRole('link', { name: '7 opérations à revoir' }),
    )
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/transactions'),
    )
    expect(router.state.location.search).toEqual({
      review: true,
      month: 'all',
    })
  })

  it('updates the badge when the queue changes and hides it when empty', async () => {
    reviewCountIs(2)
    const nav = await renderAt('/transactions')
    expect(await nav.findByTestId('nav-badge-/transactions')).toHaveTextContent(
      '2',
    )

    act(() => setReviewCount(1))
    expect(nav.getByTestId('nav-badge-/transactions')).toHaveAccessibleName(
      '1 opération à revoir',
    )
    act(() => setReviewCount(0))
    expect(nav.queryByTestId('nav-badge-/transactions')).not.toBeInTheDocument()
  })

  it('shows « Réglages » and who is signed in, not the email (#352)', async () => {
    await renderAt('/dashboard')
    const link = settingsLink()
    expect(within(link).getByText('Réglages')).toBeInTheDocument()
    expect(within(link).getByText('Owner Test')).toBeInTheDocument()
    // The email is on Réglages › Compte; no initials on a gradient.
    expect(screen.queryByText('owner@example.test')).not.toBeInTheDocument()
    expect(screen.queryByText('OT')).not.toBeInTheDocument()
  })

  it('makes the entry at the bottom the one link to Réglages (#300)', async () => {
    const nav = await renderAt('/dashboard')
    const link = settingsLink()

    expect(link).toHaveAttribute('href', '/settings')
    expect(link).toHaveAccessibleName('Réglages, Owner Test')
    // Outside the list of pages, after it; no account menu any more.
    expect(nav.queryByRole('link', { name: /Réglages/ })).toBeNull()
    expect(
      nav.getByRole('link', { name: 'Import' }).compareDocumentPosition(link) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Menu du compte' }),
    ).not.toBeInTheDocument()
    expect(document.querySelectorAll('a[href="/settings"]')).toHaveLength(1)
    for (const to of ['/categories', '/rules', '/profile']) {
      expect(document.querySelectorAll(`a[href="${to}"]`)).toHaveLength(0)
    }
  })

  it.each(['/categories', '/rules', '/settings', '/settings/security'])(
    'highlights the account link on %s',
    async (path) => {
      await renderAt(path)
      expect(settingsLink()).toHaveAttribute('aria-current', 'page')
      expect(screen.getAllByRole('link').filter(isCurrent)).toHaveLength(1)
    },
  )

  it('opens Réglages', async () => {
    const { router } = await renderAtWithRouter('/dashboard')

    await userEvent.setup().click(settingsLink())

    expect(router.state.location.pathname).toBe('/settings')
  })
})

/** The sidebar's entry, named « Réglages, » then who. */
function settingsLink() {
  return screen.getByRole('link', { name: /^Réglages, / })
}

function isCurrent(link: HTMLElement) {
  return link.getAttribute('aria-current') === 'page'
}

describe('isNavItemActive', () => {
  it('matches the page itself and nested pages only', () => {
    expect(isNavItemActive('/budget', '/budget')).toBe(true)
    expect(isNavItemActive('/budget/2026-11', '/budget')).toBe(true)
    expect(isNavItemActive('/budgets', '/budget')).toBe(false)
    expect(isNavItemActive('/dashboard', '/budget')).toBe(false)
  })
})

describe('isNavEntryActive', () => {
  it('matches every settings page for « Réglages »', () => {
    for (const to of [
      '/settings',
      '/settings/account',
      '/settings/security',
      '/settings/access',
      '/settings/danger',
      '/categories',
      '/rules',
    ])
      expect(isNavEntryActive(to, SETTINGS_ITEM)).toBe(true)
    expect(isNavEntryActive('/dashboard', SETTINGS_ITEM)).toBe(false)
  })
})
