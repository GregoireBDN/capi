import { Button, cn } from '@capi/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClockIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { TransactionDto } from '#/api/types.gen'
import { formatCalendarDate } from '#/lib/money'
import {
  declarePrepaid,
  recurringErrorMessage,
  undoablePrepaidToast,
} from './queries'

/** « Prépayé 12 mois ? », the question the row asks (#439). */
export function prepaidSuggestionText(item: TransactionDto): string | null {
  const suggestion = item.prepaidSuggestion
  if (!suggestion) return null
  return `Prépayé ${suggestion.termMonths} mois ?`
}

/** Why the row asks it. */
function prepaidSuggestionReason(item: TransactionDto): string {
  const suggestion = item.prepaidSuggestion!
  return suggestion.earlierOn
    ? `Déjà payé le ${formatCalendarDate(suggestion.earlierOn)} : un abonnement payé pour ${suggestion.termMonths} mois ? Compté dans son mois, hors des moyennes.`
    : `Un abonnement payé pour ${suggestion.termMonths} mois ? Compté dans son mois, hors des moyennes, son renouvellement rappelé.`
}

/**
 * The answer to « Prépayé 12 mois ? » on a large debit of « À revoir »
 * (#439): one tap declares it prepaid for the suggested term (#314), the
 * toast offers « Annuler ». « Valider » keeps it an ordinary expense.
 */
export function PrepaidSuggestionButton({
  item,
  name,
  className,
}: {
  item: TransactionDto
  name: string
  className?: string
}) {
  const queryClient = useQueryClient()
  const declare = useMutation({
    mutationFn: () =>
      declarePrepaid({
        transactionId: item.id,
        termMonths: item.prepaidSuggestion!.termMonths,
      }),
    onSuccess: (declaration) => undoablePrepaidToast(queryClient, declaration),
    onError: (error) => toast.error(recurringErrorMessage(error)),
  })
  if (!item.prepaidSuggestion) return null
  return (
    <Button
      size="sm"
      variant="secondary"
      outline
      iconStart={<CalendarClockIcon />}
      aria-label={`${prepaidSuggestionText(item)} ${name}`}
      title={prepaidSuggestionReason(item)}
      className={cn('size-8 p-0', className)}
      loading={declare.isPending}
      onClick={() => declare.mutate()}
    />
  )
}
