import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PasskeyOffer } from './PasskeyOffer'

const { navigate, passkeys, toast } = vi.hoisted(() => ({
  navigate: vi.fn(),
  passkeys: {
    addPasskey: vi.fn(),
    defaultPasskeyName: vi.fn(() => 'iPhone'),
    dismissPasskeyOffer: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('#/lib/passkeys', () => passkeys)
vi.mock('sonner', () => ({ toast }))

describe('PasskeyOffer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navigate.mockResolvedValue(undefined)
  })

  it('adds a passkey named after the device and opens the app', async () => {
    passkeys.addPasskey.mockResolvedValue({ status: 'ok', data: {} })
    const user = userEvent.setup()
    render(<PasskeyOffer />)

    await user.click(
      screen.getByRole('button', { name: 'Ajouter une passkey' }),
    )

    expect(passkeys.addPasskey).toHaveBeenCalledWith('iPhone')
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: '/dashboard' }),
    )
    expect(toast.success).toHaveBeenCalledWith('Passkey ajoutée')
  })

  it('stays on the offer when the passkey sheet is closed', async () => {
    passkeys.addPasskey.mockResolvedValue({ status: 'cancelled' })
    const user = userEvent.setup()
    render(<PasskeyOffer />)

    await user.click(
      screen.getByRole('button', { name: 'Ajouter une passkey' }),
    )

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Ajouter une passkey' }),
      ).toBeEnabled(),
    )
    expect(navigate).not.toHaveBeenCalled()
  })

  it('puts the offer off and opens the app on "Plus tard"', async () => {
    const user = userEvent.setup()
    render(<PasskeyOffer />)

    await user.click(screen.getByRole('button', { name: 'Plus tard' }))

    expect(passkeys.dismissPasskeyOffer).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith({ to: '/dashboard' })
    expect(passkeys.addPasskey).not.toHaveBeenCalled()
  })
})
