import { Button, Card, CardContent } from '@capi/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BanIcon, CheckIcon, RefreshCwIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { RecurringItemDto } from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import { formatDayMonth, formatRelativeDay } from './format'
import {
  afterRecurringChanged,
  recurringErrorMessage,
  UNDO_TOAST_MS,
  updateRecurringItem,
} from './queries'
import { RecurringCategoryIcon } from './RecurringCategoryIcon'

/**
 * Prepaid subscriptions renewing within 30 days (#314, `renewalReminder`):
 * the moment to decide. « Garder » silences the reminder for this renewal
 * (the toast offers « Annuler »); « Résilier » opens the cancellation, set
 * to the renewal date.
 */
export function RenewalReminders({
  items,
  today,
  onEnd,
}: {
  items: readonly RecurringItemDto[]
  today: string
  onEnd: (item: RecurringItemDto) => void
}) {
  const queryClient = useQueryClient()
  const keep = useMutation({
    mutationFn: (item: RecurringItemDto) =>
      updateRecurringItem(item.id, { keepRenewal: true }),
    onSuccess: async (saved) => {
      await afterRecurringChanged(queryClient)
      let undone = false
      toast.success(
        `${saved.name} gardé · renouvellement le ${formatDayMonth(saved.renewalDate!, today)}`,
        {
          duration: UNDO_TOAST_MS,
          action: {
            label: 'Annuler',
            onClick: () => {
              if (undone) return
              undone = true
              void updateRecurringItem(saved.id, { keepRenewal: false })
                .then(() => afterRecurringChanged(queryClient))
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

  const due = items.filter((item) => item.renewalReminder && item.renewalDate)
  if (due.length === 0) return null
  return (
    <section aria-label="Renouvellements à décider" className="space-y-2">
      {due.map((item) => (
        <Card key={item.id} size="sm">
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2">
              <RecurringCategoryIcon item={item} />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-medium break-words">
                  {item.name} se renouvelle{' '}
                  {formatRelativeDay(item.renewalDate!, today)}
                </p>
                <p className="text-muted-foreground text-sm tabular-nums">
                  <RefreshCwIcon
                    aria-hidden="true"
                    className="mr-1 inline size-3.5 align-[-2px]"
                  />
                  {formatCents(item.typicalAmountCents)} pour {item.termMonths}{' '}
                  mois le {formatDayMonth(item.renewalDate!, today)} ·{' '}
                  {item.accountName}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                outline
                iconStart={<CheckIcon />}
                loading={keep.isPending && keep.variables.id === item.id}
                disabled={keep.isPending}
                onClick={() => keep.mutate(item)}
              >
                Garder
              </Button>
              <Button
                outline
                variant="danger"
                iconStart={<BanIcon />}
                disabled={keep.isPending}
                onClick={() => onEnd(item)}
              >
                Résilier
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  )
}
