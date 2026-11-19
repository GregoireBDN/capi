import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Field,
  FieldError,
  FieldLabel,
  Input,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FingerprintIcon, PlusIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type { PasskeyDto } from '#/api/types.gen'
import { ReauthSheet } from '#/components/auth/ReauthSheet'
import {
  addPasskey,
  defaultPasskeyName,
  passkeysSupported,
} from '#/lib/passkeys'
import { needsReauth } from '#/lib/reauth'
import { PasskeySheet } from './PasskeySheet'
import {
  passkeyErrorMessage,
  passkeyKeys,
  passkeysQuery,
  renamePasskey,
  revokePasskey,
} from './queries'

const NAME_MAX = 100

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Europe/Paris',
})
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
})

function PasskeyRow({
  passkey,
  onRename,
  onRevoke,
}: {
  passkey: PasskeyDto
  onRename: () => void
  onRevoke: () => void
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <div className="min-w-[7rem] flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium break-words">{passkey.name}</span>
          {passkey.backedUp && (
            <Badge variant="secondary" outline>
              Synchronisée
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          ajoutée le {dateFormat.format(new Date(passkey.createdAt))}
          {' · '}
          {passkey.lastUsedAt
            ? `utilisée le ${dateTimeFormat.format(new Date(passkey.lastUsedAt))}`
            : 'jamais utilisée'}
        </p>
      </div>
      <div className="ml-auto flex gap-2">
        <Button
          type="button"
          variant="secondary"
          outline
          size="sm"
          onClick={onRename}
        >
          Renommer
        </Button>
        <Button
          type="button"
          variant="danger"
          outline
          size="sm"
          onClick={onRevoke}
        >
          Révoquer
        </Button>
      </div>
    </li>
  )
}

function RenameSheet({
  passkey,
  onClose,
}: {
  passkey: PasskeyDto | null
  onClose: () => void
}) {
  const id = useId()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!passkey) return
    setName(passkey.name)
    setSubmitted(false)
  }, [passkey])

  const rename = useMutation({
    mutationFn: () => renamePasskey(passkey!.id, name.trim()),
    onSuccess: async () => {
      toast.success('Passkey renommée')
      onClose()
      await queryClient.invalidateQueries({ queryKey: passkeyKeys.all })
    },
    onError: (error) => toast.error(passkeyErrorMessage(error)),
  })

  const nameError =
    name.trim() === '' ? 'Donnez un nom à la passkey.' : undefined

  return (
    <PasskeySheet
      open={passkey !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Renommer la passkey"
      description="Un nom pour la reconnaître, par exemple l’appareil qui l’a créée."
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(true)
          if (!nameError) rename.mutate()
        }}
      >
        <Field data-invalid={submitted && !!nameError}>
          <FieldLabel htmlFor={`${id}-name`}>Nom</FieldLabel>
          <Input
            id={`${id}-name`}
            value={name}
            maxLength={NAME_MAX}
            autoComplete="off"
            aria-invalid={submitted && !!nameError}
            onChange={(event) => setName(event.target.value)}
          />
          {submitted && nameError && <FieldError>{nameError}</FieldError>}
        </Field>
        <Button type="submit" className="w-full" loading={rename.isPending}>
          Enregistrer
        </Button>
      </form>
    </PasskeySheet>
  )
}

/** What waits for the owner to sign in again. */
type PendingAction = { kind: 'add' } | { kind: 'revoke'; passkey: PasskeyDto }

/**
 * Profile section: the owner's passkeys (add, rename, revoke). Adding and
 * revoking need a fresh session; when the last sign-in is too old,
 * `ReauthSheet` asks for the password or a passkey first, then the action
 * resumes.
 */
export function PasskeysCard({ email }: { email: string }) {
  const queryClient = useQueryClient()
  const passkeys = useQuery(passkeysQuery)
  const [supported, setSupported] = useState(false)
  const [adding, setAdding] = useState(false)
  // Kept after closing so the sheet's text doesn't change while it animates out.
  const [reauth, setReauth] = useState<PendingAction>({ kind: 'add' })
  const [reauthOpen, setReauthOpen] = useState(false)

  function askReauth(action: PendingAction) {
    setReauth(action)
    setReauthOpen(true)
  }
  const [toRename, setToRename] = useState<PasskeyDto | null>(null)
  const [toRevoke, setToRevoke] = useState<PasskeyDto | null>(null)

  // WebAuthn is only known in the browser (not during SSR).
  useEffect(() => setSupported(passkeysSupported()), [])

  async function add() {
    setAdding(true)
    const result = await addPasskey(defaultPasskeyName())
    setAdding(false)
    if (result.status === 'ok') {
      toast.success(`Passkey ${result.data.name} ajoutée`)
      await queryClient.invalidateQueries({ queryKey: passkeyKeys.all })
    } else if (result.status === 'reauth') {
      askReauth({ kind: 'add' })
    } else if (result.status === 'error') {
      toast.error(result.message)
    }
  }

  const revoke = useMutation({
    mutationFn: (passkey: PasskeyDto) => revokePasskey(passkey.id),
    onSuccess: async (_data, passkey) => {
      toast.success(`Passkey ${passkey.name} révoquée`)
      setToRevoke(null)
      await queryClient.invalidateQueries({ queryKey: passkeyKeys.all })
    },
    onError: (error, passkey) => {
      if (needsReauth(error)) {
        setToRevoke(null)
        askReauth({ kind: 'revoke', passkey })
      } else {
        toast.error(passkeyErrorMessage(error))
      }
    },
  })

  const list = passkeys.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FingerprintIcon className="size-4 text-muted-foreground" />
          Passkeys
        </CardTitle>
        <CardDescription>
          Face ID ou Touch ID au lieu du mot de passe, qui reste utilisable.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {passkeys.isPending ? (
          <p className="text-muted-foreground text-sm">Chargement…</p>
        ) : passkeys.isError ? (
          <p className="text-destructive text-sm">
            {passkeyErrorMessage(passkeys.error)}
          </p>
        ) : list.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune passkey.</p>
        ) : (
          <ul className="divide-y" aria-label="Passkeys">
            {list.map((passkey) => (
              <PasskeyRow
                key={passkey.id}
                passkey={passkey}
                onRename={() => setToRename(passkey)}
                onRevoke={() => setToRevoke(passkey)}
              />
            ))}
          </ul>
        )}

        {supported ? (
          <Button
            type="button"
            variant="secondary"
            outline
            className="w-full"
            loading={adding}
            onClick={() => void add()}
          >
            <PlusIcon />
            Ajouter une passkey
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">
            Ce navigateur ne permet pas d’ajouter une passkey.
          </p>
        )}
      </CardContent>

      <ReauthSheet
        open={reauthOpen}
        onOpenChange={setReauthOpen}
        email={email}
        {...(reauth.kind === 'revoke'
          ? {
              purpose: 'révoquer une passkey',
              continueLabel: 'Révoquer la passkey',
              continueDescription: `Vous pouvez maintenant révoquer la passkey ${reauth.passkey.name}.`,
              continueVariant: 'danger' as const,
            }
          : {
              purpose: 'ajouter une passkey',
              continueLabel: 'Ajouter la passkey',
              continueDescription:
                'Vous pouvez maintenant créer la passkey sur cet appareil.',
            })}
        onContinue={() => {
          setReauthOpen(false)
          if (reauth.kind === 'revoke') revoke.mutate(reauth.passkey)
          else void add()
        }}
      />
      <RenameSheet passkey={toRename} onClose={() => setToRename(null)} />
      <ConfirmDialog
        open={toRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setToRevoke(null)
        }}
        title={`Révoquer la passkey ${toRevoke?.name ?? ''} ?`}
        description="Elle ne pourra plus vous connecter. Supprimez-la aussi de l’app Mots de passe de l’appareil. Votre mot de passe reste utilisable."
        confirmLabel="Révoquer"
        variant="danger"
        loading={revoke.isPending}
        onConfirm={() => {
          if (toRevoke) revoke.mutate(toRevoke)
        }}
      />
    </Card>
  )
}
