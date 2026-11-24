import { useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@capi/ui'
import { CapiWordmark } from '#/components/brand/CapiWordmark'
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
  initialMode?: AuthMode
}

const COPY = {
  login: {
    title: 'Connexion',
    description: 'Connectez-vous à votre compte Capi',
  },
  register: {
    title: 'Créer un compte',
    description: 'Créez le compte propriétaire de cette instance Capi',
  },
  forgot: {
    title: 'Mot de passe oublié',
    description: 'Recevez un lien de réinitialisation par email',
  },
} satisfies Record<
  Exclude<AuthMode, 'passkey-offer'>,
  { title: string; description: string }
>

export function AuthCard({
  registrationOpen,
  initialMode = 'login',
}: AuthCardProps) {
  const [mode, setMode] = useState<AuthMode>(
    initialMode === 'register' && !registrationOpen ? 'login' : initialMode,
  )

  // The passkey offer is a security step of its own: no logo, no card.
  if (mode === 'passkey-offer') return <PasskeyOffer />

  return (
    <>
      <CapiWordmark className="h-20" />
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{COPY[mode].title}</CardTitle>
          <CardDescription>{COPY[mode].description}</CardDescription>
        </CardHeader>

        <CardContent>
          {mode === 'login' && (
            <LoginForm
              onSwitchToForgot={() => setMode('forgot')}
              onPasskeyOffer={() => setMode('passkey-offer')}
            />
          )}
          {mode === 'register' && <RegisterForm />}
          {mode === 'forgot' && <ForgotForm />}
        </CardContent>

        <CardFooter className="justify-center">
          {mode === 'login' ? (
            registrationOpen && (
              <p className="text-muted-foreground text-sm">
                Pas encore de compte ?{' '}
                <SwitchButton onClick={() => setMode('register')}>
                  S&apos;inscrire
                </SwitchButton>
              </p>
            )
          ) : (
            <p className="text-muted-foreground text-sm">
              {mode === 'register' ? 'Déjà un compte ? ' : null}
              <SwitchButton onClick={() => setMode('login')}>
                {mode === 'register' ? 'Se connecter' : 'Retour à la connexion'}
              </SwitchButton>
            </p>
          )}
        </CardFooter>
      </Card>
    </>
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
