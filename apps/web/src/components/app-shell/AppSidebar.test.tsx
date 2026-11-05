import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SidebarProvider } from '@finances/ui'
import type { UserDto } from '#/api/types.gen'

import { AppSidebar } from './AppSidebar'
import { NAV_ITEMS, isNavItemActive } from './nav-items'

vi.mock('#/api', () => ({ userControllerUpdate: vi.fn() }))
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
    '/transactions',
    '/transactions/$id',
    '/budget',
    '/subscriptions',
    '/savings',
    '/import',
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
      ['Opérations', '/transactions'],
      ['Budget', '/budget'],
      ['Abonnements', '/subscriptions'],
      ['Épargne', '/savings'],
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
      const link = nav.getByRole('link', { name: label })
      expect(link).not.toHaveAttribute('aria-current')
      expect(link).not.toHaveAttribute('data-active')
    }
  })

  it('keeps the section highlighted on nested pages', async () => {
    const nav = await renderAt('/transactions/42')
    expect(nav.getByRole('link', { name: 'Opérations' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('shows who is signed in', async () => {
    await renderAt('/dashboard')
    expect(screen.getByText('Owner Test')).toBeInTheDocument()
    expect(screen.getByText('owner@example.test')).toBeInTheDocument()
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
