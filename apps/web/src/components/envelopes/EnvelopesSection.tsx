import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@capi/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { MailIcon, MailPlusIcon } from 'lucide-react'
import { useState } from 'react'
import { useRegisterPageAction } from '#/components/app-shell/page-actions'
import { formatWholeEuros } from '#/lib/money'
import { ROUTES } from '#/lib/routes'
import { CreateEnvelopeSheet } from './CreateEnvelopeSheet'
import { EnvelopeAvatar, Gauge } from './EnvelopeAvatar'
import { envelopeColor, planText } from './format'
import { OffersCard } from './OffersCard'
import { envelopesQuery } from './queries'

/**
 * Épargne's « Enveloppes » (#430, in place of the savings goals): what is
 * set aside and for what, each with its gauge and what it takes per month,
 * a tap away from its page; « À ranger » above when something waits.
 */
export function EnvelopesSection() {
  const envelopes = useQuery(envelopesQuery())
  const [creating, setCreating] = useState(false)
  useRegisterPageAction({
    label: 'Nouvelle enveloppe',
    icon: <MailPlusIcon />,
    onSelect: () => setCreating(true),
  })
  const list = envelopes.data ?? []
  const total = list.reduce((sum, e) => sum + e.totalCents, 0)

  return (
    <>
      <OffersCard />
      <Card aria-labelledby="savings-envelopes">
        <CardHeader>
          <CardTitle id="savings-envelopes">Enveloppes</CardTitle>
          {list.length > 0 && (
            <p className="text-muted-foreground text-sm tabular-nums">
              {formatWholeEuros(total)} mis de côté
            </p>
          )}
          <CardAction>
            <Button
              size="sm"
              variant="secondary"
              outline
              iconStart={<MailPlusIcon />}
              onClick={() => setCreating(true)}
            >
              Nouvelle
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {envelopes.isPending ? (
            <Skeleton className="h-24 rounded-lg" />
          ) : list.length === 0 ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="hover:bg-muted/60 focus-visible:ring-ring text-muted-foreground flex w-full flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-sm outline-none focus-visible:ring-2"
            >
              <MailIcon aria-hidden className="size-6" />
              Mettre de l’argent de côté pour un projet
            </button>
          ) : (
            <ul className="-mx-2 space-y-1" aria-label="Enveloppes">
              {list.map((envelope) => {
                const plan = planText(envelope)
                return (
                  <li key={envelope.id}>
                    <Link
                      to={ROUTES.envelope}
                      params={{ envelopeId: envelope.id }}
                      className="hover:bg-muted/60 focus-visible:ring-ring flex items-center gap-3 rounded-lg p-2 outline-none focus-visible:ring-2"
                    >
                      <EnvelopeAvatar envelope={envelope} />
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                          <span className="min-w-0 truncate text-sm font-medium">
                            {envelope.name}
                          </span>
                          <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
                            {formatWholeEuros(envelope.totalCents)}
                            {envelope.targetCents !== null && (
                              <span className="text-muted-foreground font-normal">
                                {' '}
                                / {formatWholeEuros(envelope.targetCents)}
                              </span>
                            )}
                          </span>
                        </span>
                        {envelope.targetCents !== null && (
                          <Gauge
                            value={envelope.totalCents}
                            max={envelope.targetCents}
                            color={envelopeColor(envelope)}
                            className="h-1.5"
                          />
                        )}
                        {plan && (
                          <span className="text-muted-foreground block truncate text-xs">
                            {plan}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <CreateEnvelopeSheet open={creating} onOpenChange={setCreating} />
    </>
  )
}
