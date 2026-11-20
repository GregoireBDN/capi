import type { ComponentProps } from 'react'

import { cn } from '../lib/utils'

/*
 * What waits behind a control, the same everywhere (#393, the owner):
 *
 * - `CountPill`: a number in a row (a sidebar entry, a menu item);
 * - `NotificationCount`: a number astride the rounded top-right corner of a
 *   control (a chip, a button), like an app's notification badge;
 * - `NotificationDot`: the same place on an icon button, as a dot.
 *
 * One look: white on the primary colour, 18px pills, a 0.45rem dot, both
 * ringed in the colour around them when they sit on an edge.
 */

/** How far the 45° point of a rounded corner sits from the box's corner, per unit of radius (1 − 1/√2). */
const CORNER_INSET = 0.2929

/** A count as the badges show it: « 99+ » past 99. */
function countText(value: number): string {
  return value > 99 ? '99+' : String(value)
}

/**
 * The look of a count. Its text stays white whatever the parent does on
 * hover or focus (a menu item recolours every child: `focus:**:text-…`).
 */
export const COUNT_PILL =
  'bg-primary text-primary-foreground! **:text-primary-foreground! flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[11px] leading-none font-semibold tabular-nums'

interface CountProps {
  /** Hidden at 0 by the caller: render it only when something waits. */
  value: number
  /** What it counts, said after the control's own name (« 7 opérations à revoir »). */
  label: string
}

/** A count in a row: « 7 », « 99+ » past 99, `label` for screen readers. */
function CountPill({
  value,
  label,
  className,
  ...props
}: CountProps & Omit<ComponentProps<'span'>, 'children'>) {
  return (
    <span
      data-slot="count-pill"
      className={cn(COUNT_PILL, className)}
      {...props}
    >
      <span aria-hidden>{countText(value)}</span>
      <span className="sr-only">, {label}</span>
    </span>
  )
}

/**
 * A count astride the rounded top-right corner of its parent (a chip, a
 * button), centred on the 45° point of the corner's arc: half on the
 * control, half outside. The parent is positioned (`relative`) and must not
 * clip (`overflow-hidden`); give its corner radius (`radius`, default a
 * full pill of 44px: `1rem` at the app's 22px root).
 */
function NotificationCount({
  value,
  label,
  radius = '1rem',
  className,
  style,
  ...props
}: CountProps & {
  /** The parent's corner radius (a pill: half its height). */
  radius?: string
} & Omit<ComponentProps<'span'>, 'children'>) {
  const inset = `calc(${radius} * ${CORNER_INSET})`
  return (
    <span
      data-slot="notification-count"
      className={cn(
        COUNT_PILL,
        'ring-background pointer-events-none absolute translate-x-1/2 -translate-y-1/2 ring-2',
        className,
      )}
      style={{ top: inset, right: inset, ...style }}
      {...props}
    >
      <span aria-hidden>{countText(value)}</span>
      <span className="sr-only">, {label}</span>
    </span>
  )
}

/** Size of `NotificationDot`. */
const DOT_SIZE = '0.45rem'

/**
 * The dot of an icon button that has something waiting, astride the
 * button's rounded top-right corner like `NotificationCount`. Placed from
 * the centre of its parent, which is positioned and centred on the button
 * (the button itself, or a wider row around a centred one, like the folded
 * sidebar's), from the button's side (`box`) and radius.
 */
function NotificationDot({
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
  // From the centre: half the box out to the corner, back in along the arc,
  // then half the dot so its centre lands on the arc.
  const toArc = `${box} / 2 - ${radius} * ${CORNER_INSET}`
  return (
    <span
      data-slot="notification-dot"
      className={cn('pointer-events-none absolute', className)}
      style={{
        top: `calc(50% - (${toArc}) - ${DOT_SIZE} / 2)`,
        left: `calc(50% + (${toArc}) - ${DOT_SIZE} / 2)`,
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

export { CountPill, NotificationCount, NotificationDot }
