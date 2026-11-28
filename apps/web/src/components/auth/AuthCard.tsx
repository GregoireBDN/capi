import { useState } from 'react'
import { Button } from '@capi/ui'
import { AuthFooter, AuthFrame, AuthPanel } from './AuthFrame'
import { DemoSignIn } from './DemoSignIn'
import { ForgotForm } from './ForgotForm'
import { LoginForm } from './LoginForm'
import { PasskeyOffer } from './PasskeyOffer'
import { RegisterForm } from './RegisterForm'

/** `passkey-offer`: right after a password sign-in (see `LoginForm`). */
export type AuthMode = 'login' | 'register' | 'forgot' | 'passkey-offer'

interface AuthCardProps {
  /**
   * Capi is single-user: sign-up is only offered until the owner account
   * exists. When false, the register form and every link to it are hidden.
   */
  registrationOpen: boolean
  /** A pull request preview that signs in the demo account (#608). */
  demoSignIn?: boolean
  initialMode?: AuthMode
}

/**
 * Sign in and sign up need no title: the name above and the button say where
 * you are (#543).
 */
const TITLES = {
  login: undefined,
  register: undefined,
  forgot: 'Mot de passe oublié',
} satisfies Record<'login' | 'register' | 'forgot', string | undefined>

export function AuthCard({
  registrationOpen,
  demoSignIn = false,
  initialMode = 'login',
}: AuthCardProps) {
  const [mode, setMode] = useState<AuthMode>(
    initialMode === 'register' && !registrationOpen ? 'login' : initialMode,
  )

  // The passkey offer is a security step of its own: no logo, no card.
  if (mode === 'passkey-offer') {
    return (
      <AuthFrame brand={false}>
        <PasskeyOffer />
      </AuthFrame>
    )
  }

  return (
    <AuthFrame>
      {mode === 'login' && demoSignIn && <DemoSignIn />}
      <AuthPanel title={TITLES[mode]}>
        {mode === 'login' && (
          <LoginForm
            onSwitchToForgot={() => setMode('forgot')}
            onPasskeyOffer={() => setMode('passkey-offer')}
          />
        )}
        {mode === 'register' && <RegisterForm />}
        {mode === 'forgot' && <ForgotForm />}
      </AuthPanel>

      {mode === 'login' ? (
        registrationOpen && (
          <AuthFooter>
            Pas encore de compte ?{' '}
            <SwitchButton onClick={() => setMode('register')}>
              S&apos;inscrire
            </SwitchButton>
          </AuthFooter>
        )
      ) : (
        <AuthFooter>
          {mode === 'register' ? 'Déjà un compte ? ' : null}
          <SwitchButton onClick={() => setMode('login')}>
            {mode === 'register' ? 'Se connecter' : 'Retour à la connexion'}
          </SwitchButton>
        </AuthFooter>
      )}
    </AuthFrame>
  )
}

function SwitchButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button type="button" variant="secondary" link size="xs" onClick={onClick}>
      {children}
    </Button>
  )
}
