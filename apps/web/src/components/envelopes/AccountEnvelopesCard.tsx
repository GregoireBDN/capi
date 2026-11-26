import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Skeleton,
} from '@capi/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeftRightIcon,
  PencilIcon,
  PlusIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useState } from 'react'
import { formatCents } from '#/lib/money'
import { ROUTES } from '#/lib/routes'
import { CreateEnvelopeSheet } from './CreateEnvelopeSheet'
import { EnvelopeAvatar, FreeAvatar, HATCHED, SplitBar } from './EnvelopeAvatar'
import { envelopeColor, FREE_COLOR, formatBasisPoints } from './format'
import { MoveSheet } from './MoveSheet'
import { accountEnvelopesQuery, envelopesQuery } from './queries'
import { ReduceSheet } from './ReduceSheet'
import { SplitKeySheet } from './SplitKeySheet'

/**
 * An account's envelopes (#428, « A. Barre et liste »): one stacked bar
 * (each envelope in its colour, « Libre » hatched), a row per envelope with
 * its share of the balance, « Libre » last, « Déplacer »; the warning when
 * the balance is under its envelopes; then the split key.
 */
export function AccountEnvelopesCard({
  accountId,
  writable,
}: {
  accountId: string
  writable: boolean
}) {
  const split = useQuery(accountEnvelopesQuery(accountId))
  const all = useQuery(envelopesQuery())
  const [moving, setMoving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editingKey, setEditingKey] = useState(false)
  const [reducing, setReducing] = useState(false)
  const [later, setLater] = useState(false)

  if (split.isPending) return <Skeleton className="h-48 rounded-xl" />
  if (split.isError) return null
  const data = split.data
  const envelopes = data.envelopes
  const hasAny = (all.data ?? []).length > 0

  return (
    <>
      {data.shortfallCents > 0 && (
        <Alert variant="warning">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>Solde sous vos enveloppes</AlertTitle>
          <AlertDescription>
            <p>
              Il manque {formatCents(data.shortfallCents)} pour les couvrir.
              {!later && ' Rien n’est réduit sans vous.'}
            </p>
            {writable && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setReducing(true)}>
                  Choisir quoi réduire
                </Button>
                {!later && (
                  <Button
                    size="sm"
                    variant="secondary"
                    outline
                    onClick={() => setLater(true)}
                  >
                    Plus tard
                  </Button>
                )}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card aria-labelledby={`envelopes-${accountId}`}>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle id={`envelopes-${accountId}`}>Enveloppes</CardTitle>
          {writable && envelopes.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              outline
              iconStart={<ArrowLeftRightIcon />}
              onClick={() => setMoving(true)}
            >
              Déplacer
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {envelopes.length > 0 && (
            <SplitBar
              tall
              segments={[
                ...envelopes.map((e) => ({
                  id: e.envelopeId,
                  label: e.name,
                  cents: e.amountCents,
                  color: envelopeColor(e),
                })),
                {
                  id: 'free',
                  label: 'Libre',
                  cents: data.freeCents ?? 0,
                  color: FREE_COLOR,
                  hatched: true,
                },
              ]}
            />
          )}
          <ul className="-mx-2" aria-label="Répartition du solde">
            {envelopes.map((e) => (
              <li key={e.envelopeId}>
                <Link
                  to={ROUTES.envelope}
                  params={{ envelopeId: e.envelopeId }}
                  className="hover:bg-muted/60 focus-visible:ring-ring flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-1.5 outline-none focus-visible:ring-2"
                >
                  <EnvelopeAvatar envelope={e} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {e.name}
                  </span>
                  <span className="text-right">
                    <span
                      className={cn(
                        'block text-sm font-semibold whitespace-nowrap tabular-nums',
                        e.amountCents < 0 && 'text-chart-delta-bad',
                      )}
                    >
                      {formatCents(e.amountCents)}
                    </span>
                    {e.shareOfBalance !== null && (
                      <span className="text-muted-foreground block text-xs whitespace-nowrap">
                        {formatBasisPoints(e.shareOfBalance)} du solde
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
            <li className="flex min-h-11 items-center gap-2.5 px-2 py-1.5">
              <span
                aria-hidden
                className="size-7 shrink-0 rounded-full border"
                style={{ background: HATCHED }}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                Libre
              </span>
              <span
                className={cn(
                  'text-sm font-semibold whitespace-nowrap tabular-nums',
                  (data.freeCents ?? 0) < 0 && 'text-chart-delta-bad',
                )}
              >
                {data.freeCents === null ? '—' : formatCents(data.freeCents)}
              </span>
            </li>
          </ul>
          {writable && (
            <Button
              variant="secondary"
              ghost
              size="sm"
              iconStart={<PlusIcon />}
              onClick={() => setCreating(true)}
            >
              Nouvelle enveloppe
            </Button>
          )}
        </CardContent>
      </Card>

      {hasAny && (
        <Card aria-labelledby={`key-${accountId}`}>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle id={`key-${accountId}`}>Clé de répartition</CardTitle>
            {writable && (
              <Button
                size="sm"
                variant="secondary"
                outline
                iconStart={<PencilIcon />}
                onClick={() => setEditingKey(true)}
              >
                Modifier
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm" aria-label="Clé de répartition">
              {data.splitKey.map((k) => {
                const envelope = (all.data ?? []).find(
                  (e) => e.id === k.envelopeId,
                )
                if (!envelope) return null
                return (
                  <li key={k.envelopeId} className="flex items-center gap-2.5">
                    <EnvelopeAvatar envelope={envelope} size="sm" />
                    <span className="min-w-0 flex-1 truncate">
                      {envelope.name}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatBasisPoints(k.basisPoints)}
                    </span>
                  </li>
                )
              })}
              <li className="flex items-center gap-2.5">
                <FreeAvatar size="sm" />
                <span className="min-w-0 flex-1">Libre</span>
                <span className="font-semibold tabular-nums">
                  {formatBasisPoints(data.freeBasisPoints)}
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
      )}

      {writable && (
        <>
          <MoveSheet
            open={moving}
            onOpenChange={setMoving}
            accountId={accountId}
          />
          <CreateEnvelopeSheet
            open={creating}
            onOpenChange={setCreating}
            accountId={accountId}
          />
          <SplitKeySheet
            open={editingKey}
            onOpenChange={setEditingKey}
            split={data}
          />
          <ReduceSheet
            open={reducing}
            onOpenChange={setReducing}
            split={data}
          />
        </>
      )}
    </>
  )
}
