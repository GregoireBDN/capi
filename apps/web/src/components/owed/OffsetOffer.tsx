import { Button, Card, CardContent } from '@capi/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRightIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { OffsetProposalDto } from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import { ContactAvatar } from './ContactAvatar'
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
 * The offset to propose with one person (#484), in two short lines: who owes
 * what both ways, then what is left after it; « Compenser » in one tap and,
 * where it can wait, a ✕ that leaves it for later (nothing changes).
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
      <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ContactAvatar name={offer.contactName} />
        <div className="min-w-[7rem] flex-1 space-y-0.5">
          <p className="text-sm font-medium break-normal">
            Compenser avec {offer.contactName} ?
          </p>
          <p className="text-muted-foreground text-xs tabular-nums break-normal">
            Il vous doit {formatCents(offer.owedToMeCents)} · vous lui devez{' '}
            {formatCents(offer.iOweCents)}
          </p>
          <p className="text-xs tabular-nums break-normal">
            Après : <span className="font-medium">{offsetOutcome(offer)}</span>
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            iconStart={<ArrowLeftRightIcon />}
            loading={offset.isPending}
            onClick={() => offset.mutate(offer)}
          >
            Compenser
          </Button>
          {onIgnore && (
            <Button
              type="button"
              size="sm"
              ghost
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
