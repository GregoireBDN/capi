import { cn } from '@finances/ui'
import { Slot } from 'radix-ui'
import { ChevronRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'

const TONES = {
  muted: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  warning: 'bg-warning/20 text-warning-foreground dark:text-warning',
} as const

/**
 * One row of the dashboard's main card (#405): an icon badge, the title over
 * its second line, then the figure (never cut) and the chevron, both centred
 * on the row; the whole row is the link given as its child.
 */
export function GlanceRow({
  icon,
  tone,
  highlight = false,
  title,
  value,
  detail,
  children,
}: {
  icon: ReactNode
  tone: keyof typeof TONES
  /** Tinted background: something to look at (the balance running low). */
  highlight?: boolean
  title: ReactNode
  value: ReactNode
  detail?: ReactNode
  /** The link (a router `Link`), which becomes the row. */
  children: ReactNode
}) {
  return (
    <Slot.Root
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 text-sm outline-none',
        'focus-visible:ring-ring focus-visible:ring-2',
        highlight ? 'bg-warning/15' : 'hover:bg-muted/60',
      )}
    >
      <Slot.Slottable>{children}</Slot.Slottable>
      <span
        aria-hidden
        className={cn(
          // 32px whatever the root size, like the list rows' badges.
          'flex size-[32px] shrink-0 items-center justify-center rounded-full [&_svg]:size-[16px]',
          TONES[tone],
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        {detail && (
          <span className="text-muted-foreground block text-xs">{detail}</span>
        )}
      </span>
      {/* The figure and the chevron both centred on the row, side by side
          (the owner). */}
      <span className="flex shrink-0 items-center gap-2">
        <span className="font-semibold whitespace-nowrap tabular-nums">
          {value}
        </span>
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </span>
    </Slot.Root>
  )
}
