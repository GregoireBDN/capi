import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
} from '@finances/ui'
import { TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { profileControllerRemove } from '#/api'
import { ReauthSheet } from '#/components/auth/ReauthSheet'
import { unwrap } from '#/lib/queries'
import { needsReauth } from '#/lib/reauth'

/**
 * Profile danger zone: deletes the account and all its data. The API wants a
 * fresh session for it; when the last sign-in is too old, `ReauthSheet` asks
 * for the password or a passkey, then a last press deletes.
 */
export function DeleteAccountCard({
  email,
  onDeleted,
}: {
  email: string
  /** Signs out and leaves the page once the account is gone. */
  onDeleted: () => Promise<void>
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reauthOpen, setReauthOpen] = useState(false)

  async function deleteAccount() {
    setDeleting(true)
    try {
      await unwrap(profileControllerRemove({ throwOnError: false }))
    } catch (error) {
      setDeleting(false)
      if (needsReauth(error)) {
        setConfirmOpen(false)
        setReauthOpen(true)
      } else {
        toast.error('Impossible de supprimer le compte')
      }
      return
    }
    await onDeleted()
  }

  return (
    <Card className="ring-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <TriangleAlertIcon className="size-4" />
          Supprimer le compte
        </CardTitle>
        <CardDescription>
          La suppression de votre compte est définitive. Toutes vos données
          seront effacées et ne pourront pas être récupérées.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          onConfirm={deleteAccount}
          title="Supprimer votre compte ?"
          description="Cette action est irréversible. Toutes vos données seront définitivement supprimées et vous ne pourrez pas récupérer votre compte."
          confirmLabel="Supprimer définitivement"
          variant="danger"
          loading={deleting}
          trigger={
            <Button variant="danger" outline className="w-full">
              Supprimer mon compte
            </Button>
          }
        />
        <ReauthSheet
          open={reauthOpen}
          onOpenChange={setReauthOpen}
          email={email}
          purpose="supprimer votre compte"
          continueLabel="Supprimer définitivement"
          continueDescription="Dernière étape : toutes vos données seront définitivement supprimées."
          continueVariant="danger"
          onContinue={() => {
            setReauthOpen(false)
            void deleteAccount()
          }}
        />
      </CardContent>
    </Card>
  )
}
