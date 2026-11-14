import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PasskeyDto } from '#/api/types.gen'
import { PasskeysCard } from './PasskeysCard'

const api = vi.hoisted(() => ({
  passkeysControllerList: vi.fn(),
  passkeysControllerRename: vi.fn(),
  passkeysControllerRemove: vi.fn(),
  authControllerLogin: vi.fn(),
}))
const passkeys = vi.hoisted(() => ({
  passkeysSupported: vi.fn(() => true),
  addPasskey: vi.fn(),
  signInWithPasskey: vi.fn(),
  defaultPasskeyName: vi.fn(() => 'Mac'),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)

vi.mock('#/api', () => api)
vi.mock('#/lib/passkeys', () => passkeys)
vi.mock('sonner', () => ({ toast }))

/** Synthetic passkeys only. */
const IPHONE: PasskeyDto = {
  id: '40000000-0000-4000-8000-000000000001',
  name: 'iPhone',
  deviceType: 'multiDevice',
  backedUp: true,
  createdAt: '2026-10-01T08:00:00.000Z',
  lastUsedAt: '2026-11-10T07:30:00.000Z',
}
const MAC: PasskeyDto = {
  ...IPHONE,
  id: '40000000-0000-4000-8000-000000000002',
  name: 'Mac',
  lastUsedAt: null,
}

const ok = <T,>(data: T, status = 200) =>
  Promise.resolve({ data, response: new Response(null, { status }) })

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <PasskeysCard email="owner@example.test" />
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
  passkeys.passkeysSupported.mockReturnValue(true)
  api.passkeysControllerList.mockImplementation(() => ok([IPHONE]))
})

describe('PasskeysCard', () => {
  it('lists the passkeys with their dates', async () => {
    renderCard()
    const list = await screen.findByRole('list', { name: 'Passkeys' })
    expect(within(list).getByText('iPhone')).toBeInTheDocument()
    expect(within(list).getByText('Synchronisée')).toBeInTheDocument()
    expect(
      within(list).getByText(/ajoutée le 1 oct\. 2026/),
    ).toBeInTheDocument()
    expect(within(list).getByText(/utilisée le 10 nov\./)).toBeInTheDocument()
  })

  it('adds a passkey named after the device', async () => {
    passkeys.addPasskey.mockResolvedValue({ status: 'ok', data: MAC })
    const user = userEvent.setup()
    renderCard()
    await screen.findByText('iPhone')
    api.passkeysControllerList.mockImplementation(() => ok([IPHONE, MAC]))

    await user.click(
      screen.getByRole('button', { name: 'Ajouter une passkey' }),
    )

    expect(passkeys.addPasskey).toHaveBeenCalledWith('Mac')
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Passkey Mac ajoutée'),
    )
    expect(await screen.findByText(/jamais utilisée/)).toBeInTheDocument()
  })

  it('asks for the password when the session is not fresh, then adds on a new press', async () => {
    passkeys.addPasskey
      .mockResolvedValueOnce({ status: 'reauth' })
      .mockResolvedValueOnce({ status: 'ok', data: MAC })
    api.authControllerLogin.mockImplementation(() => ok({ success: true }))
    const user = userEvent.setup()
    renderCard()
    await screen.findByText('iPhone')

    await user.click(
      screen.getByRole('button', { name: 'Ajouter une passkey' }),
    )
    const sheet = await screen.findByRole('dialog', {
      name: 'Confirmez votre identité',
    })
    expect(
      within(sheet).getByRole('button', { name: 'Utiliser une passkey' }),
    ).toBeInTheDocument()

    await user.type(within(sheet).getByLabelText('Mot de passe'), 'secret-pw')
    await user.click(within(sheet).getByRole('button', { name: 'Confirmer' }))

    expect(api.authControllerLogin).toHaveBeenCalledWith({
      body: { email: 'owner@example.test', password: 'secret-pw' },
      throwOnError: false,
    })
    const confirmed = await screen.findByRole('dialog', {
      name: 'Identité confirmée',
    })
    expect(passkeys.addPasskey).toHaveBeenCalledTimes(1)
    await user.click(
      within(confirmed).getByRole('button', { name: 'Ajouter la passkey' }),
    )
    await waitFor(() => expect(passkeys.addPasskey).toHaveBeenCalledTimes(2))
    expect(toast.success).toHaveBeenCalledWith('Passkey Mac ajoutée')
  })

  it('refuses a wrong password', async () => {
    passkeys.addPasskey.mockResolvedValue({ status: 'reauth' })
    api.authControllerLogin.mockImplementation(() =>
      Promise.resolve({
        error: { message: 'Invalid credentials' },
        response: new Response(null, { status: 401 }),
      }),
    )
    const user = userEvent.setup()
    renderCard()
    await screen.findByText('iPhone')

    await user.click(
      screen.getByRole('button', { name: 'Ajouter une passkey' }),
    )
    const sheet = await screen.findByRole('dialog')
    await user.type(within(sheet).getByLabelText('Mot de passe'), 'wrong-pw')
    await user.click(within(sheet).getByRole('button', { name: 'Confirmer' }))

    expect(
      await within(sheet).findByText('Mot de passe incorrect.'),
    ).toBeInTheDocument()
    expect(passkeys.addPasskey).toHaveBeenCalledTimes(1)
  })

  it('renames a passkey', async () => {
    api.passkeysControllerRename.mockImplementation(() =>
      ok({ ...IPHONE, name: 'iPhone perso' }),
    )
    const user = userEvent.setup()
    renderCard()
    await screen.findByText('iPhone')

    await user.click(screen.getByRole('button', { name: 'Renommer' }))
    const sheet = await screen.findByRole('dialog', {
      name: 'Renommer la passkey',
    })
    const input = within(sheet).getByLabelText('Nom')
    await user.clear(input)
    await user.type(input, 'iPhone perso')
    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(api.passkeysControllerRename).toHaveBeenCalledWith({
        path: { id: IPHONE.id },
        body: { name: 'iPhone perso' },
        throwOnError: false,
      }),
    )
  })

  it('revokes a passkey after confirmation', async () => {
    api.passkeysControllerRemove.mockImplementation(() => ok(undefined, 204))
    const user = userEvent.setup()
    renderCard()
    await screen.findByText('iPhone')

    await user.click(screen.getByRole('button', { name: 'Révoquer' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Révoquer la passkey iPhone ?')
    await user.click(within(dialog).getByRole('button', { name: 'Révoquer' }))

    await waitFor(() =>
      expect(api.passkeysControllerRemove).toHaveBeenCalledWith({
        path: { id: IPHONE.id },
        throwOnError: false,
      }),
    )
    expect(toast.success).toHaveBeenCalledWith('Passkey iPhone révoquée')
  })

  it('says when the browser cannot add a passkey', async () => {
    passkeys.passkeysSupported.mockReturnValue(false)
    renderCard()
    await screen.findByText('iPhone')
    expect(
      screen.getByText('Ce navigateur ne permet pas d’ajouter une passkey.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Ajouter une passkey' }),
    ).not.toBeInTheDocument()
  })
})
