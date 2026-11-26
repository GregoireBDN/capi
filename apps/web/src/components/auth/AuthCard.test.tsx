import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AuthCard } from './AuthCard'
import { AppEnvironmentProvider } from '#/lib/app-environment'

// The forms themselves are covered by their own tests; stub them so this suite
// only exercises which view the card shows and which links it offers.
vi.mock('./LoginForm', () => ({
  LoginForm: ({
    onSwitchToForgot,
    onPasskeyOffer,
  }: {
    onSwitchToForgot: () => void
    onPasskeyOffer: () => void
  }) => (
    <>
      <button type="button" onClick={onSwitchToForgot}>
        login-form
      </button>
      <button type="button" onClick={onPasskeyOffer}>
        password-sign-in
      </button>
    </>
  ),
}))
vi.mock('./PasskeyOffer', () => ({ PasskeyOffer: () => <p>passkey-offer</p> }))
vi.mock('./RegisterForm', () => ({ RegisterForm: () => <p>register-form</p> }))
vi.mock('./ForgotForm', () => ({ ForgotForm: () => <p>forgot-form</p> }))

const signUp = () => screen.queryByRole('button', { name: "S'inscrire" })

describe('AuthCard', () => {
  it('offers sign-up while registration is open', async () => {
    const user = userEvent.setup()
    render(<AuthCard registrationOpen />)

    expect(screen.getByText('login-form')).toBeInTheDocument()
    await user.click(signUp()!)

    expect(screen.getByText('register-form')).toBeInTheDocument()
    expect(screen.queryByText('login-form')).not.toBeInTheDocument()
  })

  it('hides every way to sign up once registration is closed', () => {
    render(<AuthCard registrationOpen={false} />)

    expect(screen.getByText('login-form')).toBeInTheDocument()
    expect(signUp()).not.toBeInTheDocument()
    expect(screen.queryByText('register-form')).not.toBeInTheDocument()
  })

  it('falls back to login when the register view is requested but closed', () => {
    render(<AuthCard registrationOpen={false} initialMode="register" />)

    expect(screen.getByText('login-form')).toBeInTheDocument()
    expect(screen.queryByText('register-form')).not.toBeInTheDocument()
  })

  it('opens the register view directly when requested and open', () => {
    render(<AuthCard registrationOpen initialMode="register" />)

    expect(screen.getByText('register-form')).toBeInTheDocument()
  })

  it('switches to forgot-password and back to login', async () => {
    const user = userEvent.setup()
    render(<AuthCard registrationOpen={false} />)

    await user.click(screen.getByText('login-form'))
    expect(screen.getByText('forgot-form')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Retour à la connexion' }),
    )
    expect(screen.getByText('login-form')).toBeInTheDocument()
  })

  it('shows the passkey offer on its own after a password sign-in', async () => {
    const user = userEvent.setup()
    render(<AuthCard registrationOpen />)
    expect(screen.getByRole('img', { name: 'Capi' })).toBeInTheDocument()

    await user.click(screen.getByText('password-sign-in'))

    expect(screen.getByText('passkey-offer')).toBeInTheDocument()
    expect(screen.queryByText('Connexion')).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Capi' })).not.toBeInTheDocument()
    expect(signUp()).not.toBeInTheDocument()
  })

  it('shows the staging flask beside the name on staging only (#504)', () => {
    const { unmount } = render(
      <AppEnvironmentProvider value="staging">
        <AuthCard registrationOpen={false} />
      </AppEnvironmentProvider>,
    )
    expect(screen.getByTestId('staging-badge')).toHaveTextContent('Staging')
    unmount()

    render(<AuthCard registrationOpen={false} />)
    expect(screen.queryByTestId('staging-badge')).not.toBeInTheDocument()
  })
})
