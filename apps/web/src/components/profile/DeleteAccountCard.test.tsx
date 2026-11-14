import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeleteAccountCard } from './DeleteAccountCard'

const api = vi.hoisted(() => ({
  profileControllerRemove: vi.fn(),
  authControllerLogin: vi.fn(),
  passkeysControllerList: vi.fn(),
}))
const passkeys = vi.hoisted(() => ({
  passkeysSupported: vi.fn(() => true),
  signInWithPasskey: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)

vi.mock('#/api', () => api)
vi.mock('#/lib/passkeys', () => passkeys)
vi.mock('sonner', () => ({ toast }))

const ok = <T,>(data: T, status = 200) =>
  Promise.resolve({ data, response: new Response(null, { status }) })
const reauthRequired = () =>
  Promise.resolve({
    error: { message: ['Recent authentication required'] },
    response: new Response(null, { status: 403 }),
  })

function renderCard(onDeleted = vi.fn(() => Promise.resolve())) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <DeleteAccountCard email="owner@example.test" onDeleted={onDeleted} />
    </QueryClientProvider>,
  )
  return onDeleted
}

async function confirmDeletion(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Supprimer mon compte' }))
  const dialog = await screen.findByRole('dialog')
  await user.click(
    within(dialog).getByRole('button', { name: 'Supprimer définitivement' }),
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
  passkeys.passkeysSupported.mockReturnValue(true)
  api.passkeysControllerList.mockImplementation(() =>
    ok([{ id: 'passkey-1', name: 'iPhone' }]),
  )
})

describe('DeleteAccountCard', () => {
  it('deletes the account after confirmation with a fresh session', async () => {
    api.profileControllerRemove.mockImplementation(() => ok(undefined, 204))
    const user = userEvent.setup()
    const onDeleted = renderCard()

    await confirmDeletion(user)

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(api.profileControllerRemove).toHaveBeenCalledTimes(1)
  })

  it('asks for a passkey or the password when the session is not fresh, then deletes on a last press', async () => {
    api.profileControllerRemove
      .mockImplementationOnce(reauthRequired)
      .mockImplementationOnce(() => ok(undefined, 204))
    passkeys.signInWithPasskey.mockResolvedValue({
      status: 'ok',
      data: undefined,
    })
    const user = userEvent.setup()
    const onDeleted = renderCard()

    await confirmDeletion(user)
    const sheet = await screen.findByRole('dialog', {
      name: 'Confirmez votre identité',
    })
    expect(sheet).toHaveTextContent('Pour supprimer votre compte')
    expect(onDeleted).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()

    await user.click(
      await within(sheet).findByRole('button', {
        name: 'Utiliser une passkey',
      }),
    )
    const confirmed = await screen.findByRole('dialog', {
      name: 'Identité confirmée',
    })
    expect(api.profileControllerRemove).toHaveBeenCalledTimes(1)
    await user.click(
      within(confirmed).getByRole('button', {
        name: 'Supprimer définitivement',
      }),
    )

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(api.profileControllerRemove).toHaveBeenCalledTimes(2)
  })

  it('keeps the account when the deletion fails for another reason', async () => {
    api.profileControllerRemove.mockImplementation(() =>
      Promise.resolve({
        error: { message: 'Internal server error' },
        response: new Response(null, { status: 500 }),
      }),
    )
    const user = userEvent.setup()
    const onDeleted = renderCard()

    await confirmDeletion(user)

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Impossible de supprimer le compte',
      ),
    )
    expect(onDeleted).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('dialog', { name: 'Confirmez votre identité' }),
    ).toBeNull()
  })
})
