import { Button, Card, CardContent } from '@capi/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRightIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { OffsetProposalDto } from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import { DebtArrows } from './DebtArrows'
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
 * The offset to propose with one person (#484): the two arrows between the
 * owner and them, then « Compenser » in one tap and, where it can wait, a ✕
 * that leaves it for later (nothing changes). Screen readers also get what
 * is left after it.
 */
export function OffsetOfferCard({
  offer,
  onIgnore,
}: {
  offer: OffsetProposalDto
  onIgnore?: () => void
}) {
  const offset = useOffset()
  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        <DebtArrows
          name={offer.contactName}
          owedToMeCents={offer.owedToMeCents}
          iOweCents={offer.iOweCents}
        />
        <p className="sr-only">Après compensation : {offsetOutcome(offer)}.</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            className="flex-1"
            iconStart={<ArrowLeftRightIcon />}
            loading={offset.isPending}
            onClick={() => offset.mutate(offer)}
          >
            Compenser
          </Button>
          {onIgnore && (
            <Button
              type="button"
              variant="secondary"
              iconOnly
              aria-label="Ignorer"
              title="Ignorer"
              iconStart={<XIcon />}
              onClick={onIgnore}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
