import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { KeyRoundIcon, X } from 'lucide-react'
import { FaceIdIcon } from './FaceIdIcon'
import { authControllerLogin } from '#/api'
import {
  isRateLimited,
  rateLimitMessage,
  rateLimitWarning,
} from '#/lib/api-errors'
import { useAuth } from '#/lib/auth-context'
import {
  cancelPasskeyCeremony,
  passkeyAutofillSupported,
  passkeysSupported,
  shouldOfferPasskey,
  signInWithPasskey,
} from '#/lib/passkeys'
import type { PasskeyResult } from '#/lib/passkeys'
import { postLoginReturnPath } from '#/lib/post-login'
import { ROUTES } from '#/lib/routes'
import {
  Alert,
  AlertAction,
  AlertDescription,
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  PasswordInput,
} from '@capi/ui'
import { loginSchema } from './auth.schemas'
import type { LoginValues } from './auth.schemas'
import { useHydrated } from '#/lib/use-hydrated'

interface LoginFormProps {
  onSwitchToForgot: () => void
  /** After a password sign-in, when adding a passkey should be offered. */
  onPasskeyOffer?: () => void
}

export function LoginForm({
  onSwitchToForgot,
  onPasskeyOffer,
}: LoginFormProps) {
  const [error, setError] = useState<string | null>(null)
  /**
   * `passkey`: Face ID first, the password one tap away (#543). The server
   * renders this view, the password form inside it hidden (still a POST form
   * with its submit disabled until hydration, #203); a browser without
   * WebAuthn switches to the form once mounted.
   */
  const [view, setView] = useState<'passkey' | 'password'>('passkey')
  const [passkeyAvailable, setPasskeyAvailable] = useState(false)
  const [passkeyPending, setPasskeyPending] = useState(false)
  const navigate = useNavigate()
  const { refresh } = useAuth()
  /** False once unmounted: late ceremony results are then ignored. */
  const mounted = useRef(true)

  const hydrated = useHydrated()
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const enterApp = useCallback(async () => {
    await refresh()
    // Back to the OAuth consent page when it sent the owner here (#78).
    const back = postLoginReturnPath()
    await (back ? navigate({ href: back }) : navigate({ to: ROUTES.dashboard }))
  }, [navigate, refresh])

  /** Shared handling of a passkey sign-in; true when signed in. */
  const settlePasskey = useCallback(
    async (result: PasskeyResult) => {
      if (!mounted.current) return false
      if (result.status === 'ok') {
        await enterApp()
        return true
      }
      if (result.status === 'error') setError(result.message)
      return false
    },
    [enterApp],
  )

  /**
   * Conditional UI: where supported (Safari on iOS / macOS, Chrome), the
   * browser suggests the passkey from the email field. The ceremony waits in
   * the background until the user picks one; a button press or leaving the
   * page cancels it. It runs only while the email field is shown (#543): on
   * the Face ID view the owner asked for nothing, so a failed background
   * ceremony must not show an error there.
   */
  const startAutofill = useCallback(async () => {
    if (!(await passkeyAutofillSupported()) || !mounted.current) return
    await settlePasskey(await signInWithPasskey({ autofill: true }))
  }, [settlePasskey])

  useEffect(() => {
    mounted.current = true
    const supported = passkeysSupported()
    setPasskeyAvailable(supported)
    if (!supported) setView('password')
    return () => {
      mounted.current = false
      cancelPasskeyCeremony()
    }
  }, [])

  useEffect(() => {
    if (view === 'password') void startAutofill()
  }, [view, startAutofill])

  async function onPasskeyClick() {
    setError(null)
    setPasskeyPending(true)
    // Starting this ceremony cancels the autofill one.
    const signedIn = await settlePasskey(await signInWithPasskey())
    if (!mounted.current || signedIn) return
    setPasskeyPending(false)
  }

  async function onSubmit(values: LoginValues) {
    setError(null)
    const res = await authControllerLogin({ body: values, throwOnError: false })
    if (res.error) {
      if (isRateLimited(res.response)) {
        setError(rateLimitMessage(res.response))
        return
      }
      const warning = rateLimitWarning(res.response)
      setError(
        warning
          ? `Email ou mot de passe incorrect. ${warning}`
          : 'Email ou mot de passe incorrect',
      )
      return
    }
    cancelPasskeyCeremony()
    if (onPasskeyOffer && (await shouldOfferPasskey())) {
      await refresh()
      onPasskeyOffer()
      return
    }
    await enterApp()
  }

  const errorAlert = error && (
    <Alert variant="destructive">
      <AlertDescription>{error}</AlertDescription>
      <AlertAction onClick={() => setError(null)} aria-label="Fermer">
        <X className="size-3.5" />
      </AlertAction>
    </Alert>
  )

  return (
    <div className="space-y-3">
      {view === 'passkey' && (
        <>
          <Button
            type="button"
            size="xl"
            fullWidth
            aria-label="Se connecter avec une passkey"
            loading={passkeyPending}
            disabled={!hydrated}
            onClick={() => void onPasskeyClick()}
          >
            <FaceIdIcon />
            Se connecter
          </Button>
          {errorAlert}
          <Button
            type="button"
            variant="secondary"
            ghost
            size="lg"
            fullWidth
            disabled={passkeyPending}
            onClick={() => {
              setError(null)
              setView('password')
            }}
          >
            <KeyRoundIcon />
            Mot de passe
          </Button>
        </>
      )}

      <form
        method="post"
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-3"
        hidden={view !== 'password'}
        noValidate
      >
        <Field data-invalid={!!form.formState.errors.email}>
          <FieldLabel htmlFor="login-email">Email</FieldLabel>
          <Input
            id="login-email"
            type="email"
            // `webauthn`: iOS / macOS offer the passkey right from this field.
            autoComplete="username webauthn"
            aria-invalid={!!form.formState.errors.email}
            {...form.register('email')}
          />
          {form.formState.errors.email && (
            <FieldError>{form.formState.errors.email.message}</FieldError>
          )}
        </Field>

        <Field data-invalid={!!form.formState.errors.password}>
          <FieldLabel htmlFor="login-password">Mot de passe</FieldLabel>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            aria-invalid={!!form.formState.errors.password}
            {...form.register('password')}
          />
          {form.formState.errors.password && (
            <FieldError>{form.formState.errors.password.message}</FieldError>
          )}
        </Field>

        {view === 'password' && errorAlert}

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={form.formState.isSubmitting}
          disabled={!hydrated}
        >
          Se connecter
        </Button>

        <div className="flex flex-wrap items-center justify-center gap-x-2">
          {passkeyAvailable && (
            <Button
              type="button"
              variant="secondary"
              ghost
              size="sm"
              onClick={() => {
                setError(null)
                setView('passkey')
              }}
            >
              <FaceIdIcon />
              Face ID
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            link
            size="xs"
            onClick={onSwitchToForgot}
          >
            Mot de passe oublié ?
          </Button>
        </div>
      </form>
    </div>
  )
}
