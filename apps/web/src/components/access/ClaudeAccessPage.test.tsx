import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessTokenDto, OAuthGrantDto } from '#/api/types.gen'
import { ClaudeAccessPage } from './ClaudeAccessPage'

const api = vi.hoisted(() => ({
  accessTokensControllerList: vi.fn(),
  accessTokensControllerAudit: vi.fn(),
  accessTokensControllerCreate: vi.fn(),
  accessTokensControllerRename: vi.fn(),
  accessTokensControllerRevoke: vi.fn(),
  oAuthConsentControllerGrants: vi.fn(),
  oAuthConsentControllerAudit: vi.fn(),
  oAuthConsentControllerRevokeGrant: vi.fn(),
  oAuthControllerMetadata: vi.fn(),
  authControllerLogin: vi.fn(),
  passkeysControllerList: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)

vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast }))

/** Synthetic tokens and grant only. */
const TOKEN: AccessTokenDto = {
  id: '30000000-0000-4000-8000-000000000001',
  name: 'Claude sur Mac',
  tokenPrefix: 'fin_pat_AbCd',
  scope: 'write',
  createdAt: '2026-10-01T08:00:00.000Z',
  expiresAt: '2099-01-01T08:00:00.000Z',
  lastUsedAt: null,
  expired: false,
}
const GRANT: OAuthGrantDto = {
  id: '40000000-0000-4000-8000-000000000001',
  clientName: 'Claude',
  redirectHost: 'claude.ai',
  scope: 'read',
  createdAt: '2026-11-01T08:00:00.000Z',
  lastUsedAt: '2026-11-14T08:00:00.000Z',
  expiresAt: '2099-01-30T08:00:00.000Z',
}
const PLAIN_TOKEN = `fin_pat_${'Z'.repeat(43)}`

const ok = <T,>(data: T, status = 200) =>
  Promise.resolve({ data, response: new Response(null, { status }) })
const failure = (status: number, message = 'Not Found') =>
  Promise.resolve({
    error: { message: [message] },
    response: new Response(null, { status }),
  })

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ClaudeAccessPage email="owner@example.test" />
    </QueryClientProvider>,
  )
}

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // Sheets pick their side from a media query: a wide screen here.
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
  localStorage.clear()
  api.accessTokensControllerList.mockImplementation(() => ok([TOKEN]))
  api.accessTokensControllerAudit.mockImplementation(() => ok([]))
  api.oAuthConsentControllerGrants.mockImplementation(() => ok([GRANT]))
  api.oAuthConsentControllerAudit.mockImplementation(() => ok([]))
  api.oAuthControllerMetadata.mockImplementation(() =>
    ok({ issuer: 'https://mcp.example.test' }),
  )
})

const createdToken = (overrides: Partial<AccessTokenDto> = {}) =>
  ok(
    {
      ...TOKEN,
      id: '30000000-0000-4000-8000-000000000002',
      name: 'Claude sur Mac 2',
      ...overrides,
      token: PLAIN_TOKEN,
    },
    201,
  )

describe('ClaudeAccessPage', () => {
  it('lists tokens and connected apps together, in plain words', async () => {
    renderPage()

    const list = await screen.findByRole('list', { name: 'Accès actifs' })
    const rows = within(list).getAllByRole('button')
    expect(rows).toHaveLength(2)
    // The last used first: the app, then the token never used.
    expect(rows[0]).toHaveTextContent('Claude')
    expect(rows[0]).toHaveTextContent(/Lire seulement · utilisé/)
    expect(rows[1]).toHaveTextContent('Claude sur Mac')
    expect(rows[1]).toHaveTextContent(
      'Lire et classer · jamais utilisé · jusqu’au 1 janv. 2099',
    )
    // Never the token, nor its prefix.
    expect(list).not.toHaveTextContent('fin_pat_')
  })

  it('offers the connector only while remote access is on', async () => {
    renderPage()
    expect(
      await screen.findByRole('button', {
        name: /Claude sur le téléphone et claude\.ai/,
      }),
    ).toBeInTheDocument()
  })

  it('hides the connector when the server has remote access off', async () => {
    api.oAuthConsentControllerGrants.mockImplementation(() => failure(404))
    renderPage()

    const list = await screen.findByRole('list', { name: 'Accès actifs' })
    expect(within(list).getAllByRole('button')).toHaveLength(1)
    expect(
      screen.queryByRole('button', { name: /téléphone et claude\.ai/ }),
    ).toBeNull()
  })

  it('connects Claude on this Mac in steps, then shows the setup with the token once', async () => {
    const user = userEvent.setup()
    api.accessTokensControllerCreate.mockImplementation(() => createdToken())
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: /Claude sur ce Mac/ }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('button', { name: '1. Accès' }),
    ).toHaveAttribute('aria-current', 'step')
    expect(dialog).toHaveTextContent('Que peut faire Claude ?')
    await user.click(
      within(dialog).getByRole('button', { name: /Lire et classer/ }),
    )
    expect(
      within(dialog).getByRole('button', { name: '2. Durée' }),
    ).toHaveAttribute('aria-current', 'step')
    expect(api.accessTokensControllerCreate).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: /90 jours/ }))

    await waitFor(() =>
      expect(api.accessTokensControllerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          // « Claude sur Mac » is taken: the new one gets its own name.
          body: { name: 'Claude sur Mac 2', scope: 'write', expiresInDays: 90 },
        }),
      ),
    )
    expect(
      await within(dialog).findByRole('button', { name: '3. Installer' }),
    ).toHaveAttribute('aria-current', 'step')

    const config = within(dialog).getByRole('figure', {
      name: 'claude_desktop_config.json',
    })
    const parsed = JSON.parse(config.querySelector('pre')!.textContent) as {
      mcpServers: { finances: { env: Record<string, string> } }
    }
    expect(parsed.mcpServers.finances.env).toEqual({
      FINANCES_API_URL: window.location.origin,
      FINANCES_API_TOKEN: PLAIN_TOKEN,
    })

    await user.click(within(dialog).getByRole('radio', { name: 'Claude Code' }))
    const command = within(dialog).getByRole('figure', { name: 'Commande' })
    expect(command).toHaveTextContent(`claude mcp add finances --scope user`)
    expect(command).toHaveTextContent(`FINANCES_API_TOKEN=${PLAIN_TOKEN}`)

    // The path typed once is in the snippet and remembered on this device.
    const path = within(dialog).getByLabelText(/Chemin de apps\/mcp/)
    await user.type(path, '/Users/owner/finances/apps/mcp/dist/index.js')
    await user.tab()
    expect(command).toHaveTextContent(
      '-- node /Users/owner/finances/apps/mcp/dist/index.js',
    )
    expect(localStorage.getItem('finances.mcp-server-path')).toBe(
      '/Users/owner/finances/apps/mcp/dist/index.js',
    )
    expect(JSON.stringify(localStorage)).not.toContain(PLAIN_TOKEN)

    // Closing forgets the token.
    await user.click(within(dialog).getByRole('button', { name: 'Terminé' }))
    await waitFor(() =>
      expect(screen.queryByText(new RegExp(PLAIN_TOKEN))).toBeNull(),
    )
  })

  it('gives a script its key and an example', async () => {
    const user = userEvent.setup()
    api.accessTokensControllerCreate.mockImplementation(() =>
      createdToken({ name: 'Script', scope: 'read', expiresAt: null }),
    )
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: /Script ou autre outil/ }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', { name: /Lire seulement/ }),
    )
    await user.click(
      within(dialog).getByRole('button', { name: /Sans limite/ }),
    )

    await waitFor(() =>
      expect(api.accessTokensControllerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { name: 'Script', scope: 'read', expiresInDays: null },
        }),
      ),
    )
    const key = await within(dialog).findByRole('figure', {
      name: 'Clé d’accès',
    })
    expect(key).toHaveTextContent(PLAIN_TOKEN)
    expect(
      within(dialog).getByRole('figure', { name: 'Exemple' }),
    ).toHaveTextContent(`Authorization: Bearer ${PLAIN_TOKEN}`)
  })

  it('asks to sign in again when the session is not fresh, then creates the access', async () => {
    const user = userEvent.setup()
    api.accessTokensControllerCreate
      .mockImplementationOnce(() =>
        failure(403, 'Recent authentication required'),
      )
      .mockImplementationOnce(() => createdToken())
    api.authControllerLogin.mockImplementation(() => ok({ success: true }))
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: /Claude sur ce Mac/ }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', { name: /Lire seulement/ }),
    )
    await user.click(within(dialog).getByRole('button', { name: /30 jours/ }))

    const reauth = await screen.findByRole('dialog', {
      name: 'Confirmez votre identité',
    })
    expect(reauth).toHaveTextContent('Pour connecter Claude')
    expect(toast.error).not.toHaveBeenCalled()
    await user.type(within(reauth).getByLabelText('Mot de passe'), 'secret-pw')
    await user.click(within(reauth).getByRole('button', { name: 'Confirmer' }))

    const confirmed = await screen.findByRole('dialog', {
      name: 'Identité confirmée',
    })
    expect(api.accessTokensControllerCreate).toHaveBeenCalledTimes(1)
    await user.click(
      within(confirmed).getByRole('button', { name: 'Créer l’accès' }),
    )
    await waitFor(() =>
      expect(api.accessTokensControllerCreate).toHaveBeenCalledTimes(2),
    )
    expect(api.accessTokensControllerCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ expiresInDays: 30 }),
      }),
    )
    expect(
      await screen.findByRole('button', { name: '3. Installer' }),
    ).toHaveAttribute('aria-current', 'step')
  })

  it('gives the connector address to paste in claude.ai', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: /téléphone et claude\.ai/ }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(
      await within(dialog).findByRole('figure', {
        name: 'Adresse du connecteur',
      }),
    ).toHaveTextContent('https://mcp.example.test/mcp')
    expect(dialog).toHaveTextContent('vous validerez l’accès sur cette page')
  })

  it('opens an access: its calls in plain words, then revokes it after confirmation', async () => {
    const user = userEvent.setup()
    const now = Date.now()
    const at = (minutes: number) =>
      new Date(now - minutes * 60_000).toISOString()
    const call = (
      id: string,
      method: string,
      route: string,
      minutes: number,
      statusCode = 200,
    ) => ({
      id,
      tokenId: TOKEN.id,
      tokenName: TOKEN.name,
      method,
      route,
      statusCode,
      createdAt: at(minutes),
    })
    api.accessTokensControllerAudit.mockImplementation(() =>
      ok([
        call('1', 'PATCH', '/api/transactions/:id', 1),
        call('2', 'PATCH', '/api/transactions/:id', 2),
        call('3', 'PATCH', '/api/transactions/:id', 3),
        call('4', 'GET', '/api/dashboard/review', 4),
        call('5', 'DELETE', '/api/transactions/:id', 5, 403),
      ]),
    )
    api.accessTokensControllerRevoke.mockImplementation(() =>
      ok(undefined, 204),
    )
    renderPage()

    const list = await screen.findByRole('list', { name: 'Accès actifs' })
    await user.click(
      within(list).getByRole('button', { name: /Claude sur Mac/ }),
    )
    const sheet = await screen.findByRole('dialog', { name: 'Claude sur Mac' })
    expect(api.accessTokensControllerAudit).toHaveBeenCalledWith(
      expect.objectContaining({ query: { limit: 50, tokenId: TOKEN.id } }),
    )
    const calls = await within(sheet).findByRole('list', {
      name: 'Derniers appels',
    })
    const lines = within(calls).getAllByRole('listitem')
    expect(lines.map((line) => line.textContent)).toEqual([
      expect.stringContaining('a modifié 3 opérations'),
      expect.stringContaining('a lu le bilan du mois'),
      expect.stringMatching(/a voulu faire une modification.*Refusé/),
    ])
    expect(calls).not.toHaveTextContent('/api/')

    await user.click(within(sheet).getByRole('button', { name: 'Révoquer' }))
    const confirm = await screen.findByRole('dialog', {
      name: /Révoquer Claude sur Mac/,
    })
    expect(api.accessTokensControllerRevoke).not.toHaveBeenCalled()
    api.accessTokensControllerList.mockImplementation(() => ok([]))
    await user.click(within(confirm).getByRole('button', { name: 'Révoquer' }))

    await waitFor(() =>
      expect(api.accessTokensControllerRevoke).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: TOKEN.id } }),
      ),
    )
    expect(toast.success).toHaveBeenCalledWith('Accès Claude sur Mac révoqué')
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Accès actifs' })).getAllByRole(
          'button',
        ),
      ).toHaveLength(1),
    )
  })

  it('renames a token from its detail', async () => {
    const user = userEvent.setup()
    api.accessTokensControllerRename.mockImplementation(() =>
      ok({ ...TOKEN, name: 'Claude Code' }),
    )
    renderPage()

    const list = await screen.findByRole('list', { name: 'Accès actifs' })
    await user.click(
      within(list).getByRole('button', { name: /Claude sur Mac/ }),
    )
    const sheet = await screen.findByRole('dialog', { name: 'Claude sur Mac' })
    await user.click(within(sheet).getByRole('button', { name: 'Renommer' }))
    const name = await screen.findByLabelText('Nom')
    await user.clear(name)
    await user.type(name, 'Claude Code')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(api.accessTokensControllerRename).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: TOKEN.id },
          body: { name: 'Claude Code' },
        }),
      ),
    )
    expect(
      await screen.findByRole('dialog', { name: 'Claude Code' }),
    ).toBeInTheDocument()
  })

  it('disconnects a connected app, which has no rename', async () => {
    const user = userEvent.setup()
    api.oAuthConsentControllerRevokeGrant.mockImplementation(() =>
      ok(undefined, 204),
    )
    renderPage()

    const list = await screen.findByRole('list', { name: 'Accès actifs' })
    await user.click(within(list).getAllByRole('button')[0])
    const sheet = await screen.findByRole('dialog', { name: 'Claude' })
    expect(within(sheet).queryByRole('button', { name: 'Renommer' })).toBeNull()
    await user.click(within(sheet).getByRole('button', { name: 'Déconnecter' }))
    const confirm = await screen.findByRole('dialog', {
      name: /Déconnecter Claude/,
    })
    await user.click(
      within(confirm).getByRole('button', { name: 'Déconnecter' }),
    )
    await waitFor(() =>
      expect(api.oAuthConsentControllerRevokeGrant).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: GRANT.id } }),
      ),
    )
  })

  it('says when nothing has access', async () => {
    api.accessTokensControllerList.mockImplementation(() => ok([]))
    api.oAuthConsentControllerGrants.mockImplementation(() => ok([]))
    renderPage()
    expect(await screen.findByText('Aucun accès')).toBeInTheDocument()
  })
})
