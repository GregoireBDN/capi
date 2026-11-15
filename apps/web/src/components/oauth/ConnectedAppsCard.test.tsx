import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OAuthGrantDto } from '#/api/types.gen'
import { ConnectedAppsCard } from './ConnectedAppsCard'

const api = vi.hoisted(() => ({
  oAuthConsentControllerGrants: vi.fn(),
  oAuthConsentControllerAudit: vi.fn(),
  oAuthConsentControllerRevokeGrant: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)
vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast }))

/** Synthetic grant. */
const GRANT: OAuthGrantDto = {
  id: '40000000-0000-4000-8000-000000000001',
  clientName: 'Claude',
  redirectHost: 'claude.ai',
  scope: 'write',
  createdAt: '2026-11-01T08:00:00.000Z',
  lastUsedAt: '2026-11-14T08:00:00.000Z',
  expiresAt: '2027-01-30T08:00:00.000Z',
}

const ok = <T,>(data: T, status = 200) =>
  Promise.resolve({ data, response: new Response(null, { status }) })

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConnectedAppsCard />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.oAuthConsentControllerGrants.mockImplementation(() => ok([GRANT]))
  api.oAuthConsentControllerAudit.mockImplementation(() =>
    ok([
      {
        id: '50000000-0000-4000-8000-000000000001',
        grantId: GRANT.id,
        clientName: 'Claude',
        method: 'GET',
        route: '/api/accounts',
        statusCode: 200,
        createdAt: '2026-11-14T08:00:00.000Z',
      },
    ]),
  )
  api.oAuthConsentControllerRevokeGrant.mockImplementation(() =>
    ok(undefined, 204),
  )
})

describe('ConnectedAppsCard', () => {
  it('shows nothing while remote access is off on the server', async () => {
    api.oAuthConsentControllerGrants.mockImplementation(() =>
      Promise.resolve({
        error: {},
        response: new Response(null, { status: 404 }),
      }),
    )
    const { container } = renderCard()
    await waitFor(() =>
      expect(api.oAuthConsentControllerGrants).toHaveBeenCalled(),
    )
    await waitFor(() => expect(container.textContent).toBe(''))
    expect(api.oAuthConsentControllerAudit).not.toHaveBeenCalled()
  })

  it('lists the connections with their scope and host, and their calls', async () => {
    renderCard()
    const list = await screen.findByRole('list', {
      name: 'Applications connectées',
    })
    expect(within(list).getByText('Claude')).toBeTruthy()
    expect(within(list).getByText('Lecture et écriture')).toBeTruthy()
    expect(within(list).getByText('claude.ai')).toBeTruthy()
    expect(await screen.findByText('Derniers appels (1)')).toBeTruthy()
  })

  it('disconnects an application after confirmation', async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(await screen.findByRole('button', { name: 'Déconnecter' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Déconnecter' }),
    )
    await waitFor(() =>
      expect(api.oAuthConsentControllerRevokeGrant).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: GRANT.id } }),
      ),
    )
    expect(toast.success).toHaveBeenCalledWith('Claude déconnecté')
  })
})
