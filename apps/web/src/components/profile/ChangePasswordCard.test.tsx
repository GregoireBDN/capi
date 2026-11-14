import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChangePasswordCard } from './ChangePasswordCard'

const api = vi.hoisted(() => ({
  authControllerChangePassword: vi.fn(),
  authControllerLogin: vi.fn(),
  passkeysControllerList: vi.fn(),
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

const CURRENT = 'synthetic-current-pw'
const NEXT = 'synthetic-next-password'

const ok = () =>
  Promise.resolve({
    data: { success: true },
    response: new Response(null, { status: 200 }),
  })
const refused = (status: number, message: string) =>
  Promise.resolve({
    error: { message: [message] },
    response: new Response(null, { status }),
  })

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ChangePasswordCard email="owner@example.test" />
    </QueryClientProvider>,
  )
}

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  {
    current = CURRENT,
    next = NEXT,
    confirm,
  }: { current?: string; next?: string; confirm?: string } = {},
) {
  await user.type(screen.getByLabelText('Mot de passe actuel'), current)
  await user.type(screen.getByLabelText('Nouveau mot de passe'), next)
  await user.type(
    screen.getByLabelText('Confirmer le nouveau mot de passe'),
    confirm ?? next,
  )
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Changer le mot de passe' }))

beforeAll(() => {
  // Radix checkboxes measure themselves.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
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
  api.passkeysControllerList.mockImplementation(() =>
    Promise.resolve({ data: [], response: new Response(null) }),
  )
})

describe('ChangePasswordCard', () => {
  it('checks the new password before calling the API', async () => {
    const user = userEvent.setup()
    renderCard()

    await fill(user, { next: 'short-pw-11' })
    await submit(user)
    expect(
      await screen.findByText('Au moins 12 caractères'),
    ).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Nouveau mot de passe'))
    await user.type(
      screen.getByLabelText('Nouveau mot de passe'),
      'é'.repeat(37),
    )
    await submit(user)
    expect(await screen.findByText(/72 octets au plus/)).toBeInTheDocument()
    expect(api.authControllerChangePassword).not.toHaveBeenCalled()
  })

  it('refuses a confirmation that differs', async () => {
    const user = userEvent.setup()
    renderCard()

    await fill(user, { confirm: 'something-else-entirely' })
    await submit(user)

    expect(
      await screen.findByText('Les mots de passe ne correspondent pas'),
    ).toBeInTheDocument()
    expect(api.authControllerChangePassword).not.toHaveBeenCalled()
  })

  it('changes the password, says other sessions are closed and clears the form', async () => {
    api.authControllerChangePassword.mockImplementation(ok)
    const user = userEvent.setup()
    renderCard()

    await fill(user)
    await user.click(screen.getByLabelText(/Révoquer aussi les jetons/))
    await submit(user)

    await waitFor(() =>
      expect(api.authControllerChangePassword).toHaveBeenCalledWith({
        body: {
          currentPassword: CURRENT,
          newPassword: NEXT,
          revokeAccessTokens: true,
        },
        throwOnError: false,
      }),
    )
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining('autres sessions'),
    )
    expect(screen.getByLabelText('Mot de passe actuel')).toHaveValue('')
  })

  it('shows a wrong current password on its field', async () => {
    api.authControllerChangePassword.mockImplementation(() =>
      refused(400, 'Current password is incorrect'),
    )
    const user = userEvent.setup()
    renderCard()

    await fill(user)
    await submit(user)

    expect(
      await screen.findByText('Mot de passe actuel incorrect.'),
    ).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('asks to sign in again when the session is not fresh, then sends the same values', async () => {
    api.authControllerChangePassword
      .mockImplementationOnce(() =>
        refused(403, 'Recent authentication required'),
      )
      .mockImplementationOnce(ok)
    api.authControllerLogin.mockImplementation(ok)
    const user = userEvent.setup()
    renderCard()

    await fill(user)
    await submit(user)

    const sheet = await screen.findByRole('dialog', {
      name: 'Confirmez votre identité',
    })
    expect(sheet).toHaveTextContent('Pour changer de mot de passe')
    await user.type(within(sheet).getByLabelText('Mot de passe'), CURRENT)
    await user.click(within(sheet).getByRole('button', { name: 'Confirmer' }))
    const confirmed = await screen.findByRole('dialog', {
      name: 'Identité confirmée',
    })
    await user.click(
      within(confirmed).getByRole('button', {
        name: 'Changer le mot de passe',
      }),
    )

    await waitFor(() =>
      expect(api.authControllerChangePassword).toHaveBeenCalledTimes(2),
    )
    expect(api.authControllerChangePassword).toHaveBeenLastCalledWith({
      body: {
        currentPassword: CURRENT,
        newPassword: NEXT,
        revokeAccessTokens: false,
      },
      throwOnError: false,
    })
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
  })
})
