import { Button, Skeleton } from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { connectorUrlQuery } from '#/components/oauth/queries'
import { CopyBlock } from './CopyBlock'
import { StepDialog } from './StepDialog'

/**
 * « Claude sur le téléphone et claude.ai » (#329): the connector's address
 * to paste in claude.ai, then the owner approves on this app's consent page
 * (`/oauth/authorize`), where the permissions are chosen. Only offered while
 * remote access is on (#328).
 */
export function ConnectorSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const url = useQuery({ ...connectorUrlQuery, enabled: open })

  return (
    <StepDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      label="Connecter Claude sur le téléphone et claude.ai"
      description="L’adresse du connecteur à coller dans Claude."
      title="Ajoutez Finances comme connecteur"
      action={
        <Button
          type="button"
          className="min-h-11 flex-1 font-medium"
          onClick={onClose}
        >
          Terminé
        </Button>
      }
    >
      <div className="space-y-4">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Dans claude.ai (sur ordinateur)&nbsp;: Paramètres › Connecteurs ›
            «&nbsp;Ajouter un connecteur personnalisé&nbsp;». Il sera aussi dans
            l’app Claude du téléphone.
          </li>
          <li>Nommez-le «&nbsp;Finances&nbsp;» et collez cette adresse.</li>
          <li>
            Claude ouvre ensuite cette app&nbsp;: vous validerez l’accès sur
            cette page, en lecture seule ou avec le droit de classer.
          </li>
        </ol>
        {url.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : url.data ? (
          <CopyBlock
            label="Adresse du connecteur"
            text={url.data}
            copiedMessage="Adresse copiée"
          />
        ) : (
          <p className="text-destructive text-sm">
            Adresse introuvable&nbsp;: l’accès à distance n’est pas joignable.
          </p>
        )}
      </div>
    </StepDialog>
  )
}
