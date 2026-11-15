import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConsentCard, leavePage } from './ConsentCard'

const api = vi.hoisted(() => ({
  oAuthConsentControllerDetails: vi.fn(),
  oAuthConsentControllerApprove: vi.fn(),
  oAuthConsentControllerDeny: vi.fn(),
  authControllerLogin: vi.fn(),
  passkeysControllerList: vi.fn(),
}))
vi.mock('#/api', () => api)

/** Synthetic request. */
const PARAMS = {
  client_id: 'fin_cli_test',
  redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
  response_type: 'code',
  code_challenge: 'c'.repeat(43),
  code_challenge_method: 'S256',
  scope: 'read write',
  state: 'xyz',
}
const CALLBACK =
  'https://claude.ai/api/mcp/auth_callback?code=fin_oac_x&state=xyz'

const ok = <T,>(data: T, status = 200) =>
  Promise.resolve({ data, response: new Response(null, { status }) })
const fail = (status: number, message: string) =>
  Promise.resolve({
    error: { message: [message] },
    response: new Response(null, { status }),
  })

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConsentCard params={PARAMS} email="owner@example.test" />
    </QueryClientProvider>,
  )
}

beforeAll(() => {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(leavePage, 'to').mockImplementation(() => undefined)
  api.oAuthConsentControllerDetails.mockImplementation(() =>
    ok({
      clientName: 'Claude',
      redirectHost: 'claude.ai',
      requestedScope: 'write',
    }),
  )
  api.oAuthConsentControllerApprove.mockImplementation(() =>
    ok({ redirectTo: CALLBACK }),
  )
  api.oAuthConsentControllerDeny.mockImplementation(() =>
    ok({
      redirectTo: 'https://claude.ai/api/mcp/auth_callback?error=access_denied',
    }),
  )
  api.passkeysControllerList.mockImplementation(() => ok([]))
})

describe('ConsentCard', () => {
  it('names the client and the host the browser goes back to', async () => {
    renderCard()
    expect(await screen.findByText('Claude')).toBeTruthy()
    expect(screen.getByText('claude.ai')).toBeTruthy()
    expect(api.oAuthConsentControllerDetails).toHaveBeenCalledWith(
      expect.objectContaining({ query: PARAMS }),
    )
  })

  it('grants read only unless writes are ticked', async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(await screen.findByRole('button', { name: 'Autoriser' }))
    await waitFor(() => expect(leavePage.to).toHaveBeenCalledWith(CALLBACK))
    expect(api.oAuthConsentControllerApprove).toHaveBeenCalledWith(
      expect.objectContaining({ body: { ...PARAMS, allowWrite: false } }),
    )
  })

  it('grants writes when the owner ticks them', async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(
      await screen.findByRole('switch', {
        name: 'Autoriser les modifications',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Autoriser' }))
    await waitFor(() =>
      expect(api.oAuthConsentControllerApprove).toHaveBeenCalledWith(
        expect.objectContaining({ body: { ...PARAMS, allowWrite: true } }),
      ),
    )
  })

  it('offers no write switch for a read request', async () => {
    api.oAuthConsentControllerDetails.mockImplementation(() =>
      ok({
        clientName: 'Claude',
        redirectHost: 'claude.ai',
        requestedScope: 'read',
      }),
    )
    renderCard()
    await screen.findByRole('button', { name: 'Autoriser' })
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('sends a refusal back to the client', async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(await screen.findByRole('button', { name: 'Refuser' }))
    await waitFor(() =>
      expect(leavePage.to).toHaveBeenCalledWith(
        'https://claude.ai/api/mcp/auth_callback?error=access_denied',
      ),
    )
    expect(api.oAuthConsentControllerApprove).not.toHaveBeenCalled()
  })

  it('asks to sign in again when the session is not fresh', async () => {
    api.oAuthConsentControllerApprove.mockImplementation(() =>
      fail(403, 'Recent authentication required'),
    )
    const user = userEvent.setup()
    renderCard()
    await user.click(await screen.findByRole('button', { name: 'Autoriser' }))
    expect(await screen.findByLabelText('Mot de passe')).toBeTruthy()
    expect(leavePage.to).not.toHaveBeenCalled()
  })

  it('explains a request it cannot honour, without buttons', async () => {
    api.oAuthConsentControllerDetails.mockImplementation(() =>
      fail(400, 'Unknown client'),
    )
    renderCard()
    expect(
      await screen.findByText(
        'Application inconnue : relancez la connexion depuis Claude.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Autoriser' })).toBeNull()
  })
})
