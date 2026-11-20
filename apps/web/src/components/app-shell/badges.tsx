import { cn } from '@finances/ui'
import type { ComponentProps } from 'react'

/**
 * The look of a count (« 7 »), the same everywhere it shows (#393, the
 * owner): the sidebar's row, a page action in the « ⋮ » menu, a filter
 * chip. White on the primary colour whatever its parent does on hover or
 * focus (a menu item recolours every child: `focus:**:text-…`).
 */
export const COUNT_PILL =
  'bg-primary text-primary-foreground! **:text-primary-foreground! flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[11px] leading-none font-semibold tabular-nums'

/** A count shown as `COUNT_PILL`, « 99+ » past 99, `label` for screen readers. */
export function CountPill({
  value,
  label,
  className,
  ...props
}: {
  value: number
  /** What it counts, said after the control's own name (« 7 opérations à revoir »). */
  label: string
} & Omit<ComponentProps<'span'>, 'children'>) {
  return (
    <span className={cn(COUNT_PILL, className)} {...props}>
      <span aria-hidden>{value > 99 ? '99+' : value}</span>
      <span className="sr-only">, {label}</span>
    </span>
  )
}

/**
 * The dot of an icon button that has something waiting (#393, the owner:
 * one place on every such button, ☰, « ⋮ », the folded sidebar's
 * entries). Placed from the centre of its parent, where the 1.1rem icon
 * sits: just beyond the icon's top-right corner, clear of the glyph and of
 * the button's edge. The parent is positioned and centred on the icon.
 */
export function IconDot({
  label,
  labelId,
  className,
  ...props
}: {
  /** Said to screen readers (« 7 opérations à revoir »). */
  label?: string
  /** Id of that text, for the button's `aria-describedby`. */
  labelId?: string
} & Omit<ComponentProps<'span'>, 'children'>) {
  return (
    <span
      data-slot="icon-dot"
      className={cn(
        'pointer-events-none absolute top-[calc(50%-0.8rem)] left-[calc(50%+0.4rem)]',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className="bg-primary block size-[0.4rem] rounded-full"
      />
      {label && (
        <span id={labelId} className="sr-only">
          {label}
        </span>
      )}
    </span>
  )
}
