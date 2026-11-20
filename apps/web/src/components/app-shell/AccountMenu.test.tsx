import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserDto } from '#/api/types.gen'
import { AccountMenu } from './AccountMenu'

const auth = vi.hoisted(() => ({ logout: vi.fn() }))
const theme = vi.hoisted(() => ({ mode: 'auto', setPreference: vi.fn() }))

vi.mock('#/lib/auth-context', () => ({ useAuth: () => auth }))
vi.mock('#/lib/use-theme-preference', () => ({
  useThemePreference: () => theme,
}))

/** Synthetic owner only. */
const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Owner Test',
  email: 'owner@example.test',
} as UserDto

/** Emulates a phone (below md) for `useIsMobile`. */
function emulatePhone() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('max-width'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  )
}

async function renderMenu(path = '/dashboard') {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <AccountMenu user={USER} />
        <Outlet />
      </>
    ),
  })
  const pages = ['/dashboard', '/settings', '/settings/security', '/auth'].map(
    (p) =>
      createRoute({
        getParentRoute: () => rootRoute,
        path: p,
        component: () => <p>Page {p}</p>,
      }),
  )
  const router = createRouter({
    routeTree: rootRoute.addChildren(pages),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByText(`Page ${path}`)
  return router
}

async function open(ue: ReturnType<typeof userEvent.setup>) {
  await ue.click(screen.getByRole('button', { name: 'Compte, Owner Test' }))
  return screen.findByRole('dialog', { name: 'Compte' })
}

beforeEach(() => {
  auth.logout.mockReset().mockResolvedValue(undefined)
  theme.setPreference.mockReset()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('AccountMenu (#386)', () => {
  it('shows the initials, then who is signed in and their email', async () => {
    const ue = userEvent.setup()
    await renderMenu()

    expect(
      screen.getByRole('button', { name: 'Compte, Owner Test' }),
    ).toHaveTextContent('OT')
    const card = await open(ue)
    expect(within(card).getByText('Owner Test')).toBeInTheDocument()
    expect(card).toHaveTextContent('owner@example.test')
  })

  it('switches the theme in place', async () => {
    const ue = userEvent.setup()
    await renderMenu()
    const card = await open(ue)

    const choice = within(card).getByRole('radiogroup', { name: 'Apparence' })
    expect(within(choice).getByRole('radio', { name: 'Système' })).toBeChecked()
    await ue.click(within(choice).getByRole('radio', { name: 'Sombre' }))
    expect(theme.setPreference).toHaveBeenCalledWith('dark')
  })

  it('leaves Réglages to the sidebar (#386)', async () => {
    const ue = userEvent.setup()
    await renderMenu()
    const card = await open(ue)

    expect(
      within(card).queryByRole('link', { name: 'Réglages' }),
    ).not.toBeInTheDocument()
  })

  it('signs out in one click on a computer', async () => {
    const ue = userEvent.setup()
    const router = await renderMenu()
    const card = await open(ue)

    await ue.click(within(card).getByRole('button', { name: 'Se déconnecter' }))

    expect(auth.logout).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/auth'))
  })

  it('asks first on a phone, and stays signed in on « Annuler »', async () => {
    emulatePhone()
    const ue = userEvent.setup()
    const router = await renderMenu()
    let card = await open(ue)

    await ue.click(within(card).getByRole('button', { name: 'Se déconnecter' }))
    let confirm = await screen.findByRole('dialog', {
      name: 'Se déconnecter ?',
    })
    await ue.click(within(confirm).getByRole('button', { name: 'Annuler' }))
    expect(auth.logout).not.toHaveBeenCalled()

    card = await open(ue)
    await ue.click(within(card).getByRole('button', { name: 'Se déconnecter' }))
    confirm = await screen.findByRole('dialog', {
      name: 'Se déconnecter ?',
    })
    await ue.click(
      within(confirm).getByRole('button', { name: 'Se déconnecter' }),
    )
    expect(auth.logout).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/auth'))
  })
})
