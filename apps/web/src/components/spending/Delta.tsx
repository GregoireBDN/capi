import { cn, formatSignedEuros } from '@finances/ui'
import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react'

/**
 * Spending change, signed euros: more spending is unfavourable. The arrow,
 * the sign and a screen-reader text carry the meaning, never colour alone.
 */
export function Delta({
  cents,
  suffix,
  className,
  iconClassName,
}: {
  /** Spent now minus spent before, integer cents. */
  cents: number
  /** What it is compared with, e.g. "vs oct.". */
  suffix?: string
  className?: string
  /** Overrides the arrow size, e.g. `size-[0.8em]` to scale it with the text. */
  iconClassName?: string
}) {
  const direction = cents > 0 ? 'up' : cents < 0 ? 'down' : 'flat'
  const Icon =
    direction === 'up'
      ? TrendingUpIcon
      : direction === 'down'
        ? TrendingDownIcon
        : MinusIcon
  return (
    <span
      data-slot="spending-delta"
      data-tone={
        direction === 'up' ? 'bad' : direction === 'down' ? 'good' : 'neutral'
      }
      className={cn('inline-flex items-center gap-1 tabular-nums', className)}
    >
      <Icon
        aria-hidden
        className={cn(
          'size-3.5 shrink-0',
          direction === 'up' && 'text-chart-delta-bad',
          direction === 'down' && 'text-chart-delta-good',
          direction === 'flat' && 'text-muted-foreground',
          iconClassName,
        )}
      />
      <span className="sr-only">
        {direction === 'up'
          ? 'En hausse, défavorable : '
          : direction === 'down'
            ? 'En baisse, favorable : '
            : 'Stable : '}
      </span>
      <span
        className={cn(
          'font-medium whitespace-nowrap',
          direction === 'up' && 'text-chart-delta-bad',
          direction === 'down' && 'text-chart-delta-good',
        )}
      >
        {formatSignedEuros(cents)}
      </span>
      {suffix && <span className="text-muted-foreground">{suffix}</span>}
    </span>
  )
}
