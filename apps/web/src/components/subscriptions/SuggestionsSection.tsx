import { Badge, Button } from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCheckIcon, CheckIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { RecurringItemDto } from '#/api/types.gen'
import { RecurringCategoryIcon } from './RecurringCategoryIcon'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { plural } from '#/lib/plural'
import {
  CADENCE_LABELS,
  confidenceLabel,
  formatAmountPerPeriod,
  HIGH_CONFIDENCE,
} from './format'
import {
  afterRecurringChanged,
  confirmRecurringItems,
  recurringErrorMessage,
  updateRecurringItem,
} from './queries'

const percent = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 0,
})

interface SuggestionsSectionProps {
  suggestions: RecurringItemDto[]
  onEdit: (item: RecurringItemDto) => void
}

/**
 * Detected series waiting for review: confirm (it joins the costs) or
 * dismiss (never suggested again). "Tout confirmer" confirms the
 * high-confidence ones in one request.
 */
export function SuggestionsSection({
  suggestions,
  onEdit,
}: SuggestionsSectionProps) {
  const queryClient = useQueryClient()
  const confident = suggestions.filter((s) => s.confidence >= HIGH_CONFIDENCE)

  const review = useMutation({
    mutationFn: ({
      item,
      status,
    }: {
      item: RecurringItemDto
      status: 'confirmed' | 'dismissed'
    }) => updateRecurringItem(item.id, { status }),
    onSuccess: async (item) => {
      toast.success(
        item.status === 'confirmed'
          ? `${item.name} confirmé`
          : `${item.name} ignoré`,
      )
      await afterRecurringChanged(queryClient)
    },
    onError: (error) => toast.error(recurringErrorMessage(error)),
  })

  const confirmAll = useMutation({
    mutationFn: () => confirmRecurringItems(confident.map((s) => s.id)),
    onSuccess: async ({ confirmedCount }) => {
      toast.success(
        `${plural(confirmedCount, 'élément confirmé', 'éléments confirmés')}`,
      )
      await afterRecurringChanged(queryClient)
    },
    onError: (error) => toast.error(recurringErrorMessage(error)),
  })

  return (
    <section aria-labelledby="suggestions-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="suggestions-title" className="font-semibold">
          Suggestions{' '}
          <span className="text-muted-foreground font-normal">
            ({suggestions.length})
          </span>
        </h2>
        {confident.length > 0 && (
          <Button
            size="sm"
            outline
            iconStart={<CheckCheckIcon />}
            loading={confirmAll.isPending}
            onClick={() => confirmAll.mutate()}
          >
            Tout confirmer ({confident.length})
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        Opérations qui reviennent régulièrement. Confirmez-les pour les suivre,
        ignorez celles qui n’en sont pas.
      </p>
      <ul className="space-y-2" aria-label="Suggestions">
        {suggestions.map((item) => (
          <li key={item.id} className="bg-card rounded-xl border p-3">
            <button
              type="button"
              className="hover:bg-muted/50 focus-visible:ring-ring/50 -m-1 flex w-[calc(100%+0.5rem)] min-w-0 items-start gap-2 rounded-lg p-1 text-left outline-none focus-visible:ring-[3px]"
              onClick={() => onEdit(item)}
              aria-label={`Détails de ${item.name}`}
            >
              <RecurringCategoryIcon item={item} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="min-w-0 font-medium break-words">
                    {item.name}
                  </span>
                  <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">
                    {item.direction === 'credit' ? '+' : ''}
                    {formatAmountPerPeriod(item)}
                  </span>
                </span>
                <span className="text-muted-foreground block text-xs">
                  {CADENCE_LABELS[item.cadence]} ·{' '}
                  {plural(item.occurrenceCount, 'fois', 'fois')} depuis le{' '}
                  {formatCalendarDate(item.firstSeenDate)}
                </span>
              </span>
            </button>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge
                variant={
                  item.confidence >= HIGH_CONFIDENCE ? 'success' : 'secondary'
                }
                outline
              >
                {confidenceLabel(item.confidence)} ·{' '}
                {percent.format(item.confidence)}
              </Badge>
              {item.amountType === 'variable' && (
                <Badge variant="secondary" outline>
                  {formatCents(item.minAmountCents)} –{' '}
                  {formatCents(item.maxAmountCents)}
                </Badge>
              )}
            </div>
            <ol
              aria-label="Dernières opérations"
              className="text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums"
            >
              {item.occurrences.slice(0, 3).map((occurrence) => (
                <li key={occurrence.transactionId}>
                  {formatCalendarDate(occurrence.date)} ·{' '}
                  {formatCents(occurrence.amountCents)}
                </li>
              ))}
            </ol>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                size="sm"
                iconStart={<CheckIcon />}
                disabled={review.isPending}
                onClick={() => review.mutate({ item, status: 'confirmed' })}
                aria-label={`Confirmer ${item.name}`}
              >
                Confirmer
              </Button>
              <Button
                size="sm"
                variant="secondary"
                outline
                iconStart={<XIcon />}
                disabled={review.isPending}
                onClick={() => review.mutate({ item, status: 'dismissed' })}
                aria-label={`Ignorer ${item.name}`}
              >
                Ignorer
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
