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
import { SidebarInset, SidebarProvider } from '@finances/ui'
import { transactionsControllerReviewCount } from '#/api'
import type { UserDto } from '#/api/types.gen'
import { resetReviewCount } from '#/lib/review-count'

import { AppSidebar } from './AppSidebar'
import { AppTopBar } from './AppTopBar'
import { PageActionsSlotProvider } from './page-actions'

vi.mock('#/api', () => ({
  profileControllerUpdate: vi.fn(),
  transactionsControllerReviewCount: vi.fn(),
}))
// The one sign-out of the app (`useSignOut`): the API call, its
// `Clear-Site-Data` and the cached user dropped live in `logout()`.
const auth = vi.hoisted(() => ({ logout: vi.fn() }))
vi.mock('#/lib/auth-context', () => ({ useAuth: () => auth }))

// The button's tooltip opens on focus and measures itself.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent in jsdom despite the DOM typings
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const user = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Owner Test',
  email: 'owner@example.test',
} as UserDto

beforeEach(() => {
  resetReviewCount()
  auth.logout.mockReset().mockResolvedValue(undefined)
  vi.mocked(transactionsControllerReviewCount).mockReturnValue(
    Promise.resolve({ data: { count: 0 } }) as never,
  )
  document.cookie = 'sidebar_state=; path=/; max-age=0'
})

/** The authenticated shell on a page, with `/auth` to land on. */
async function renderShell(defaultOpen = true) {
  const rootRoute = createRootRoute({ component: Outlet })
  const shell = createRoute({
    getParentRoute: () => rootRoute,
    id: 'app',
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
  const pages = ['/budget', '/settings'].map((path) =>
    createRoute({
      getParentRoute: () => shell,
      path,
      component: () => <h1>{path}</h1>,
    }),
  )
  const auth = createRoute({
    getParentRoute: () => rootRoute,
    path: '/auth',
    component: () => <h1>Connexion</h1>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([shell.addChildren(pages), auth]),
    history: createMemoryHistory({ initialEntries: ['/budget'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('heading', { name: '/budget' })
  return router
}

const signOutButton = () =>
  screen.getByRole('button', { name: 'Se déconnecter' })
const settingsLink = () =>
  screen.getByRole('link', { name: 'Réglages, Owner Test' })

describe('Sidebar footer on a computer (#352, #353)', () => {
  it('signs out in one click and lands on the sign-in page', async () => {
    const router = await renderShell()

    await userEvent.setup().click(signOutButton())

    expect(auth.logout).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/auth'))
    // No confirmation on a computer.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Connexion' }),
    ).toBeInTheDocument()
  })

  it('keeps the entry and the button two targets, in the footer', async () => {
    await renderShell()
    const link = settingsLink()
    const button = signOutButton()

    expect(link).not.toContainElement(button)
    expect(button).not.toContainElement(link)
    expect(link.closest('[data-sidebar=footer]')).toContainElement(button)
    // Outside the list of pages.
    expect(
      within(
        screen.getByRole('navigation', { name: 'Navigation principale' }),
      ).queryByRole('button', { name: 'Se déconnecter' }),
    ).not.toBeInTheDocument()
  })

  it('reaches the entry then the button with Tab, and signs out with Enter', async () => {
    const ue = userEvent.setup()
    const router = await renderShell()

    settingsLink().focus()
    await ue.tab()
    expect(signOutButton()).toHaveFocus()
    await ue.keyboard('{Enter}')

    expect(auth.logout).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/auth'))
  })

  it('keeps both, named, when the sidebar is folded', async () => {
    const router = await renderShell(false)

    expect(document.querySelector('[data-slot=sidebar]')).toHaveAttribute(
      'data-state',
      'collapsed',
    )
    // Folded, the gear is the entry and « Réglages » stays its name.
    expect(settingsLink()).toHaveAttribute('href', '/settings')
    await userEvent.setup().click(signOutButton())

    expect(auth.logout).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/auth'))
  })
})

describe('Sidebar footer on a phone (navigation sheet)', () => {
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

  async function openSheet() {
    const ue = userEvent.setup()
    const router = await renderShell()
    await ue.click(screen.getByRole('button', { name: 'Ouvrir le menu' }))
    const sheet = await screen.findByRole('dialog', { name: 'Menu' })
    return { ue, router, sheet: within(sheet) }
  }

  it('asks first, then signs out and lands on the sign-in page', async () => {
    const { ue, router, sheet } = await openSheet()

    await ue.click(sheet.getByRole('button', { name: 'Se déconnecter' }))
    const confirm = await screen.findByRole('dialog', {
      name: 'Se déconnecter ?',
    })
    expect(auth.logout).not.toHaveBeenCalled()

    await ue.click(
      within(confirm).getByRole('button', { name: 'Se déconnecter' }),
    )

    expect(auth.logout).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/auth'))
  })

  it('stays signed in on « Annuler »', async () => {
    const { ue, router, sheet } = await openSheet()

    await ue.click(sheet.getByRole('button', { name: 'Se déconnecter' }))
    const confirm = await screen.findByRole('dialog', {
      name: 'Se déconnecter ?',
    })
    await ue.click(within(confirm).getByRole('button', { name: 'Annuler' }))

    expect(
      screen.queryByRole('dialog', { name: 'Se déconnecter ?' }),
    ).not.toBeInTheDocument()
    expect(auth.logout).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/budget')
  })

  it('opens Réglages from the sheet and closes it', async () => {
    const { ue, router, sheet } = await openSheet()

    await ue.click(sheet.getByRole('link', { name: 'Réglages, Owner Test' }))

    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/settings'),
    )
    await vi.waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Menu' }),
      ).not.toBeInTheDocument(),
    )
  })
})
