import { cn } from '@finances/ui'
import { ArrowLeftRightIcon } from 'lucide-react'
import { formatCents } from '#/lib/money'

/**
 * Signed amount in euros (#266): money in green with « + », money out in the
 * text colour (red is kept for what is wrong, such as an overspent budget),
 * an internal transfer muted after ⇄, since it is neither income nor expense.
 */
export function Amount({
  cents,
  transfer = false,
  className,
}: {
  cents: number
  /** A move between the owner's own accounts. */
  transfer?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium whitespace-nowrap tabular-nums',
        transfer
          ? 'text-muted-foreground'
          : cents > 0 && 'text-chart-delta-good',
        className,
      )}
    >
      {transfer && (
        <ArrowLeftRightIcon
          className="size-[0.7rem] shrink-0"
          aria-label="Virement interne"
        />
      )}
      {cents > 0 ? `+${formatCents(cents)}` : formatCents(cents)}
    </span>
  )
}
