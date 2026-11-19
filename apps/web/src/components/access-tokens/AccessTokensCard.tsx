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
import { KeyRoundIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { AccessTokenDto } from '#/api/types.gen'
import { CreateAccessTokenSheet } from './CreateAccessTokenSheet'
import {
  accessTokenAuditQuery,
  accessTokenErrorMessage,
  accessTokenKeys,
  accessTokensQuery,
  revokeAccessToken,
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

function TokenRow({
  token,
  onRevoke,
}: {
  token: AccessTokenDto
  onRevoke: () => void
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <div className="min-w-[7rem] flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium break-words">{token.name}</span>
          <Badge
            variant={token.scope === 'write' ? 'warning' : 'secondary'}
            outline
          >
            {token.scope === 'write' ? 'Lecture et écriture' : 'Lecture seule'}
          </Badge>
          {token.expired && (
            <Badge variant="danger" outline>
              Expiré
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          <span className="font-mono">{token.tokenPrefix}…</span>
          {' · '}créé le {formatDate(token.createdAt)}
          {' · '}
          {token.expiresAt
            ? `${token.expired ? 'expiré' : 'expire'} le ${formatDate(token.expiresAt)}`
            : 'sans expiration'}
          {' · '}
          {token.lastUsedAt
            ? `utilisé le ${formatDateTime(token.lastUsedAt)}`
            : 'jamais utilisé'}
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
        Révoquer
      </Button>
    </li>
  )
}

/** Profile section: personal access tokens for Claude (MCP) and scripts. */
export function AccessTokensCard({ email }: { email: string }) {
  const queryClient = useQueryClient()
  const tokens = useQuery(accessTokensQuery)
  const audit = useQuery(accessTokenAuditQuery)
  const [createOpen, setCreateOpen] = useState(false)
  const [toRevoke, setToRevoke] = useState<AccessTokenDto | null>(null)

  const revoke = useMutation({
    mutationFn: (token: AccessTokenDto) => revokeAccessToken(token.id),
    onSuccess: async (_data, token) => {
      toast.success(`Jeton ${token.name} révoqué`)
      setToRevoke(null)
      await queryClient.invalidateQueries({ queryKey: accessTokenKeys.all })
    },
    onError: (error) => toast.error(accessTokenErrorMessage(error)),
  })

  const list = tokens.data ?? []
  const calls = audit.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-4 text-muted-foreground" />
          Jetons d’accès
        </CardTitle>
        <CardDescription>
          Permettent à Claude (MCP) ou à un script d’utiliser l’API sans votre
          mot de passe. Un jeton ne peut ni gérer les jetons, ni supprimer de
          données, ni importer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tokens.isPending ? (
          <p className="text-muted-foreground text-sm">Chargement…</p>
        ) : tokens.isError ? (
          <p className="text-destructive text-sm">
            {accessTokenErrorMessage(tokens.error)}
          </p>
        ) : list.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucun jeton actif.</p>
        ) : (
          <ul className="divide-y" aria-label="Jetons d’accès">
            {list.map((token) => (
              <TokenRow
                key={token.id}
                token={token}
                onRevoke={() => setToRevoke(token)}
              />
            ))}
          </ul>
        )}

        <Button
          type="button"
          variant="secondary"
          outline
          className="w-full"
          onClick={() => setCreateOpen(true)}
        >
          <PlusIcon />
          Créer un jeton
        </Button>

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
                    {call.tokenName}
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

      <CreateAccessTokenSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        email={email}
      />
      <ConfirmDialog
        open={toRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setToRevoke(null)
        }}
        title={`Révoquer le jeton ${toRevoke?.name ?? ''} ?`}
        description="Les clients qui l’utilisent perdront l’accès immédiatement. Cette action est définitive."
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
