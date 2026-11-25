import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Label,
  Switch,
} from '@capi/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ShieldCheckIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { ReauthSheet } from '#/components/auth/ReauthSheet'
import { needsReauth } from '#/lib/reauth'
import {
  approveAuthorization,
  authorizationDetailsQuery,
  authorizationErrorMessage,
  denyAuthorization,
} from './queries'
import type { AuthorizeParams } from './queries'

/** Sends the browser back to the client (claude.ai). Replaced in tests. */
export const leavePage = {
  to: (url: string) => window.location.assign(url),
}

/**
 * Consent page of the remote MCP connection (#78, ADR 0003): which client
 * asks, where the browser goes back to (the trust anchor: the client name is
 * self-declared) and what it may do. Read only unless the owner ticks writes.
 * Approving needs a recent sign-in, like creating an access token.
 */
export function ConsentCard({
  params,
  email,
}: {
  params: AuthorizeParams
  email: string
}) {
  const id = useId()
  const details = useQuery(authorizationDetailsQuery(params))
  const [allowWrite, setAllowWrite] = useState(false)
  const [reauthOpen, setReauthOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const approve = useMutation({
    mutationFn: () => approveAuthorization(params, allowWrite),
    onSuccess: ({ redirectTo }) => leavePage.to(redirectTo),
    onError: (err) => {
      if (needsReauth(err)) {
        setReauthOpen(true)
        return
      }
      setError(authorizationErrorMessage(err))
    },
  })
  const deny = useMutation({
    mutationFn: () => denyAuthorization(params),
    onSuccess: ({ redirectTo }) => leavePage.to(redirectTo),
    onError: (err) => setError(authorizationErrorMessage(err)),
  })
  const pending = approve.isPending || deny.isPending || approve.isSuccess

  if (details.isPending) {
    return (
      <Card className="w-full max-w-md">
        <CardContent>
          <p className="text-muted-foreground text-sm">Chargement…</p>
        </CardContent>
      </Card>
    )
  }

  if (details.isError) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connexion impossible</CardTitle>
          <CardDescription>
            {authorizationErrorMessage(details.error)}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const { clientName, redirectHost, requestedScope } = details.data

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div
          aria-hidden
          className="bg-primary text-primary-foreground mb-2 grid size-12 place-items-center rounded-2xl"
        >
          <ShieldCheckIcon className="size-6" />
        </div>
        <CardTitle className="text-xl">Connecter une application</CardTitle>
        <CardDescription>
          <span className="text-foreground font-medium break-words">
            {clientName}
          </span>{' '}
          demande l’accès à vos finances. Vous serez renvoyé vers{' '}
          <span className="text-foreground font-mono font-medium break-all">
            {redirectHost}
          </span>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Lire vos comptes, opérations, budgets, épargne et investissements.
          </li>
          <li>
            Jamais : supprimer des données, gérer vos jetons, passkeys ou votre
            compte.
          </li>
        </ul>
        {requestedScope === 'write' && (
          <div className="flex min-h-11 items-start gap-3">
            <Switch
              id={`${id}-write`}
              checked={allowWrite}
              onCheckedChange={setAllowWrite}
              disabled={pending}
            />
            <div className="space-y-0.5">
              <Label htmlFor={`${id}-write`} className="font-normal">
                Autoriser les modifications
              </Label>
              <p className="text-muted-foreground text-xs">
                Catégoriser, noter, ajouter une opération, régler le budget,
                importer un relevé. Chaque modification est d’abord proposée
                dans Claude et attend votre accord.
              </p>
            </div>
          </div>
        )}
        <p className="text-muted-foreground text-xs">
          N’autorisez que si vous venez de lancer cette connexion depuis Claude.
          Vous pourrez la couper à tout moment depuis votre profil.
        </p>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          outline
          className="w-full sm:w-auto"
          disabled={pending}
          loading={deny.isPending}
          onClick={() => {
            setError(null)
            deny.mutate()
          }}
        >
          Refuser
        </Button>
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={pending}
          loading={approve.isPending}
          onClick={() => {
            setError(null)
            approve.mutate()
          }}
        >
          Autoriser
        </Button>
      </CardFooter>

      <ReauthSheet
        open={reauthOpen}
        onOpenChange={setReauthOpen}
        email={email}
        purpose="connecter une application"
        continueLabel="Autoriser"
        continueDescription="Vous pouvez maintenant autoriser la connexion."
        onContinue={() => {
          setReauthOpen(false)
          approve.mutate()
        }}
      />
    </Card>
  )
}
