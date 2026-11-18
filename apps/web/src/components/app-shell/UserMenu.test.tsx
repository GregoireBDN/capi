import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SidebarProvider } from '@finances/ui'
import type { UserDto } from '#/api/types.gen'

import { UserMenu } from './UserMenu'

vi.mock('#/api', () => ({
  profileControllerUpdate: vi.fn(),
}))

vi.mock('#/lib/auth-context', () => ({
  useAuth: () => ({ user: null, refresh: vi.fn(), logout: vi.fn() }),
}))

const user = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Owner Test',
  email: 'owner@example.test',
} as UserDto

async function openMenu() {
  const rootRoute = createRootRoute({
    component: () => (
      <SidebarProvider>
        <UserMenu user={user} />
      </SidebarProvider>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)

  await userEvent
    .setup()
    .click(await screen.findByRole('button', { name: 'Menu du compte' }))
  return screen.findByRole('menu')
}

describe('UserMenu', () => {
  it('holds only the theme choice and sign-out', async () => {
    const menu = await openMenu()

    expect(
      screen.getAllByRole('menuitemradio').map((item) => item.textContent),
    ).toEqual(['Clair', 'Sombre', 'Système'])
    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent),
    ).toEqual(['Se déconnecter'])
    expect(menu).toHaveTextContent('Thème')
  })

  it('links to no settings page, which live under « Réglages » (#261)', async () => {
    const menu = await openMenu()

    expect(menu.querySelectorAll('a')).toHaveLength(0)
    for (const href of ['/profile', '/categories', '/rules']) {
      expect(menu.querySelector(`[href="${href}"]`)).toBeNull()
    }
    for (const name of ['Profil', 'Catégories', 'Règles']) {
      expect(screen.queryByText(name)).not.toBeInTheDocument()
    }
  })
})
