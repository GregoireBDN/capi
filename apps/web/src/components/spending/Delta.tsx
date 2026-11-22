import { cn, formatSignedEuros } from '@finances/ui'
import { formatSignedWholeEuros } from '#/lib/money'
import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react'

/**
 * A change, signed euros: more spending is unfavourable, more income or
 * savings favourable (`increaseIsGood`). The arrow, the sign and a
 * screen-reader text carry the meaning, never colour alone.
 */
export function Delta({
  cents,
  increaseIsGood = false,
  whole = false,
  suffix,
  className,
  iconClassName,
}: {
  /** Now minus before, integer cents. */
  cents: number
  /** Income and savings: a rise is good news. */
  increaseIsGood?: boolean
  /** Whole euros (a tile with little room). */
  whole?: boolean
  /** What it is compared with, e.g. "vs oct.". */
  suffix?: string
  className?: string
  /** Overrides the arrow size, e.g. `size-[0.8em]` to scale it with the text. */
  iconClassName?: string
}) {
  const direction = cents > 0 ? 'up' : cents < 0 ? 'down' : 'flat'
  const tone =
    direction === 'flat'
      ? 'neutral'
      : (direction === 'up') === increaseIsGood
        ? 'good'
        : 'bad'
  const Icon =
    direction === 'up'
      ? TrendingUpIcon
      : direction === 'down'
        ? TrendingDownIcon
        : MinusIcon
  return (
    <span
      data-slot="spending-delta"
      data-tone={tone}
      className={cn('inline-flex items-center gap-1 tabular-nums', className)}
    >
      <Icon
        aria-hidden
        className={cn(
          'size-3.5 shrink-0',
          tone === 'bad' && 'text-chart-delta-bad',
          tone === 'good' && 'text-chart-delta-good',
          tone === 'neutral' && 'text-muted-foreground',
          iconClassName,
        )}
      />
      <span className="sr-only">
        {direction === 'flat'
          ? 'Stable : '
          : `${direction === 'up' ? 'En hausse' : 'En baisse'}, ${tone === 'good' ? 'favorable' : 'défavorable'} : `}
      </span>
      <span
        className={cn(
          'font-medium whitespace-nowrap',
          tone === 'bad' && 'text-chart-delta-bad',
          tone === 'good' && 'text-chart-delta-good',
        )}
      >
        {whole ? formatSignedWholeEuros(cents) : formatSignedEuros(cents)}
      </span>
      {suffix && <span className="text-muted-foreground">{suffix}</span>}
    </span>
  )
}
