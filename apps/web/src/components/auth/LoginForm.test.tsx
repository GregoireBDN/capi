import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LoginForm } from './LoginForm'

// Hoisted mocks: referenced inside vi.mock factories (which run before imports).
const { authControllerLogin, navigate, refresh } = vi.hoisted(() => ({
  authControllerLogin: vi.fn(),
  navigate: vi.fn(),
  refresh: vi.fn(),
}))

const passkeys = vi.hoisted(() => ({
  passkeysSupported: vi.fn(() => true),
  passkeyAutofillSupported: vi.fn(() => Promise.resolve(false)),
  signInWithPasskey: vi.fn(),
  shouldOfferPasskey: vi.fn(() => Promise.resolve(false)),
  cancelPasskeyCeremony: vi.fn(),
}))

vi.mock('#/api', () => ({ authControllerLogin }))
vi.mock('#/lib/passkeys', () => passkeys)
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('#/lib/auth-context', () => ({ useAuth: () => ({ refresh }) }))

function setup() {
  const onSwitchToForgot = vi.fn()
  const onPasskeyOffer = vi.fn()
  const view = render(
    <LoginForm
      onSwitchToForgot={onSwitchToForgot}
      onPasskeyOffer={onPasskeyOffer}
    />,
  )
  return { user: userEvent.setup(), onSwitchToForgot, onPasskeyOffer, view }
}

/** Face ID comes first (#543): the password form is one tap away. */
async function openPasswordForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Mot de passe' }))
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refresh.mockResolvedValue(undefined)
    navigate.mockResolvedValue(undefined)
    passkeys.passkeysSupported.mockReturnValue(true)
    passkeys.passkeyAutofillSupported.mockResolvedValue(false)
    passkeys.shouldOfferPasskey.mockResolvedValue(false)
  })

  it('shows validation errors and does not call the API for invalid input', async () => {
    const { user } = setup()
    await openPasswordForm(user)

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))

    expect(await screen.findByText('Email invalide')).toBeInTheDocument()
    expect(screen.getByText('Mot de passe requis')).toBeInTheDocument()
    expect(authControllerLogin).not.toHaveBeenCalled()
  })

  it('logs in, refreshes auth and navigates to the dashboard on success', async () => {
    authControllerLogin.mockResolvedValue({ error: null })
    const { user } = setup()
    await openPasswordForm(user)

    await user.type(screen.getByLabelText('Email'), 'user@test.com')
    await user.type(screen.getByLabelText('Mot de passe'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))

    await waitFor(() =>
      expect(authControllerLogin).toHaveBeenCalledWith({
        body: { email: 'user@test.com', password: 'password123' },
        throwOnError: false,
      }),
    )
    expect(refresh).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith({ to: '/dashboard' })
  })

  it('surfaces an error alert and stays on the page when credentials are wrong', async () => {
    authControllerLogin.mockResolvedValue({
      error: { message: 'Invalid credentials' },
      response: new Response(null, { status: 401 }),
    })
    const { user } = setup()
    await openPasswordForm(user)

    await user.type(screen.getByLabelText('Email'), 'user@test.com')
    await user.type(screen.getByLabelText('Mot de passe'), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))

    expect(
      await screen.findByText('Email ou mot de passe incorrect'),
    ).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('triggers the forgot-password switch', async () => {
    const { user, onSwitchToForgot } = setup()
    await openPasswordForm(user)

    await user.click(
      screen.getByRole('button', { name: 'Mot de passe oublié ?' }),
    )

    expect(onSwitchToForgot).toHaveBeenCalled()
  })

  describe('passkeys', () => {
    it('shows Face ID first, then the form and back', async () => {
      const { user } = setup()
      expect(screen.queryByRole('textbox', { name: 'Email' })).toBeNull()

      await openPasswordForm(user)
      expect(screen.getByRole('textbox', { name: 'Email' })).toBeVisible()

      await user.click(screen.getByRole('button', { name: 'Face ID' }))
      expect(
        screen.getByRole('button', { name: 'Se connecter avec une passkey' }),
      ).toBeInTheDocument()
    })

    it('lets the browser suggest a passkey from the email field', () => {
      setup()
      expect(screen.getByLabelText('Email')).toHaveAttribute(
        'autocomplete',
        'username webauthn',
      )
    })

    it('signs in with the Face ID button, shown first', async () => {
      passkeys.signInWithPasskey.mockResolvedValue({
        status: 'ok',
        data: undefined,
      })
      const { user } = setup()

      await user.click(
        screen.getByRole('button', { name: 'Se connecter avec une passkey' }),
      )

      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith({ to: '/dashboard' }),
      )
      expect(passkeys.signInWithPasskey).toHaveBeenCalledWith()
      expect(refresh).toHaveBeenCalled()
    })

    it('shows the error of a refused passkey and stays', async () => {
      passkeys.signInWithPasskey.mockResolvedValue({
        status: 'error',
        message: 'Cette passkey n’est pas reconnue.',
      })
      const { user } = setup()

      await user.click(
        screen.getByRole('button', { name: 'Se connecter avec une passkey' }),
      )

      expect(
        await screen.findByText('Cette passkey n’est pas reconnue.'),
      ).toBeInTheDocument()
      expect(navigate).not.toHaveBeenCalled()
    })

    it('says nothing when the passkey sheet is closed', async () => {
      passkeys.signInWithPasskey.mockResolvedValue({ status: 'cancelled' })
      const { user } = setup()

      await user.click(
        screen.getByRole('button', { name: 'Se connecter avec une passkey' }),
      )

      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Se connecter avec une passkey' }),
        ).toBeEnabled(),
      )
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(navigate).not.toHaveBeenCalled()
    })

    it('hides the passkey button where WebAuthn is missing', () => {
      passkeys.passkeysSupported.mockReturnValue(false)
      setup()
      expect(
        screen.queryByRole('button', { name: 'Se connecter avec une passkey' }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Se connecter' }),
      ).toBeInTheDocument()
    })

    it('waits for a passkey picked from the autofill and signs in', async () => {
      passkeys.passkeyAutofillSupported.mockResolvedValue(true)
      passkeys.signInWithPasskey.mockResolvedValue({
        status: 'ok',
        data: undefined,
      })
      const { user } = setup()
      expect(passkeys.signInWithPasskey).not.toHaveBeenCalled()
      await openPasswordForm(user)

      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith({ to: '/dashboard' }),
      )
      expect(passkeys.signInWithPasskey).toHaveBeenCalledWith({
        autofill: true,
      })
    })

    it('cancels the autofill ceremony when leaving the page', () => {
      const { view } = setup()
      view.unmount()
      expect(passkeys.cancelPasskeyCeremony).toHaveBeenCalled()
    })

    it('offers to add a passkey after a password sign-in when none exists', async () => {
      authControllerLogin.mockResolvedValue({ error: null })
      passkeys.shouldOfferPasskey.mockResolvedValue(true)
      const { user, onPasskeyOffer } = setup()
      await openPasswordForm(user)

      await user.type(screen.getByLabelText('Email'), 'user@test.com')
      await user.type(screen.getByLabelText('Mot de passe'), 'password123')
      await user.click(screen.getByRole('button', { name: 'Se connecter' }))

      await waitFor(() => expect(onPasskeyOffer).toHaveBeenCalled())
      expect(navigate).not.toHaveBeenCalled()
    })
  })
})
