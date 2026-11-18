import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SettingsTabs } from './SettingsTabs'

async function renderAt(path: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <SettingsTabs />
        <Outlet />
      </>
    ),
  })
  const pages = ['/categories', '/rules', '/profile'].map((p) =>
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
  return within(await screen.findByRole('navigation', { name: 'Réglages' }))
}

describe('SettingsTabs', () => {
  it('links to every settings page, in order', async () => {
    const tabs = await renderAt('/categories')
    expect(
      tabs
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Catégories', '/categories'],
      ['Règles', '/rules'],
      ['Profil', '/profile'],
    ])
  })

  it.each([
    ['/categories', 'Catégories'],
    ['/rules', 'Règles'],
    ['/profile', 'Profil'],
  ])('marks the tab of %s as current', async (path, label) => {
    const tabs = await renderAt(path)
    for (const link of tabs.getAllByRole('link')) {
      if (link.textContent === label)
        expect(link).toHaveAttribute('aria-current', 'page')
      else expect(link).not.toHaveAttribute('aria-current')
    }
  })
})
