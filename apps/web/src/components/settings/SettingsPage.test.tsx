import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserDto } from '#/api/types.gen'
import { SettingsPage } from './SettingsPage'

const api = vi.hoisted(() => ({
  passkeysControllerList: vi.fn(),
  sessionsControllerList: vi.fn(),
  categoriesControllerList: vi.fn(),
  categorizationRulesControllerList: vi.fn(),
  accessTokensControllerList: vi.fn(),
  oAuthConsentControllerGrants: vi.fn(),
}))
const theme = vi.hoisted(() => ({
  mode: 'auto',
  setPreference: vi.fn(),
}))

const auth = vi.hoisted(() => ({ logout: vi.fn() }))

vi.mock('#/api', () => api)
vi.mock('#/lib/auth-context', () => ({ useAuth: () => auth }))
vi.mock('#/lib/use-theme-preference', () => ({
  useThemePreference: () => theme,
}))

/** Synthetic owner and lists only. */
const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Owner Test',
  email: 'owner@example.test',
  theme: 'auto',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as UserDto

const ok = <T,>(data: T, status = 200) =>
  Promise.resolve({ data, response: new Response(null, { status }) })
const failure = (status: number) =>
  Promise.resolve({ error: {}, response: new Response(null, { status }) })
const list = (n: number, extra: object = {}) =>
  Array.from({ length: n }, (_, i) => ({ id: String(i), ...extra }))

/** Matches a link by the start of its name (its state follows it). */
const startsWith = (start: string) => (accessibleName: string) =>
  accessibleName.startsWith(start)

const SECTIONS = [
  ['Compte', '/settings/account'],
  ['Sécurité', '/settings/security'],
  ['Catégories', '/categories'],
  ['Règles', '/rules'],
  ['Claude et accès', '/settings/access'],
  ['Zone dangereuse', '/settings/danger'],
] as const

async function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const rootRoute = createRootRoute()
  const page = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: () => <SettingsPage user={USER} />,
  })
  const others = [...SECTIONS.map(([, path]) => path), '/auth'].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => <p>Écran {path}</p>,
    }),
  )
  const router = createRouter({
    routeTree: rootRoute.addChildren([page, ...others]),
    history: createMemoryHistory({ initialEntries: ['/settings'] }),
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  await screen.findByRole('heading', { name: 'Réglages' })
  return router
}

beforeEach(() => {
  vi.clearAllMocks()
  theme.mode = 'auto'
  api.passkeysControllerList.mockImplementation(() => ok(list(2)))
  api.sessionsControllerList.mockImplementation(() => ok(list(3)))
  api.categoriesControllerList.mockImplementation(() =>
    ok([
      ...list(24, { archivedAt: null }),
      ...list(2, { archivedAt: '2026-01-01' }),
    ]),
  )
  api.categorizationRulesControllerList.mockImplementation(() => ok(list(57)))
  api.accessTokensControllerList.mockImplementation(() => ok(list(1)))
  api.oAuthConsentControllerGrants.mockImplementation(() => ok([]))
})

describe('SettingsPage', () => {
  it('lists every section, each opening its own screen', async () => {
    await renderPage()

    for (const [name, href] of SECTIONS) {
      expect(
        screen.getByRole('link', { name: startsWith(name) }),
      ).toHaveAttribute('href', href)
    }
  })

  it('shows each section’s state', async () => {
    await renderPage()

    const link = (name: string) =>
      screen.getByRole('link', { name: startsWith(name) })
    expect(link('Compte')).toHaveTextContent('Owner Test')
    expect(
      await within(link('Sécurité')).findByText(
        'Mot de passe, 2 passkeys, 3 sessions',
      ),
    ).toBeInTheDocument()
    // Archived categories are left out.
    expect(
      within(link('Catégories')).getByText('24 catégories'),
    ).toBeInTheDocument()
    expect(within(link('Règles')).getByText('57 règles')).toBeInTheDocument()
    expect(
      within(link('Claude et accès')).getByText(
        '1 jeton, aucune app connectée',
      ),
    ).toBeInTheDocument()
    expect(link('Zone dangereuse')).toHaveTextContent('Supprimer le compte')
  })

  it('leaves the connected apps out while remote access is off', async () => {
    api.oAuthConsentControllerGrants.mockImplementation(() => failure(404))
    await renderPage()

    expect(await screen.findByText('1 jeton')).toBeInTheDocument()
  })

  it('opens a section', async () => {
    const router = await renderPage()

    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: /^Sécurité/ }))

    expect(
      await screen.findByText('Écran /settings/security'),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/settings/security')
  })

  it('switches the theme in place', async () => {
    await renderPage()
    const choice = screen.getByRole('radiogroup', { name: 'Apparence' })

    expect(within(choice).getByRole('radio', { name: 'Système' })).toBeChecked()
    await userEvent
      .setup()
      .click(within(choice).getByRole('radio', { name: 'Sombre' }))

    expect(theme.setPreference).toHaveBeenCalledWith('dark')
  })

  it('keeps the theme when its segment is pressed again', async () => {
    await renderPage()

    await userEvent
      .setup()
      .click(screen.getByRole('radio', { name: 'Système' }))

    expect(theme.setPreference).not.toHaveBeenCalled()
  })

  it('signs out, then opens the sign-in page', async () => {
    const router = await renderPage()

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Se déconnecter' }))

    expect(auth.logout).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/auth'))
  })
})
