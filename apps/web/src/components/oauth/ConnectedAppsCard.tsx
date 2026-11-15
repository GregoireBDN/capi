import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CableIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { OAuthGrantDto } from '#/api/types.gen'
import {
  grantErrorMessage,
  grantsQuery,
  oauthAuditQuery,
  oauthKeys,
  revokeGrant,
} from './queries'

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
const formatDate = (iso: string) => dateFormat.format(new Date(iso))
const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso))

function GrantRow({
  grant,
  onRevoke,
}: {
  grant: OAuthGrantDto
  onRevoke: () => void
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <div className="min-w-[7rem] flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium break-words">{grant.clientName}</span>
          <Badge
            variant={grant.scope === 'write' ? 'warning' : 'secondary'}
            outline
          >
            {grant.scope === 'write' ? 'Lecture et écriture' : 'Lecture seule'}
          </Badge>
        </div>
        <p className="text-muted-foreground text-xs">
          <span className="font-mono break-all">{grant.redirectHost}</span>
          {' · '}connectée le {formatDate(grant.createdAt)}
          {' · '}
          {grant.lastUsedAt
            ? `utilisée le ${formatDateTime(grant.lastUsedAt)}`
            : 'jamais utilisée'}
          {' · '}à renouveler le {formatDate(grant.expiresAt)}
        </p>
      </div>
      <Button
        type="button"
        variant="danger"
        outline
        size="sm"
        className="ml-auto"
        onClick={onRevoke}
      >
        Déconnecter
      </Button>
    </li>
  )
}

/**
 * Profile section: applications connected through OAuth (claude.ai, the
 * Claude apps, #78), next to the personal access tokens. Hidden while remote
 * access is off on the server (`REMOTE_MCP_ENABLED`, the API answers 404).
 */
export function ConnectedAppsCard() {
  const queryClient = useQueryClient()
  const grants = useQuery(grantsQuery)
  const enabled = grants.data !== null && !grants.isPending
  const audit = useQuery({ ...oauthAuditQuery, enabled })
  const [toRevoke, setToRevoke] = useState<OAuthGrantDto | null>(null)

  const revoke = useMutation({
    mutationFn: (grant: OAuthGrantDto) => revokeGrant(grant.id),
    onSuccess: async (_data, grant) => {
      toast.success(`${grant.clientName} déconnecté`)
      setToRevoke(null)
      await queryClient.invalidateQueries({ queryKey: oauthKeys.all })
    },
    onError: (error) => toast.error(grantErrorMessage(error)),
  })

  // Remote access off on this server: nothing to show.
  if (grants.data === null) return null
  if (grants.isPending) return null

  const list = grants.data ?? []
  const calls = audit.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CableIcon className="size-4 text-muted-foreground" />
          Applications connectées
        </CardTitle>
        <CardDescription>
          Connecteurs autorisés depuis Claude (claude.ai, applications mobiles).
          Comme un jeton, une connexion ne peut ni gérer vos jetons, ni
          supprimer de données. Déconnecter coupe l’accès immédiatement.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {grants.isError ? (
          <p className="text-destructive text-sm">
            {grantErrorMessage(grants.error)}
          </p>
        ) : list.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucune application connectée.
          </p>
        ) : (
          <ul className="divide-y" aria-label="Applications connectées">
            {list.map((grant) => (
              <GrantRow
                key={grant.id}
                grant={grant}
                onRevoke={() => setToRevoke(grant)}
              />
            ))}
          </ul>
        )}

        {calls.length > 0 && (
          <details className="group rounded-lg border">
            <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">
              Derniers appels ({calls.length})
            </summary>
            <ul className="divide-y border-t text-xs">
              {calls.map((call) => (
                <li
                  key={call.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2"
                >
                  <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                    {formatDateTime(call.createdAt)}
                  </span>
                  <span className="min-w-0 flex-1 break-all font-mono">
                    {call.method} {call.route}
                  </span>
                  <span className="text-muted-foreground">
                    {call.clientName}
                  </span>
                  <Badge
                    variant={call.statusCode < 400 ? 'success' : 'danger'}
                    outline
                  >
                    {call.statusCode}
                  </Badge>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>

      <ConfirmDialog
        open={toRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setToRevoke(null)
        }}
        title={`Déconnecter ${toRevoke?.clientName ?? ''} ?`}
        description="L’application perd l’accès immédiatement. Pour la reconnecter, ajoutez à nouveau le connecteur depuis Claude."
        confirmLabel="Déconnecter"
        variant="danger"
        loading={revoke.isPending}
        onConfirm={() => {
          if (toRevoke) revoke.mutate(toRevoke)
        }}
      />
    </Card>
  )
}
