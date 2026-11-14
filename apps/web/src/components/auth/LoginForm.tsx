import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { KeyRoundIcon, X } from 'lucide-react'
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
} from '@finances/ui'
import { loginSchema } from './auth.schemas'
import type { LoginValues } from './auth.schemas'

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
  const [passkeyAvailable, setPasskeyAvailable] = useState(false)
  const [passkeyPending, setPasskeyPending] = useState(false)
  const navigate = useNavigate()
  const { refresh } = useAuth()
  /** False once unmounted: late ceremony results are then ignored. */
  const mounted = useRef(true)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const enterApp = useCallback(async () => {
    await refresh()
    await navigate({ to: ROUTES.dashboard })
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
   * page cancels it.
   */
  const startAutofill = useCallback(async () => {
    if (!(await passkeyAutofillSupported()) || !mounted.current) return
    await settlePasskey(await signInWithPasskey({ autofill: true }))
  }, [settlePasskey])

  useEffect(() => {
    mounted.current = true
    setPasskeyAvailable(passkeysSupported())
    void startAutofill()
    return () => {
      mounted.current = false
      cancelPasskeyCeremony()
    }
  }, [startAutofill])

  async function onPasskeyClick() {
    setError(null)
    setPasskeyPending(true)
    // Starting this ceremony cancels the autofill one.
    const signedIn = await settlePasskey(await signInWithPasskey())
    if (!mounted.current || signedIn) return
    setPasskeyPending(false)
    void startAutofill()
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

  return (
    <div className="space-y-3">
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-3"
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

        <div className="text-right">
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

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
            <AlertAction onClick={() => setError(null)} aria-label="Fermer">
              <X className="size-3.5" />
            </AlertAction>
          </Alert>
        )}

        <Button type="submit" fullWidth loading={form.formState.isSubmitting}>
          Se connecter
        </Button>
      </form>

      {passkeyAvailable && (
        <>
          <div
            className="text-muted-foreground flex items-center gap-3 text-xs"
            aria-hidden
          >
            <span className="bg-border h-px flex-1" />
            ou
            <span className="bg-border h-px flex-1" />
          </div>
          <Button
            type="button"
            variant="secondary"
            outline
            fullWidth
            loading={passkeyPending}
            onClick={() => void onPasskeyClick()}
          >
            <KeyRoundIcon />
            Se connecter avec une passkey
          </Button>
        </>
      )}
    </div>
  )
}
