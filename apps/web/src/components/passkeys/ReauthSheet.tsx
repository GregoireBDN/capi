import {
  Alert,
  AlertDescription,
  Button,
  Field,
  FieldLabel,
  PasswordInput,
} from '@finances/ui'
import { KeyRoundIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { authControllerLogin } from '#/api'
import { isRateLimited, rateLimitMessage } from '#/lib/api-errors'
import { signInWithPasskey } from '#/lib/passkeys'
import { PasskeySheet } from './PasskeySheet'

/**
 * Asks the owner to prove who they are again (password, or one of their
 * passkeys) before adding a passkey: the API wants a sign-in within the last
 * five minutes. Either way a new session replaces the current one.
 */
export function ReauthSheet({
  open,
  onOpenChange,
  email,
  canUsePasskey,
  onContinue,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  email: string
  /** The account has a passkey and this browser can use it. */
  canUsePasskey: boolean
  /**
   * Second step, on its own button press: Safari only lets a passkey be
   * created from a user gesture, which the re-authentication round trip uses up.
   */
  onContinue: () => void
}) {
  const id = useId()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'password' | 'passkey' | null>(null)
  const [confirmed, setConfirmed] = useState(false)

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
        description="Vous pouvez maintenant créer la passkey sur cet appareil."
      >
        <Button type="button" className="w-full" onClick={onContinue}>
          Ajouter la passkey
        </Button>
      </PasskeySheet>
    )
  }

  return (
    <PasskeySheet
      open={open}
      onOpenChange={onOpenChange}
      title="Confirmez votre identité"
      description="Pour ajouter une passkey, reconnectez-vous : la dernière connexion date de plus de 5 minutes."
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
      <form noValidate onSubmit={confirmWithPassword} className="space-y-4">
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
