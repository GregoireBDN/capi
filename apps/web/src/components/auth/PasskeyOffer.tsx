import { useNavigate } from '@tanstack/react-router'
import { FingerprintIcon, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  addPasskey,
  defaultPasskeyName,
  dismissPasskeyOffer,
} from '#/lib/passkeys'
import { ROUTES } from '#/lib/routes'
import { Alert, AlertAction, AlertDescription, Button } from '@finances/ui'

/**
 * Shown once signed in with the password, when the account has no passkey and
 * this device can create one. The session is fresh, so no re-authentication.
 */
export function PasskeyOffer() {
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enterApp = () => navigate({ to: ROUTES.dashboard })

  async function onAdd() {
    setError(null)
    setPending(true)
    const result = await addPasskey(defaultPasskeyName())
    setPending(false)
    if (result.status === 'ok') {
      toast.success('Passkey ajoutée')
      await enterApp()
    } else if (result.status === 'error') {
      setError(result.message)
    } else if (result.status === 'reauth') {
      setError('Ajoutez-la depuis votre profil.')
    }
  }

  async function onLater() {
    dismissPasskeyOffer()
    await enterApp()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <FingerprintIcon className="text-primary mt-0.5 size-6 shrink-0" />
        <p className="text-muted-foreground text-sm">
          La prochaine fois, connectez-vous d’un geste avec Face ID ou Touch ID,
          sans mot de passe. La passkey est enregistrée dans le trousseau de
          l’appareil (iCloud la synchronise entre l’iPhone et le Mac). Votre mot
          de passe reste utilisable.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
          <AlertAction onClick={() => setError(null)} aria-label="Fermer">
            <X className="size-3.5" />
          </AlertAction>
        </Alert>
      )}

      <Button
        type="button"
        fullWidth
        loading={pending}
        onClick={() => void onAdd()}
      >
        Ajouter une passkey
      </Button>
      <Button
        type="button"
        variant="secondary"
        outline
        fullWidth
        disabled={pending}
        onClick={() => void onLater()}
      >
        Plus tard
      </Button>
    </div>
  )
}
