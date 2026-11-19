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
import { MonitorSmartphoneIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { SessionDto } from '#/api/types.gen'
import { ReauthSheet } from '#/components/auth/ReauthSheet'
import { ApiRequestError } from '#/lib/queries'
import { needsReauth } from '#/lib/reauth'
import {
  revokeSession,
  sessionErrorMessage,
  sessionKeys,
  sessionsQuery,
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

const SIGN_IN_METHODS: Record<SessionDto['signInMethod'], string> = {
  password: 'mot de passe',
  passkey: 'passkey',
  sign_up: 'inscription',
  unknown: 'méthode inconnue',
}

export const deviceName = (session: SessionDto) =>
  session.device ?? 'Appareil inconnu'

function SessionRow({
  session,
  onEnd,
}: {
  session: SessionDto
  onEnd: () => void
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <div className="min-w-[7rem] flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium break-words">{deviceName(session)}</span>
          {session.current && (
            <Badge variant="secondary" outline>
              Cet appareil
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          connecté le {dateFormat.format(new Date(session.signedInAt))} (
          {SIGN_IN_METHODS[session.signInMethod]}){' · '}
          actif le {dateTimeFormat.format(new Date(session.lastUsedAt))}
        </p>
        {session.reuseDetectedAt && (
          <p className="text-destructive text-xs">
            Déconnecté : réutilisation détectée le{' '}
            {dateTimeFormat.format(new Date(session.reuseDetectedAt))}
          </p>
        )}
      </div>
      {!session.current && !session.reuseDetectedAt && (
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="danger"
            outline
            size="sm"
            onClick={onEnd}
          >
            Déconnecter
          </Button>
        </div>
      )}
    </li>
  )
}

/**
 * Profile section (#217, ASVS 3.3.4): the browsers and devices signed in to
 * the account (refresh-token families). Ending one revokes it: that device is
 * signed out at its next refresh, within 15 minutes. Needs a fresh session;
 * when the last sign-in is too old, `ReauthSheet` asks for the password or a
 * passkey first. This device signs out from the menu instead. A session ended
 * by reuse detection in the last 30 days stays listed with « Déconnecté :
 * réutilisation détectée » (#292), without an action.
 */
export function SessionsCard({ email }: { email: string }) {
  const queryClient = useQueryClient()
  const sessions = useQuery(sessionsQuery)
  const [toEnd, setToEnd] = useState<SessionDto | null>(null)
  // Kept after closing so the sheet's text doesn't change while it animates out.
  const [reauth, setReauth] = useState<SessionDto | null>(null)
  const [reauthOpen, setReauthOpen] = useState(false)

  const end = useMutation({
    mutationFn: (session: SessionDto) => revokeSession(session.id),
    onSuccess: async (_data, session) => {
      toast.success(`${deviceName(session)} déconnecté`)
      setToEnd(null)
      await queryClient.invalidateQueries({ queryKey: sessionKeys.all })
    },
    onError: async (error, session) => {
      if (needsReauth(error)) {
        setToEnd(null)
        setReauth(session)
        setReauthOpen(true)
        return
      }
      toast.error(sessionErrorMessage(error))
      // Already ended elsewhere: close the dialog and show the fresh list.
      if (error instanceof ApiRequestError && error.status === 404) {
        setToEnd(null)
        await queryClient.invalidateQueries({ queryKey: sessionKeys.all })
      }
    },
  })

  const list = sessions.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MonitorSmartphoneIcon className="size-4 text-muted-foreground" />
          Sessions
        </CardTitle>
        <CardDescription>
          Les appareils connectés à votre compte. Déconnectez celui que vous ne
          reconnaissez pas ou que vous avez perdu.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sessions.isPending ? (
          <p className="text-muted-foreground text-sm">Chargement…</p>
        ) : sessions.isError ? (
          <p className="text-destructive text-sm">
            {sessionErrorMessage(sessions.error)}
          </p>
        ) : list.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune session.</p>
        ) : (
          <ul className="divide-y" aria-label="Sessions">
            {list.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                onEnd={() => setToEnd(session)}
              />
            ))}
          </ul>
        )}
      </CardContent>

      <ReauthSheet
        open={reauthOpen}
        onOpenChange={setReauthOpen}
        email={email}
        purpose="déconnecter un appareil"
        continueLabel="Déconnecter l’appareil"
        continueDescription={`Vous pouvez maintenant déconnecter ${reauth ? deviceName(reauth) : 'l’appareil'}.`}
        continueVariant="danger"
        onContinue={() => {
          setReauthOpen(false)
          if (reauth) end.mutate(reauth)
        }}
      />
      <ConfirmDialog
        open={toEnd !== null}
        onOpenChange={(open) => {
          if (!open) setToEnd(null)
        }}
        title={`Déconnecter ${toEnd ? deviceName(toEnd) : ''} ?`}
        description="Cet appareil devra se reconnecter, au plus tard dans 15 minutes. Changez aussi votre mot de passe si vous pensez qu’il est connu."
        confirmLabel="Déconnecter"
        variant="danger"
        loading={end.isPending}
        onConfirm={() => {
          if (toEnd) end.mutate(toEnd)
        }}
      />
    </Card>
  )
}
