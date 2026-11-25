import { cn } from '@capi/ui'
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
  /** Notes on a phone too: the ones that explain the figure (#321). */
  notesOnPhone?: boolean
  className?: string
}

// The label above the value at every width; the notes from 36rem of card.
const TILE =
  'bg-muted/50 flex min-w-0 flex-col items-start rounded-xl px-3 py-2.5'

/**
 * A figure in a filled tile (#262). In a wide card: its label above, the
 * value, a short note or two under it; tiles in one grid row share their
 * height. On a phone the same, without the notes (one tile per line). Its size queries the nearest `@container` (the card's
 * figures).
 */
export function FigureTile({
  label,
  value,
  notes = [],
  tone,
  link,
  variant = 'block',
  notesOnPhone = false,
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
          className={cn(
            'text-muted-foreground text-xs',
            !notesOnPhone && 'hidden @[36rem]:block',
          )}
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
