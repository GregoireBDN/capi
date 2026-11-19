import { Button } from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
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
 * again). Every change's toast offers « Annuler ».
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
  const [termMonths, setTermMonths] = useState<number | null>(current ?? 12)
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
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Un paiement fait en une fois pour plusieurs mois (hébergement, logiciel,
        assurance…). Il reste dans les dépenses de son mois, mais sort des
        moyennes et des budgets proposés.
      </p>
      <PrepaidTermControl
        value={termMonths}
        onChange={setTermMonths}
        allowNone={declared}
        amountCents={amountCents}
      />
      {termMonths !== null && (
        <p className="text-sm">
          Renouvellement le{' '}
          {formatDayMonth(addMonths(item.bookingDate, termMonths), today)}, avec
          un rappel 30 jours avant.
        </p>
      )}
      <Button
        type="button"
        className="w-full"
        loading={pending}
        disabled={declared ? termMonths === current : termMonths === null}
        onClick={() => {
          if (!declared) declare.mutate(termMonths!)
          else change.mutate(termMonths)
        }}
      >
        {declared ? 'Enregistrer' : 'Déclarer'}
      </Button>
    </div>
  )
}
