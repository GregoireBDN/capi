import { useNavigate } from '@tanstack/react-router'
import { ChevronDownIcon, X } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import {
  addPasskey,
  defaultPasskeyName,
  dismissPasskeyOffer,
} from '#/lib/passkeys'
import { postLoginReturnPath } from '#/lib/post-login'
import { ROUTES } from '#/lib/routes'
import { FaceIdIcon } from './FaceIdIcon'
import { Alert, AlertAction, AlertDescription, Button } from '@capi/ui'

/**
 * Shown once signed in with the password, when the account has no passkey and
 * this device can create one. The session is fresh, so no re-authentication.
 *
 * A full-screen security step rather than a form: one title, one line, the two
 * actions; the details wait behind "En savoir plus" (#168).
 */
export function PasskeyOffer() {
  const navigate = useNavigate()
  const titleId = useId()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enterApp = () => {
    // Back to the OAuth consent page when it sent the owner here (#78).
    const back = postLoginReturnPath()
    return back ? navigate({ href: back }) : navigate({ to: ROUTES.dashboard })
  }

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
    <section
      aria-labelledby={titleId}
      className="flex w-full max-w-xs flex-col items-center text-center"
    >
      <div
        aria-hidden
        className="bg-primary text-primary-foreground grid size-14 place-items-center rounded-2xl shadow-sm"
      >
        <FaceIdIcon className="size-8" />
      </div>

      <h1
        id={titleId}
        className="font-heading mt-5 text-xl font-semibold tracking-tight text-balance"
      >
        Connexion sans mot de passe
      </h1>
      <p className="text-muted-foreground mt-1.5 text-sm text-balance">
        La prochaine fois, entrez avec Face ID ou Touch ID.
      </p>

      {error && (
        <Alert variant="destructive" className="mt-5 text-left">
          <AlertDescription>{error}</AlertDescription>
          <AlertAction onClick={() => setError(null)} aria-label="Fermer">
            <X className="size-3.5" />
          </AlertAction>
        </Alert>
      )}

      <div className="mt-7 w-full space-y-2">
        <Button
          type="button"
          size="lg"
          fullWidth
          className="rounded-xl"
          loading={pending}
          onClick={() => void onAdd()}
        >
          Ajouter une passkey
        </Button>
        <Button
          type="button"
          variant="primary"
          ghost
          size="lg"
          fullWidth
          className="rounded-xl"
          disabled={pending}
          onClick={() => void onLater()}
        >
          Plus tard
        </Button>
      </div>

      <details className="group mt-4 w-full text-sm">
        <summary className="text-muted-foreground hover:text-foreground touch-hitbox relative mx-auto flex w-fit cursor-pointer list-none items-center gap-1 px-2 py-1 [&::-webkit-details-marker]:hidden">
          En savoir plus
          <ChevronDownIcon
            aria-hidden
            className="size-3.5 transition-transform group-open:rotate-180"
          />
        </summary>
        <p className="text-muted-foreground pt-1 text-xs text-balance">
          La passkey reste dans le trousseau de l’appareil, synchronisé par
          iCloud. Votre mot de passe reste utilisable.
        </p>
      </details>
    </section>
  )
}
