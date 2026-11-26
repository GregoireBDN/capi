import { Button, Card, CardContent, CardHeader, CardTitle } from '@capi/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightIcon, PiggyBankIcon, ReceiptIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { EnvelopeOfferDto } from '#/api/types.gen'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { accountsQuery } from '#/lib/queries'
import { EnvelopeAvatar } from './EnvelopeAvatar'
import {
  afterEnvelopesChanged,
  applySplit,
  attachToEnvelope,
  dismissOffer,
  envelopeErrorMessage,
  envelopeOffersQuery,
  envelopesQuery,
} from './queries'

/** Offers shown before « Voir les … autres »: the screen stays light. */
const SHOWN = 2

type OfferKind = 'saving' | 'transfer' | 'expense'

/**
 * « À ranger » (#428, proposal 1): savings to split by the account's key,
 * transfers out that can carry an envelope's money, expenses an envelope
 * can pay. Nothing is attached without the owner: a tap on an envelope, or
 * « Non ». Hidden when there is nothing to offer.
 */
export function OffersCard() {
  const offers = useQuery(envelopeOffersQuery)
  const envelopes = useQuery(envelopesQuery())
  const accounts = useQuery(accountsQuery)
  const [all, setAll] = useState(false)
  const data = offers.data
  if (!data) return null
  const items: { kind: OfferKind; offer: EnvelopeOfferDto }[] = [
    ...data.savings.map((offer) => ({ kind: 'saving' as const, offer })),
    ...data.transfers.map((offer) => ({ kind: 'transfer' as const, offer })),
    ...data.expenses.map((offer) => ({ kind: 'expense' as const, offer })),
  ]
  if (items.length === 0) return null
  const accountName = (id: string | null) =>
    (accounts.data ?? []).find((a) => a.id === id)?.name ?? ''
  const look = (id: string) =>
    (envelopes.data ?? []).find((e) => e.id === id) ?? {
      icon: null,
      color: null,
    }

  return (
    <Card aria-labelledby="envelope-offers">
      <CardHeader>
        <CardTitle id="envelope-offers">À ranger</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y" aria-label="À ranger">
          {(all ? items : items.slice(0, SHOWN)).map(({ kind, offer }) => (
            <OfferRow
              key={`${kind}-${offer.transaction.transactionId}`}
              kind={kind}
              offer={offer}
              accountName={accountName}
              look={look}
            />
          ))}
        </ul>
        {!all && items.length > SHOWN && (
          <Button
            variant="secondary"
            ghost
            size="sm"
            className="mt-2"
            onClick={() => setAll(true)}
          >
            Voir les {items.length - SHOWN} autres
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function OfferRow({
  kind,
  offer,
  accountName,
  look,
}: {
  kind: OfferKind
  offer: EnvelopeOfferDto
  accountName: (id: string | null) => string
  look: (id: string) => { icon: string | null; color: string | null }
}) {
  const queryClient = useQueryClient()
  const t = offer.transaction
  const amount = Math.abs(t.amountCents)
  const done = {
    onSuccess: async () => {
      await afterEnvelopesChanged(queryClient)
      toast.success('Rangé')
    },
    onError: (e: unknown) => toast.error(envelopeErrorMessage(e)),
  }
  const split = useMutation({
    mutationFn: () => applySplit(t.transactionId),
    ...done,
  })
  const attach = useMutation({
    mutationFn: (envelopeId: string) =>
      attachToEnvelope(envelopeId, t.transactionId),
    ...done,
  })
  const dismiss = useMutation({
    mutationFn: () => dismissOffer(t.transactionId),
    onSuccess: () => afterEnvelopesChanged(queryClient),
    onError: done.onError,
  })
  const busy = split.isPending || attach.isPending || dismiss.isPending
  const Icon =
    kind === 'saving'
      ? PiggyBankIcon
      : kind === 'transfer'
        ? ArrowRightIcon
        : ReceiptIcon

  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2.5">
        <span className="bg-muted text-muted-foreground grid size-7 shrink-0 place-items-center rounded-full">
          <Icon aria-hidden className="size-[0.8rem]" />
        </span>
        <p className="min-w-0 flex-1 text-sm">
          <span className="block font-medium break-normal">
            {kind === 'transfer'
              ? `${accountName(t.accountId)} → ${accountName(t.counterpartAccountId)}`
              : kind === 'saving'
                ? `Épargne sur ${accountName(t.accountId)}`
                : t.label}
          </span>
          <span className="text-muted-foreground block text-xs">
            {formatCalendarDate(t.bookingDate)}
          </span>
        </p>
        <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
          {formatCents(amount)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 pl-9">
        {kind === 'saving' ? (
          <Button
            size="sm"
            loading={split.isPending}
            disabled={busy}
            onClick={() => split.mutate()}
          >
            {offer.envelopes
              .map((e) => `${e.name} ${formatCents(e.amountCents)}`)
              .join(' · ')}
          </Button>
        ) : (
          offer.envelopes.map((e) => (
            <Button
              key={e.envelopeId}
              size="sm"
              variant="secondary"
              outline
              disabled={busy}
              loading={attach.isPending && attach.variables === e.envelopeId}
              iconStart={
                <EnvelopeAvatar
                  envelope={look(e.envelopeId)}
                  size="sm"
                  className="-ml-1 size-5"
                />
              }
              onClick={() => attach.mutate(e.envelopeId)}
            >
              {e.name} {formatCents(Math.min(e.amountCents, amount))}
            </Button>
          ))
        )}
        <Button
          size="sm"
          variant="secondary"
          ghost
          iconStart={<XIcon />}
          disabled={busy}
          onClick={() => dismiss.mutate()}
        >
          Non
        </Button>
      </div>
    </li>
  )
}
