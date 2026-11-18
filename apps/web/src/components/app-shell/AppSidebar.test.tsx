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
  SETTINGS_TABS,
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
    '/review',
    '/budget',
    '/subscriptions',
    '/savings',
    '/crypto',
    '/accounts',
    '/accounts/$accountId',
    '/import',
    '/categories',
    '/rules',
    '/profile',
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
  return within(
    await screen.findByRole('navigation', { name: 'Navigation principale' }),
  )
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
      ['À revoir', '/review'],
      ['Budget', '/budget'],
      ['Abonnements', '/subscriptions'],
      ['Épargne', '/savings'],
      ['Crypto', '/crypto'],
      ['Comptes', '/accounts'],
      ['Import', '/import'],
    ])
  })

  it('highlights only the item of the current page', async () => {
    const nav = await renderAt('/budget')

    const active = nav.getByRole('link', { name: 'Budget' })
    expect(active).toHaveAttribute('aria-current', 'page')
    expect(active).toHaveAttribute('data-active', 'true')

    for (const { label } of [...NAV_ITEMS, SETTINGS_ITEM].filter(
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

  it('keeps the section highlighted on nested pages', async () => {
    const nav = await renderAt('/transactions/42')
    expect(nav.getByRole('link', { name: 'Opérations' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('shows the review queue size next to "À revoir"', async () => {
    reviewCountIs(7)
    const nav = await renderAt('/dashboard')

    const badge = await nav.findByTestId('nav-badge-/review')
    expect(badge).toHaveTextContent('7 opérations à revoir')
    expect(reviewCount).toHaveBeenCalled()
    // The link's own name stays "À revoir".
    expect(nav.getByRole('link', { name: 'À revoir' })).toHaveAttribute(
      'href',
      '/review',
    )
  })

  it('updates the badge when the queue changes and hides it when empty', async () => {
    reviewCountIs(2)
    const nav = await renderAt('/review')
    expect(await nav.findByTestId('nav-badge-/review')).toHaveTextContent('2')

    act(() => setReviewCount(1))
    expect(nav.getByTestId('nav-badge-/review')).toHaveTextContent(
      '1 opération à revoir',
    )
    act(() => setReviewCount(0))
    expect(nav.queryByTestId('nav-badge-/review')).not.toBeInTheDocument()
  })

  it('shows who is signed in', async () => {
    await renderAt('/dashboard')
    expect(screen.getByText('Owner Test')).toBeInTheDocument()
    expect(screen.getByText('owner@example.test')).toBeInTheDocument()
  })

  it('puts « Réglages » at the bottom, above the account menu', async () => {
    const nav = await renderAt('/dashboard')
    const settingsLink = screen.getByRole('link', { name: 'Réglages' })
    const accountMenu = screen.getByRole('button', { name: 'Menu du compte' })

    expect(settingsLink).toHaveAttribute('href', '/profile')
    // Outside the list of pages, after it and before who is signed in.
    expect(nav.queryByRole('link', { name: 'Réglages' })).toBeNull()
    expect(
      nav
        .getByRole('link', { name: 'Import' })
        .compareDocumentPosition(settingsLink) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      settingsLink.compareDocumentPosition(accountMenu) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it.each(['/categories', '/rules', '/profile'])(
    'highlights « Réglages » on %s',
    async (path) => {
      await renderAt(path)
      expect(screen.getByRole('link', { name: 'Réglages' })).toHaveAttribute(
        'aria-current',
        'page',
      )
      expect(screen.getAllByRole('link').filter(isCurrent)).toHaveLength(1)
    },
  )

  it('has one settings entry, account menu open (#261)', async () => {
    await renderAt('/dashboard')
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Menu du compte' }))
    await screen.findByRole('menu')

    // The open (modal) menu hides the rest of the page from the a11y tree.
    expect(document.querySelectorAll('a[href="/profile"]')).toHaveLength(1)
    for (const { to } of SETTINGS_TABS.slice(1)) {
      expect(document.querySelectorAll(`a[href="${to}"]`)).toHaveLength(0)
    }
    for (const name of ['Catégories', 'Règles', 'Profil']) {
      expect(
        screen.queryByRole('link', { name, hidden: true }),
      ).not.toBeInTheDocument()
    }
  })
})

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
    for (const { to } of SETTINGS_TABS)
      expect(isNavEntryActive(to, SETTINGS_ITEM)).toBe(true)
    expect(isNavEntryActive('/dashboard', SETTINGS_ITEM)).toBe(false)
  })
})
