import { cn } from '@finances/ui'
import { formatCents } from '#/lib/money'

/** Signed amount in euros: money in is green, money out red. */
export function Amount({
  cents,
  className,
}: {
  cents: number
  className?: string
}) {
  return (
    <span
      className={cn(
        'font-medium whitespace-nowrap tabular-nums',
        cents < 0
          ? 'text-red-600 dark:text-red-400'
          : 'text-green-700 dark:text-green-400',
        className,
      )}
    >
      {formatCents(cents)}
    </span>
  )
}
