import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { TransactionDto } from '#/api/types.gen'
import { addMonths, formatDayMonth, todayInParis } from './format'
import { PrepaidTermControl } from './PrepaidTermControl'
import {
  afterPrepaidChanged,
  declarePrepaid,
  recurringErrorMessage,
  UNDO_TOAST_MS,
  undoablePrepaidToast,
  updateRecurringItem,
} from './queries'

/**
 * « Abonnement prépayé » of the transaction editor (#314): declares an
 * expense as a subscription paid upfront for 12, 24 or 36 months, or
 * changes the term of the one it pays (« Non » makes it an ordinary item
 * again). One tap on a term saves it (#398: a list, each term's monthly
 * cost and renewal); every change's toast offers « Annuler ».
 */
export function PrepaidScreen({
  item,
  onDone,
}: {
  item: TransactionDto
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const today = todayInParis()
  const current = item.prepaidItemId ? item.prepaidTermMonths : null
  const amountCents = -item.amountCents

  const declare = useMutation({
    mutationFn: (term: number) =>
      declarePrepaid({ transactionId: item.id, termMonths: term }),
    onSuccess: (declaration) => {
      onDone()
      undoablePrepaidToast(queryClient, declaration)
    },
    onError: (error) => toast.error(recurringErrorMessage(error)),
  })

  const change = useMutation({
    mutationFn: (term: number | null) =>
      updateRecurringItem(item.prepaidItemId!, { termMonths: term }),
    onSuccess: (saved, term) => {
      onDone()
      void afterPrepaidChanged(queryClient)
      let undone = false
      toast.success(
        term === null
          ? `${saved.name} n’est plus prépayé`
          : `${saved.name} : prépayé ${term} mois`,
        {
          duration: UNDO_TOAST_MS,
          action: {
            label: 'Annuler',
            onClick: () => {
              if (undone) return
              undone = true
              // Unlinking dropped the payment: link it again.
              const undo =
                term === null
                  ? declarePrepaid({
                      transactionId: item.id,
                      termMonths: current!,
                    })
                  : updateRecurringItem(saved.id, { termMonths: current })
              void undo
                .then(() => afterPrepaidChanged(queryClient))
                .catch(() =>
                  toast.error('Impossible d’annuler la modification.'),
                )
            },
          },
        },
      )
    },
    onError: (error) => toast.error(recurringErrorMessage(error)),
  })

  const pending = declare.isPending || change.isPending
  const declared = item.prepaidItemId !== null
  // A tap saves (#398): no button, the toast offers « Annuler ».
  return (
    <div className="space-y-4" aria-busy={pending || undefined}>
      <p className="text-muted-foreground text-sm">
        Payé une fois pour plusieurs mois : compté dans son mois, hors des
        moyennes.
      </p>
      <PrepaidTermControl
        value={current}
        allowNone={declared}
        amountCents={amountCents}
        detail={(months) =>
          `Renouvellement le ${formatDayMonth(addMonths(item.bookingDate, months), today)}`
        }
        onChange={(term) => {
          if (pending || term === current) return
          if (!declared) {
            if (term !== null) declare.mutate(term)
          } else change.mutate(term)
        }}
      />
    </div>
  )
}
