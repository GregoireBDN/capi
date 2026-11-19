import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionDto } from '#/api/types.gen'
import { SessionsCard } from './SessionsCard'

const api = vi.hoisted(() => ({
  sessionsControllerList: vi.fn(),
  sessionsControllerRevoke: vi.fn(),
  authControllerLogin: vi.fn(),
}))
const passkeys = vi.hoisted(() => ({
  passkeysSupported: vi.fn(() => false),
  signInWithPasskey: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)

vi.mock('#/api', () => api)
vi.mock('#/lib/passkeys', () => passkeys)
vi.mock('sonner', () => ({ toast }))

/** Synthetic sessions only. */
const LAPTOP: SessionDto = {
  id: '50000000-0000-4000-8000-000000000001',
  signInMethod: 'password',
  device: 'Firefox · Linux',
  signedInAt: '2026-11-01T08:00:00.000Z',
  lastUsedAt: '2026-11-16T18:30:00.000Z',
  expiresAt: '2026-12-16T18:30:00.000Z',
  current: true,
  reuseDetectedAt: null,
}
const PHONE: SessionDto = {
  ...LAPTOP,
  id: '50000000-0000-4000-8000-000000000002',
  signInMethod: 'passkey',
  device: 'Safari · iPhone',
  lastUsedAt: '2026-11-10T07:30:00.000Z',
  current: false,
}
const OLD: SessionDto = {
  ...PHONE,
  id: '50000000-0000-4000-8000-000000000003',
  signInMethod: 'unknown',
  device: null,
}

const ok = <T,>(data: T, status = 200) =>
  Promise.resolve({ data, response: new Response(null, { status }) })
const failure = (status: number, message: string | string[]) =>
  Promise.resolve({
    error: { message },
    response: new Response(null, { status }),
  })

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionsCard email="owner@example.test" />
    </QueryClientProvider>,
  )
}

beforeAll(() => {
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
  api.sessionsControllerList.mockImplementation(() => ok([LAPTOP, PHONE, OLD]))
})

describe('SessionsCard', () => {
  it('lists the sessions, marks this device and offers to end the others', async () => {
    renderCard()
    const list = await screen.findByRole('list', { name: 'Sessions' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(3)

    expect(rows[0]).toHaveTextContent('Firefox · Linux')
    expect(rows[0]).toHaveTextContent('Cet appareil')
    expect(rows[0]).toHaveTextContent('connecté le 1 nov. 2026 (mot de passe)')
    expect(rows[0]).toHaveTextContent(/actif le 16 nov\.(,| à) 19:30/)
    expect(
      within(rows[0]).queryByRole('button', { name: 'Déconnecter' }),
    ).not.toBeInTheDocument()

    expect(rows[1]).toHaveTextContent('Safari · iPhone')
    expect(rows[1]).toHaveTextContent('(passkey)')
    expect(
      within(rows[1]).getByRole('button', { name: 'Déconnecter' }),
    ).toBeInTheDocument()

    expect(rows[2]).toHaveTextContent('Appareil inconnu')
    expect(rows[2]).toHaveTextContent('(méthode inconnue)')
  })

  it('shows a session ended by reuse detection, without an action (#292)', async () => {
    const reused: SessionDto = {
      ...PHONE,
      id: '50000000-0000-4000-8000-000000000004',
      expiresAt: '2026-11-18T13:02:00.000Z',
      reuseDetectedAt: '2026-11-18T13:02:00.000Z',
    }
    api.sessionsControllerList.mockImplementation(() => ok([LAPTOP, reused]))
    renderCard()

    const list = await screen.findByRole('list', { name: 'Sessions' })
    const row = within(list).getAllByRole('listitem')[1]
    expect(row).toHaveTextContent('Safari · iPhone')
    expect(row).toHaveTextContent(
      /Déconnecté : réutilisation détectée le 18 nov\.(,| à) 14:02/,
    )
    expect(
      within(row).queryByRole('button', { name: 'Déconnecter' }),
    ).not.toBeInTheDocument()
  })

  it('ends a session after confirmation', async () => {
    api.sessionsControllerRevoke.mockImplementation(() => ok(undefined, 204))
    const user = userEvent.setup()
    renderCard()
    const list = await screen.findByRole('list', { name: 'Sessions' })
    api.sessionsControllerList.mockImplementation(() => ok([LAPTOP, OLD]))

    await user.click(
      within(within(list).getAllByRole('listitem')[1]).getByRole('button', {
        name: 'Déconnecter',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Déconnecter Safari · iPhone ?')
    await user.click(
      within(dialog).getByRole('button', { name: 'Déconnecter' }),
    )

    await waitFor(() =>
      expect(api.sessionsControllerRevoke).toHaveBeenCalledWith({
        path: { id: PHONE.id },
        throwOnError: false,
      }),
    )
    expect(toast.success).toHaveBeenCalledWith('Safari · iPhone déconnecté')
    await waitFor(() =>
      expect(screen.queryByText('Safari · iPhone')).not.toBeInTheDocument(),
    )
  })

  it('asks for the password first when the session is not fresh', async () => {
    api.sessionsControllerRevoke
      .mockImplementationOnce(() =>
        failure(403, ['Recent authentication required']),
      )
      .mockImplementationOnce(() => ok(undefined, 204))
    api.authControllerLogin.mockImplementation(() => ok({ success: true }))
    const user = userEvent.setup()
    renderCard()
    const list = await screen.findByRole('list', { name: 'Sessions' })

    await user.click(
      within(within(list).getAllByRole('listitem')[1]).getByRole('button', {
        name: 'Déconnecter',
      }),
    )
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Déconnecter',
      }),
    )

    const sheet = await screen.findByRole('dialog', {
      name: 'Confirmez votre identité',
    })
    expect(sheet).toHaveTextContent('Pour déconnecter un appareil')
    expect(toast.error).not.toHaveBeenCalled()
    await user.type(within(sheet).getByLabelText('Mot de passe'), 'secret-pw')
    await user.click(within(sheet).getByRole('button', { name: 'Confirmer' }))

    const confirmed = await screen.findByRole('dialog', {
      name: 'Identité confirmée',
    })
    expect(confirmed).toHaveTextContent(
      'Vous pouvez maintenant déconnecter Safari · iPhone.',
    )
    await user.click(
      within(confirmed).getByRole('button', {
        name: 'Déconnecter l’appareil',
      }),
    )
    await waitFor(() =>
      expect(api.sessionsControllerRevoke).toHaveBeenCalledTimes(2),
    )
    expect(toast.success).toHaveBeenCalledWith('Safari · iPhone déconnecté')
  })

  it('says when the session was already ended', async () => {
    api.sessionsControllerRevoke.mockImplementation(() =>
      failure(404, 'Session not found'),
    )
    const user = userEvent.setup()
    renderCard()
    const list = await screen.findByRole('list', { name: 'Sessions' })

    await user.click(
      within(within(list).getAllByRole('listitem')[1]).getByRole('button', {
        name: 'Déconnecter',
      }),
    )
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Déconnecter',
      }),
    )

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Cette session est déjà terminée.',
      ),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  })
})
