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

  it('keeps to a title, one line and the two actions', () => {
    render(<PasskeyOffer />)

    expect(
      screen.getByRole('heading', { name: 'Connexion sans mot de passe' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('La prochaine fois, entrez avec Face ID ou Touch ID.'),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Ajouter une passkey' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Plus tard' }),
    ).toBeInTheDocument()
    // The details wait behind the disclosure.
    expect(screen.getByText(/trousseau/)).not.toBeVisible()
  })

  it('tells the password stays usable under "En savoir plus"', async () => {
    const user = userEvent.setup()
    render(<PasskeyOffer />)

    await user.click(screen.getByText('En savoir plus'))

    expect(screen.getByText(/mot de passe reste utilisable/)).toBeVisible()
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

  it('shows the error of a failed passkey and stays', async () => {
    passkeys.addPasskey.mockResolvedValue({
      status: 'error',
      message: 'La passkey n’a pas pu être ajoutée.',
    })
    const user = userEvent.setup()
    render(<PasskeyOffer />)

    await user.click(
      screen.getByRole('button', { name: 'Ajouter une passkey' }),
    )

    expect(
      await screen.findByText('La passkey n’a pas pu être ajoutée.'),
    ).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
    expect(passkeys.dismissPasskeyOffer).not.toHaveBeenCalled()
  })
})
