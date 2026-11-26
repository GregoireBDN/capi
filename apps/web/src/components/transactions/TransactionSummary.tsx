import { AnswerFigure, Button, cn } from '@capi/ui'
import { InboxIcon } from 'lucide-react'
import type { TransactionSummaryDto } from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import { plural } from '#/lib/plural'

/**
 * Opérations' big figure (#434, the owner's « A. Le chiffre réponse »):
 * the transactions left to review over every date, and the button that
 * opens them. Shown while some wait and no filter narrows the list; the
 * title's « À revoir » takes over otherwise.
 */
export function ReviewAnswer({
  count,
  onReview,
}: {
  count: number
  onReview: () => void
}) {
  return (
    <AnswerFigure
      data-slot="review-answer"
      icon={<InboxIcon />}
      label="À revoir"
      value={
        <>
          <span aria-hidden>{count}</span>
          <span className="sr-only">
            {plural(count, 'opération à revoir', 'opérations à revoir')}
          </span>
        </>
      }
      tone="warning"
    >
      <Button className="w-full" onClick={onReview}>
        Revoir
      </Button>
    </AnswerFigure>
  )
}

/**
 * The sum of what a search or a filter lists (#434): income minus
 * expenses, transfers between the user's own accounts left out. The
 * month's own totals are Mouvements'; the count heads the list.
 */
export function FilterSum({ summary }: { summary: TransactionSummaryDto }) {
  const cents = summary.netCents
  return (
    <p
      data-slot="filter-sum"
      className="flex items-baseline justify-between gap-3 px-1 text-[15px]"
    >
      <span className="text-muted-foreground">Somme</span>
      <span
        className={cn(
          'font-semibold whitespace-nowrap tabular-nums',
          cents > 0 && 'text-chart-delta-good',
        )}
      >
        {cents > 0 ? '+' : ''}
        {formatCents(cents)}
      </span>
    </p>
  )
}
