import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessTokenDto } from '#/api/types.gen'
import { AccessTokensCard } from './AccessTokensCard'

const api = vi.hoisted(() => ({
  accessTokensControllerList: vi.fn(),
  accessTokensControllerAudit: vi.fn(),
  accessTokensControllerCreate: vi.fn(),
  accessTokensControllerRevoke: vi.fn(),
  authControllerLogin: vi.fn(),
  passkeysControllerList: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)

vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast }))

/** Synthetic tokens only. */
const READ_TOKEN: AccessTokenDto = {
  id: '30000000-0000-4000-8000-000000000001',
  name: 'Claude Desktop',
  tokenPrefix: 'fin_pat_AbCd',
  scope: 'read',
  createdAt: '2026-10-01T08:00:00.000Z',
  expiresAt: '2027-01-01T08:00:00.000Z',
  lastUsedAt: null,
  expired: false,
}
const PLAIN_TOKEN = `fin_pat_${'Z'.repeat(43)}`

const ok = <T,>(data: T, status = 200) =>
  Promise.resolve({ data, response: new Response(null, { status }) })

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AccessTokensCard email="owner@example.test" />
    </QueryClientProvider>,
  )
}

beforeAll(() => {
  // Radix radio groups measure themselves.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // Sheet picks its side from a media query.
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
  api.accessTokensControllerList.mockImplementation(() => ok([READ_TOKEN]))
  api.accessTokensControllerAudit.mockImplementation(() => ok([]))
})

describe('AccessTokensCard', () => {
  it('lists the active tokens with their scope and prefix, never the token', async () => {
    renderCard()

    const list = await screen.findByRole('list', { name: 'Jetons d’accès' })
    expect(within(list).getByText('Claude Desktop')).toBeTruthy()
    expect(within(list).getByText('Lecture seule')).toBeTruthy()
    expect(within(list).getByText(/fin_pat_AbCd…/)).toBeTruthy()
    expect(within(list).getByText(/jamais utilisé/)).toBeTruthy()
  })

  it('creates a token and shows it once', async () => {
    const user = userEvent.setup()
    api.accessTokensControllerCreate.mockImplementation(() =>
      ok(
        {
          ...READ_TOKEN,
          id: '30000000-0000-4000-8000-000000000002',
          name: 'Script',
          scope: 'write',
          expiresAt: null,
          token: PLAIN_TOKEN,
        },
        201,
      ),
    )
    renderCard()

    await user.click(
      await screen.findByRole('button', { name: /Créer un jeton/ }),
    )
    const sheet = await screen.findByRole('dialog')
    // Name is required.
    await user.click(
      within(sheet).getByRole('button', { name: 'Créer le jeton' }),
    )
    expect(within(sheet).getByText('Donnez un nom au jeton.')).toBeTruthy()
    expect(api.accessTokensControllerCreate).not.toHaveBeenCalled()

    await user.type(within(sheet).getByLabelText('Nom'), 'Script')
    await user.click(within(sheet).getByLabelText(/Lecture et écriture/))
    await user.selectOptions(
      within(sheet).getByLabelText('Expiration'),
      'never',
    )
    await user.click(
      within(sheet).getByRole('button', { name: 'Créer le jeton' }),
    )

    await waitFor(() =>
      expect(api.accessTokensControllerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { name: 'Script', scope: 'write', expiresInDays: null },
        }),
      ),
    )
    expect(await within(sheet).findByDisplayValue(PLAIN_TOKEN)).toBeTruthy()
    expect(within(sheet).getByText(/ne sera plus jamais affiché/)).toBeTruthy()

    // Closing forgets it.
    await user.click(within(sheet).getByRole('button', { name: 'Terminé' }))
    await waitFor(() =>
      expect(screen.queryByDisplayValue(PLAIN_TOKEN)).toBeNull(),
    )
  })

  it('asks to sign in again when the session is not fresh, then creates the token', async () => {
    const user = userEvent.setup()
    api.accessTokensControllerCreate
      .mockImplementationOnce(() =>
        Promise.resolve({
          error: { message: ['Recent authentication required'] },
          response: new Response(null, { status: 403 }),
        }),
      )
      .mockImplementationOnce(() =>
        ok({ ...READ_TOKEN, name: 'Script', token: PLAIN_TOKEN }, 201),
      )
    api.authControllerLogin.mockImplementation(() => ok({ success: true }))
    renderCard()

    await user.click(
      await screen.findByRole('button', { name: /Créer un jeton/ }),
    )
    const sheet = await screen.findByRole('dialog')
    await user.type(within(sheet).getByLabelText('Nom'), 'Script')
    await user.click(
      within(sheet).getByRole('button', { name: 'Créer le jeton' }),
    )

    const reauth = await screen.findByRole('dialog', {
      name: 'Confirmez votre identité',
    })
    expect(reauth).toHaveTextContent('Pour créer un jeton d’accès')
    expect(toast.error).not.toHaveBeenCalled()
    await user.type(within(reauth).getByLabelText('Mot de passe'), 'secret-pw')
    await user.click(within(reauth).getByRole('button', { name: 'Confirmer' }))
    expect(api.authControllerLogin).toHaveBeenCalledWith({
      body: { email: 'owner@example.test', password: 'secret-pw' },
      throwOnError: false,
    })

    const confirmed = await screen.findByRole('dialog', {
      name: 'Identité confirmée',
    })
    expect(api.accessTokensControllerCreate).toHaveBeenCalledTimes(1)
    await user.click(
      within(confirmed).getByRole('button', { name: 'Créer le jeton' }),
    )
    await waitFor(() =>
      expect(api.accessTokensControllerCreate).toHaveBeenCalledTimes(2),
    )
    expect(await screen.findByDisplayValue(PLAIN_TOKEN)).toBeTruthy()
  })

  it('revokes a token after confirmation', async () => {
    const user = userEvent.setup()
    api.accessTokensControllerRevoke.mockImplementation(() =>
      ok(undefined, 204),
    )
    renderCard()

    await user.click(await screen.findByRole('button', { name: 'Révoquer' }))
    const dialog = await screen.findByRole('dialog')
    api.accessTokensControllerList.mockImplementation(() => ok([]))
    await user.click(within(dialog).getByRole('button', { name: 'Révoquer' }))

    await waitFor(() =>
      expect(api.accessTokensControllerRevoke).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: READ_TOKEN.id } }),
      ),
    )
    expect(await screen.findByText('Aucun jeton actif.')).toBeTruthy()
    expect(toast.success).toHaveBeenCalledWith('Jeton Claude Desktop révoqué')
  })

  it('shows the latest calls made with tokens', async () => {
    api.accessTokensControllerAudit.mockImplementation(() =>
      ok([
        {
          id: '40000000-0000-4000-8000-000000000001',
          tokenId: READ_TOKEN.id,
          tokenName: 'Claude Desktop',
          method: 'PATCH',
          route: '/api/transactions/:id',
          statusCode: 403,
          createdAt: '2026-11-01T09:30:00.000Z',
        },
      ]),
    )
    renderCard()

    expect(await screen.findByText('Derniers appels (1)')).toBeTruthy()
    expect(screen.getByText('PATCH /api/transactions/:id')).toBeTruthy()
    expect(screen.getByText('403')).toBeTruthy()
  })
})
