import { Button, Card, CardContent } from '@capi/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRightIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { OffsetProposalDto } from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import { netText } from './format'
import {
  afterOwedChanged,
  createOffset,
  owedErrorMessage,
  UNDO_TOAST_MS,
  undoOffset,
} from './queries'

/**
 * « Compenser » in one tap (#484): the offset of `offer`, then a toast whose
 * « Annuler » undoes it (both sides together).
 */
export function useOffset(onDone?: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (offer: OffsetProposalDto) => createOffset(offer.contactId),
    onSuccess: async (made, offer) => {
      onDone?.()
      await afterOwedChanged(queryClient)
      let undone = false
      toast.success(
        `${formatCents(made.amountCents)} compensés avec ${offer.contactName}`,
        {
          duration: UNDO_TOAST_MS,
          action: {
            label: 'Annuler',
            onClick: () => {
              if (undone) return
              undone = true
              void undoOffset(made.id)
                .then(() => afterOwedChanged(queryClient))
                .catch((error: unknown) => toast.error(owedErrorMessage(error)))
            },
          },
        },
      )
    },
    onError: (error) => toast.error(owedErrorMessage(error)),
  })
}

/** What is left once offset: « il restera : Camille vous doit 15 € ». */
export function offsetOutcome(offer: OffsetProposalDto): string {
  return netText(offer.contactName, offer.owedToMeCents - offer.iOweCents)
}

/**
 * The offset to propose with one person (#484): what each owes, what the
 * offset settles on each side, what is left, « Compenser » and, where the
 * owner can leave it for later, « Ignorer » (nothing changes).
 */
export function OffsetOfferCard({
  offer,
  onIgnore,
  framed = true,
}: {
  offer: OffsetProposalDto
  onIgnore?: () => void
  /** In its own card (lists), or bare inside a sheet. */
  framed?: boolean
}) {
  const offset = useOffset()
  const body = (
    <div className="space-y-2 text-sm">
      <p className="flex items-center gap-2">
        <ArrowLeftRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
        <span className="font-medium break-normal">
          Compenser avec {offer.contactName} ?
        </span>
      </p>
      <p className="text-muted-foreground break-normal">
        {offer.contactName} vous doit {formatCents(offer.owedToMeCents)} et vous
        lui devez {formatCents(offer.iOweCents)}. Compenser règle{' '}
        {formatCents(offer.amountCents)} de chaque côté, sans virement ni effet
        sur vos dépenses. Il restera : {offsetOutcome(offer)}.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          iconStart={<ArrowLeftRightIcon />}
          loading={offset.isPending}
          onClick={() => offset.mutate(offer)}
        >
          Compenser {formatCents(offer.amountCents)}
        </Button>
        {onIgnore && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onIgnore}
          >
            Ignorer
          </Button>
        )}
      </div>
    </div>
  )
  if (!framed) return body
  return (
    <Card size="sm">
      <CardContent>{body}</CardContent>
    </Card>
  )
}
