import {
  Alert,
  AlertDescription,
  Button,
  Field,
  FieldLabel,
  PasswordInput,
} from '@capi/ui'
import { useQuery } from '@tanstack/react-query'
import { KeyRoundIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { authControllerLogin } from '#/api'
import { PasskeySheet } from '#/components/passkeys/PasskeySheet'
import { passkeysQuery } from '#/components/passkeys/queries'
import { isRateLimited, rateLimitMessage } from '#/lib/api-errors'
import { passkeysSupported, signInWithPasskey } from '#/lib/passkeys'

/**
 * Asks the owner to prove who they are again (password, or one of their
 * passkeys) before an action that hands over or destroys the account: the API
 * wants a sign-in within the last five minutes (`needsReauth`). Either way a
 * new session replaces the current one.
 *
 * The action then runs on its own button press: Safari only lets a passkey be
 * created from a user gesture, which the re-authentication round trip uses
 * up, and a destructive action stays an explicit choice.
 */
export function ReauthSheet({
  open,
  onOpenChange,
  email,
  purpose,
  continueLabel,
  continueDescription,
  continueVariant = 'primary',
  onContinue,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  email: string
  /** Completes "Pour …, reconnectez-vous", e.g. "ajouter une passkey". */
  purpose: string
  /** The second step's button, e.g. "Ajouter la passkey". */
  continueLabel: string
  /** Shown once the identity is confirmed. */
  continueDescription: string
  continueVariant?: 'primary' | 'danger'
  onContinue: () => void
}) {
  const id = useId()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'password' | 'passkey' | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [supported, setSupported] = useState(false)
  // The passkey choice only when the account has one this browser can use.
  const passkeys = useQuery({ ...passkeysQuery, enabled: open && supported })
  const canUsePasskey = supported && (passkeys.data?.length ?? 0) > 0

  // WebAuthn is only known in the browser (not during SSR).
  useEffect(() => setSupported(passkeysSupported()), [])

  useEffect(() => {
    if (!open) return
    setPassword('')
    setError(null)
    setPending(null)
    setConfirmed(false)
  }, [open])

  async function confirmWithPassword(event: React.FormEvent) {
    event.preventDefault()
    if (!password) {
      setError('Saisissez votre mot de passe.')
      return
    }
    setError(null)
    setPending('password')
    const res = await authControllerLogin({
      body: { email, password },
      throwOnError: false,
    }).catch(() => null)
    setPending(null)
    if (!res?.response) {
      setError('Connexion impossible. Vérifiez votre réseau et réessayez.')
    } else if (isRateLimited(res.response)) {
      setError(rateLimitMessage(res.response))
    } else if (res.error) {
      setError('Mot de passe incorrect.')
    } else {
      setConfirmed(true)
    }
  }

  async function confirmWithPasskey() {
    setError(null)
    setPending('passkey')
    const result = await signInWithPasskey()
    setPending(null)
    if (result.status === 'ok') setConfirmed(true)
    else if (result.status === 'error') setError(result.message)
  }

  if (confirmed) {
    return (
      <PasskeySheet
        open={open}
        onOpenChange={onOpenChange}
        title="Identité confirmée"
        description={continueDescription}
      >
        <Button
          type="button"
          variant={continueVariant}
          className="w-full"
          onClick={onContinue}
        >
          {continueLabel}
        </Button>
      </PasskeySheet>
    )
  }

  return (
    <PasskeySheet
      open={open}
      onOpenChange={onOpenChange}
      title="Confirmez votre identité"
      description={`Pour ${purpose}, reconnectez-vous : la dernière connexion date de plus de 5 minutes.`}
    >
      {canUsePasskey && (
        <Button
          type="button"
          variant="secondary"
          outline
          className="w-full"
          loading={pending === 'passkey'}
          disabled={pending === 'password'}
          onClick={() => void confirmWithPasskey()}
        >
          <KeyRoundIcon />
          Utiliser une passkey
        </Button>
      )}
      <form
        method="post"
        noValidate
        onSubmit={confirmWithPassword}
        className="space-y-4"
      >
        {/* Lets the password manager match the account. */}
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={email}
          readOnly
          hidden
        />
        <Field>
          <FieldLabel htmlFor={`${id}-password`}>Mot de passe</FieldLabel>
          <PasswordInput
            id={`${id}-password`}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          className="w-full"
          loading={pending === 'password'}
          disabled={pending === 'passkey'}
        >
          Confirmer
        </Button>
      </form>
    </PasskeySheet>
  )
}
