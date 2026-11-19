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
  return (await openMenuWithRouter()).menu
}

async function openMenuWithRouter() {
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
  return { menu: await screen.findByRole('menu'), router }
}

describe('UserMenu', () => {
  it('holds Réglages, the theme choice and sign-out', async () => {
    const menu = await openMenu()

    expect(
      screen.getAllByRole('menuitemradio').map((item) => item.textContent),
    ).toEqual(['Clair', 'Sombre', 'Système'])
    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent),
    ).toEqual(['Réglages', 'Se déconnecter'])
    expect(menu).toHaveTextContent('Thème')
  })

  it('opens the Réglages list (#300)', async () => {
    const { router } = await openMenuWithRouter()

    await userEvent
      .setup()
      .click(screen.getByRole('menuitem', { name: 'Réglages' }))

    expect(router.state.location.pathname).toBe('/settings')
  })
})
