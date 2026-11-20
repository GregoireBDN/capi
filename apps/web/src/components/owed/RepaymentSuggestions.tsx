import { Button, Card, CardContent } from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCheckIcon, FlagIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { RepaymentSuggestionDto } from '#/api/types.gen'
import { formatCalendarDate, formatCents } from '#/lib/money'
import {
  afterOwedChanged,
  linkRepayment,
  owedErrorMessage,
  repaymentSuggestionsQuery,
  UNDO_TOAST_MS,
  unlinkPayment,
} from './queries'

/**
 * In « À revoir » (#359): transfers whose label is a contact's and whose
 * amount is exactly some of what they owe (or what the owner owes them),
 * « Remboursement de Camille ? » with « Lier » in one tap. « Modifier »
 * opens the transfer's editor on « C'est un remboursement ».
 */
export function RepaymentSuggestions({
  onEdit,
}: {
  onEdit?: (transactionId: string) => void
}) {
  const suggestions = useQuery(repaymentSuggestionsQuery)
  if (!suggestions.data || suggestions.data.length === 0) return null
  return (
    <div className="space-y-2">
      {suggestions.data.map((suggestion) => (
        <SuggestionCard
          key={suggestion.transactionId}
          suggestion={suggestion}
          onEdit={onEdit}
        />
      ))}
    </div>
  )
}

function SuggestionCard({
  suggestion,
  onEdit,
}: {
  suggestion: RepaymentSuggestionDto
  onEdit?: (transactionId: string) => void
}) {
  const queryClient = useQueryClient()
  const owedToMe = suggestion.direction === 'owed_to_me'
  const linked = suggestion.links.reduce((sum, l) => sum + l.amountCents, 0)
  const link = useMutation({
    mutationFn: () =>
      linkRepayment({
        transactionId: suggestion.transactionId,
        items: suggestion.links,
      }),
    onSuccess: async (result) => {
      await afterOwedChanged(queryClient)
      let undone = false
      toast.success(
        `${formatCents(result.linkedCents)} liés à ${suggestion.contactName}`,
        {
          duration: UNDO_TOAST_MS,
          action: {
            label: 'Annuler',
            onClick: () => {
              if (undone) return
              undone = true
              void Promise.all(result.payments.map((p) => unlinkPayment(p.id)))
                .then(() => afterOwedChanged(queryClient))
                .catch((error: unknown) => toast.error(owedErrorMessage(error)))
            },
          },
        },
      )
    },
    onError: (error) => toast.error(owedErrorMessage(error)),
  })
  return (
    <Card size="sm">
      <CardContent className="space-y-2 text-sm">
        <p className="flex items-center gap-2">
          <FlagIcon aria-hidden className="text-muted-foreground size-4" />
          <span className="font-medium break-normal">
            {owedToMe
              ? `Remboursement de ${suggestion.contactName} ?`
              : `Vous remboursez ${suggestion.contactName} ?`}
          </span>
        </p>
        <p className="text-muted-foreground text-xs">
          {formatCents(Math.abs(suggestion.amountCents))} le{' '}
          {formatCalendarDate(suggestion.bookingDate)} · {suggestion.label} :{' '}
          {suggestion.links.length > 1
            ? `${suggestion.links.length} dépenses`
            : '1 dépense'}{' '}
          pour {formatCents(linked)}.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            iconStart={<CheckCheckIcon />}
            loading={link.isPending}
            onClick={() => link.mutate()}
          >
            Lier
          </Button>
          {onEdit && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onEdit(suggestion.transactionId)}
            >
              Modifier
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
