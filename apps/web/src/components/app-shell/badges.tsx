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

/** Size of `IconDot`. */
const DOT_SIZE = '0.45rem'
/** How far the 45° point of a rounded corner sits from the box's corner, per unit of radius (1 − 1/√2). */
const CORNER_INSET = 0.2929

/**
 * The dot of an icon button that has something waiting (#393, the owner:
 * the same dot in the same place on every such button, ☰, « ⋮ », the
 * folded sidebar's entries). Like a notification badge, it sits astride
 * the button's rounded corner, centred on the 45° point of its arc: half
 * on the button, half outside, ringed in the colour around it. Placed from
 * the centre of its parent, which is positioned and centred on the button
 * (the button itself, or the sidebar's row around a centred one).
 */
export function IconDot({
  label,
  labelId,
  box = '2rem',
  radius = 'var(--radius-lg)',
  className,
  style,
  ...props
}: {
  /** Said to screen readers (« 7 opérations à revoir »). */
  label?: string
  /** Id of that text, for the button's `aria-describedby`. */
  labelId?: string
  /** The button's side (44px: `size-8`). */
  box?: string
  /** The button's corner radius (`Button`: `--radius-lg`; sidebar: `--radius-md`). */
  radius?: string
} & Omit<ComponentProps<'span'>, 'children'>) {
  // From the parent's centre: half the box out to the corner, back in along
  // the arc, then half the dot so its centre lands on the arc.
  const offset = `calc(${box} / 2 - ${radius} * ${CORNER_INSET} + ${DOT_SIZE} / 2)`
  return (
    <span
      data-slot="icon-dot"
      className={cn('pointer-events-none absolute', className)}
      style={{
        top: `calc(50% - ${offset})`,
        left: `calc(50% + ${box} / 2 - ${radius} * ${CORNER_INSET} - ${DOT_SIZE} / 2)`,
        ...style,
      }}
      {...props}
    >
      <span
        aria-hidden
        className="bg-primary ring-background block rounded-full ring-2"
        style={{ width: DOT_SIZE, height: DOT_SIZE }}
      />
      {label && (
        <span id={labelId} className="sr-only">
          {label}
        </span>
      )}
    </span>
  )
}
