import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserDto } from '#/api/types.gen'
import { AccountSettings } from './AccountSettings'

const api = vi.hoisted(() => ({ profileControllerUpdate: vi.fn() }))
const auth = vi.hoisted(() => ({ refresh: vi.fn() }))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)

vi.mock('#/api', () => api)
vi.mock('#/lib/auth-context', () => ({ useAuth: () => auth }))
vi.mock('sonner', () => ({ toast }))

/** Synthetic owner only. */
const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Owner Test',
  email: 'owner@example.test',
  theme: 'auto',
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-03-15T10:00:00.000Z',
  updatedAt: '2026-03-15T10:00:00.000Z',
} as UserDto

const ok = () =>
  Promise.resolve({ data: USER, response: new Response(null, { status: 200 }) })

beforeEach(() => {
  vi.clearAllMocks()
  api.profileControllerUpdate.mockImplementation(ok)
})

function renderAccount() {
  render(<AccountSettings user={USER} />)
  return screen.getByRole('textbox', { name: 'Nom' })
}

describe('AccountSettings', () => {
  it('shows the email as text, with no identity card or disabled field', () => {
    renderAccount()

    expect(screen.getByText('owner@example.test')).toBeInTheDocument()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.queryByText(/Email vérifié/)).not.toBeInTheDocument()
    expect(
      screen.getByText('Membre depuis le 15 mars 2026.'),
    ).toBeInTheDocument()
  })

  it('saves the name when the field is left, with « Annuler »', async () => {
    const user = userEvent.setup()
    const name = renderAccount()

    await user.clear(name)
    await user.type(name, '  New Name ')
    await user.tab()

    await waitFor(() =>
      expect(api.profileControllerUpdate).toHaveBeenCalledWith({
        body: { name: 'New Name' },
        throwOnError: false,
      }),
    )
    expect(auth.refresh).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith(
      'Nom enregistré',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Annuler' }),
      }),
    )

    // « Annuler » puts the previous name back.
    toast.success.mock.calls[0][1].action.onClick()
    await waitFor(() =>
      expect(api.profileControllerUpdate).toHaveBeenLastCalledWith({
        body: { name: 'Owner Test' },
        throwOnError: false,
      }),
    )
  })

  it('saves on Enter', async () => {
    const user = userEvent.setup()
    const name = renderAccount()

    await user.clear(name)
    await user.type(name, 'New Name{Enter}')

    await waitFor(() =>
      expect(api.profileControllerUpdate).toHaveBeenCalledTimes(1),
    )
  })

  it('saves nothing when the name is unchanged', async () => {
    const user = userEvent.setup()
    renderAccount()

    await user.click(screen.getByRole('textbox', { name: 'Nom' }))
    await user.tab()

    expect(api.profileControllerUpdate).not.toHaveBeenCalled()
  })

  it('refuses an empty name', async () => {
    const user = userEvent.setup()
    const name = renderAccount()

    await user.clear(name)
    await user.tab()

    expect(screen.getByRole('alert')).toHaveTextContent('Le nom est requis')
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(api.profileControllerUpdate).not.toHaveBeenCalled()
  })

  it('puts the name back when saving fails', async () => {
    api.profileControllerUpdate.mockImplementation(() =>
      Promise.resolve({
        error: {},
        response: new Response(null, { status: 500 }),
      }),
    )
    const user = userEvent.setup()
    const name = renderAccount()

    await user.clear(name)
    await user.type(name, 'New Name')
    await user.tab()

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Impossible d’enregistrer le nom',
      ),
    )
    expect(name).toHaveValue('Owner Test')
  })
})
