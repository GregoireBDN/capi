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
import { resetReviewCount, setReviewCount } from '#/lib/review-count'

import { AppSidebar } from './AppSidebar'
import { NAV_GROUPS, isNavItemActive, isSettingsPage } from './nav-items'

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

/** Renders the sidebar inside a real in-memory router at `path`. */
async function renderAt(path: string) {
  return (await renderAtWithRouter(path)).nav
}

async function renderAtWithRouter(path: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <SidebarProvider>
        <AppSidebar />
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
    '/month-review',
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
  it('renders every page with its link, in its group, in order (#386)', async () => {
    const nav = await renderAt('/dashboard')
    const group = (name: string) =>
      within(nav.getByRole('group', { name }))
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')])

    expect(group('Suivi')).toEqual([
      ['Tableau de bord', '/dashboard'],
      ['Dépenses', '/spending'],
      ['Budget', '/budget'],
      ['Revue du mois', '/month-review'],
    ])
    expect(group('Patrimoine')).toEqual([
      ['Comptes', '/accounts'],
      ['Épargne', '/savings'],
      ['Crypto', '/crypto'],
      ['Entre proches', '/owed'],
    ])
    expect(group('Outils')).toEqual([
      ['Abonnements', '/subscriptions'],
      ['Import', '/import'],
    ])
    expect(nav.getAllByRole('link')).toHaveLength(
      NAV_GROUPS.flatMap((g) => g.items).length,
    )
    // Opérations is a sub-page of Dépenses, out of the sidebar (#393).
    expect(nav.queryByRole('link', { name: 'Opérations' })).toBeNull()
    // A rule between groups, shown while folded in place of their titles.
    expect(nav.getAllByTestId('nav-group-divider')).toHaveLength(
      NAV_GROUPS.length - 1,
    )
  })

  it('ends with Réglages, outside the pages: no account nor sign-out (#386)', async () => {
    const nav = await renderAt('/dashboard')

    const settings = screen.getByRole('link', { name: 'Réglages' })
    expect(settings).toHaveAttribute('href', '/settings')
    expect(nav.queryByRole('link', { name: 'Réglages' })).toBeNull()
    for (const to of ['/categories', '/rules', '/profile']) {
      expect(document.querySelectorAll(`a[href="${to}"]`)).toHaveLength(0)
    }
    expect(
      screen.queryByRole('button', { name: 'Se déconnecter' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Owner Test')).not.toBeInTheDocument()
  })

  it.each(['/categories', '/rules', '/settings', '/settings/security'])(
    'highlights Réglages alone on %s',
    async (path) => {
      await renderAt(path)
      const current = screen
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page')
      expect(current).toEqual([screen.getByRole('link', { name: 'Réglages' })])
    },
  )

  it('highlights only the item of the current page', async () => {
    const nav = await renderAt('/budget')

    const active = nav.getByRole('link', { name: 'Budget' })
    expect(active).toHaveAttribute('aria-current', 'page')
    expect(active).toHaveAttribute('data-active', 'true')

    for (const { label } of NAV_GROUPS.flatMap((g) => g.items).filter(
      (item) => item.label !== 'Budget',
    )) {
      const link = screen.getByRole('link', { name: label })
      expect(link).not.toHaveAttribute('aria-current')
      expect(link).not.toHaveAttribute('data-active')
    }
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

  it.each(['/transactions', '/transactions/42'])(
    'highlights "Dépenses" alone on Opérations, its sub-page (%s, #393)',
    async (path) => {
      const nav = await renderAt(path)
      const current = nav
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page')
      expect(current).toEqual([nav.getByRole('link', { name: 'Dépenses' })])
    },
  )

  it('carries the month from Opérations back to Dépenses (#393)', async () => {
    const nav = await renderAt('/transactions?month=2026-09')
    expect(nav.getByRole('link', { name: 'Dépenses' })).toHaveAttribute(
      'href',
      '/spending?month=2026-09',
    )
  })

  it('shows the number to review on « Dépenses », opening the filter (#322, #393)', async () => {
    reviewCountIs(7)
    const { nav, router } = await renderAtWithRouter('/dashboard')

    const badge = await nav.findByTestId('nav-badge-/spending')
    expect(badge).toHaveAccessibleName('7 opérations à revoir')
    expect(reviewCount).toHaveBeenCalled()
    // No « À revoir » entry any more; the item keeps its own link.
    expect(
      nav.queryByRole('link', { name: 'À revoir' }),
    ).not.toBeInTheDocument()
    expect(nav.getByRole('link', { name: 'Dépenses' })).toHaveAttribute(
      'href',
      '/spending',
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
    expect(await nav.findByTestId('nav-badge-/spending')).toHaveTextContent('2')

    act(() => setReviewCount(1))
    expect(nav.getByTestId('nav-badge-/spending')).toHaveAccessibleName(
      '1 opération à revoir',
    )
    act(() => setReviewCount(0))
    expect(nav.queryByTestId('nav-badge-/spending')).not.toBeInTheDocument()
  })
})

describe('isNavItemActive', () => {
  it('matches the page itself and nested pages only', () => {
    expect(isNavItemActive('/budget', '/budget')).toBe(true)
    expect(isNavItemActive('/budget/2026-11', '/budget')).toBe(true)
    expect(isNavItemActive('/budgets', '/budget')).toBe(false)
    expect(isNavItemActive('/dashboard', '/budget')).toBe(false)
  })
})

describe('isSettingsPage', () => {
  it('matches every settings page', () => {
    for (const to of [
      '/settings',
      '/settings/account',
      '/settings/security',
      '/settings/access',
      '/settings/danger',
      '/categories',
      '/rules',
    ])
      expect(isSettingsPage(to)).toBe(true)
    expect(isSettingsPage('/dashboard')).toBe(false)
    expect(isSettingsPage('/settingsx')).toBe(false)
  })
})
