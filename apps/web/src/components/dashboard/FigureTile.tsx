import { cn } from '@finances/ui'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { DashboardCardLink } from './DashboardCardHeader'

export interface FigureTileProps {
  label: string
  value: string
  /** Short lines under the value (a rate, a date, a split). */
  notes?: (ReactNode | null | undefined | false)[]
  tone?: 'good' | 'bad' | 'warning'
  /** Makes the whole tile a link to the page behind the figure. */
  link?: Omit<DashboardCardLink, 'label'>
  /** `dl`: the tile is a term / description pair of an enclosing `<dl>`. */
  variant?: 'dl' | 'block'
  className?: string
}

// On a phone (card under 36rem) one compact line: the label left, the
// value right, no notes; from 36rem the label above the value and its notes.
const TILE = cn(
  'bg-muted/50 flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 rounded-xl px-3 py-2.5',
  '@[36rem]:flex-col @[36rem]:flex-nowrap @[36rem]:items-start @[36rem]:justify-start',
)

/**
 * A figure in a filled tile (#262). In a wide card: its label above, the
 * value, a short note or two under it; tiles in one grid row share their
 * height. On a phone: one line, label and value, without the notes (one
 * tile per line). Its size queries the nearest `@container` (the card's
 * figures).
 */
export function FigureTile({
  label,
  value,
  notes = [],
  tone,
  link,
  variant = 'block',
  className,
}: FigureTileProps) {
  const Term = variant === 'dl' ? 'dt' : 'p'
  const Desc = variant === 'dl' ? 'dd' : 'p'
  const shown = notes.filter(Boolean)
  const content = (
    <>
      <Term className="text-muted-foreground text-xs">{label}</Term>
      <Desc
        className={cn(
          'text-[clamp(1rem,11cqi,1.35rem)] font-semibold whitespace-nowrap tabular-nums',
          tone === 'good' && 'text-chart-delta-good',
          tone === 'bad' && 'text-chart-delta-bad',
          tone === 'warning' && 'text-warning-foreground dark:text-warning',
        )}
      >
        {value}
      </Desc>
      {shown.map((note, index) => (
        <Desc
          key={index}
          className="text-muted-foreground hidden text-xs @[36rem]:block"
        >
          {note}
        </Desc>
      ))}
    </>
  )
  if (link) {
    return (
      <Link
        to={link.to}
        search={link.search as never}
        className={cn(
          TILE,
          'hover:bg-muted focus-visible:ring-ring outline-none focus-visible:ring-2',
          className,
        )}
      >
        {content}
      </Link>
    )
  }
  return <div className={cn(TILE, className)}>{content}</div>
}
