'use client'

import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui'
import * as React from 'react'

import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type SegmentedControlProps<T extends string> = Omit<
  React.ComponentProps<'div'>,
  'defaultValue' | 'dir' | 'onChange'
> & {
  /** The selected segment: a segmented control is never empty. */
  value: T
  onValueChange: (value: T) => void
  /**
   * Stretch across the row, the segments sharing its width. They never get
   * narrower than their label: the track scrolls sideways instead.
   */
  fullWidth?: boolean
  /** Disables every segment. */
  disabled?: boolean
}

type SegmentedControlItemProps = Omit<
  React.ComponentProps<typeof ToggleGroupPrimitive.Item>,
  'value'
> & {
  value: string
}

interface SegmentedControlContextValue {
  select: (value: string) => void
  /** True between an arrow key press and the focus it moves. */
  arrowKey: React.RefObject<boolean>
}

/* ============================================================================
 * CONTEXT
 * ========================================================================= */

const SegmentedControlContext =
  React.createContext<SegmentedControlContextValue | null>(null)

/** Keys that move the focus between segments (Radix roving focus). */
const NAVIGATION_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
])

/* ============================================================================
 * COMPONENTS
 * ========================================================================= */

/**
 * Segmented Control
 * One choice among a few, always set: a rounded track with the selected
 * segment raised. Built on Radix `ToggleGroup type="single"` (radio
 * semantics, roving focus); an arrow key moves to the next segment and
 * selects it, like a radio group, and pressing the selected segment again
 * keeps it selected. 44px high (2rem at the app's 22px root), so every
 * segment is a full touch target.
 */
function SegmentedControl<T extends string>({
  value,
  onValueChange,
  fullWidth = false,
  disabled,
  className,
  children,
  onKeyDown,
  onPointerDown,
  ...props
}: SegmentedControlProps<T>) {
  const arrowKey = React.useRef(false)
  const context = React.useMemo<SegmentedControlContextValue>(
    () => ({
      select: (next) => {
        if (next && next !== value) onValueChange(next as T)
      },
      arrowKey,
    }),
    [value, onValueChange],
  )

  return (
    <ToggleGroupPrimitive.Root
      type="single"
      role="radiogroup"
      data-slot="segmented-control"
      data-full-width={fullWidth || undefined}
      value={value}
      onValueChange={context.select}
      disabled={disabled}
      onKeyDown={(event) => {
        arrowKey.current = NAVIGATION_KEYS.has(event.key)
        onKeyDown?.(event)
      }}
      onPointerDown={(event) => {
        arrowKey.current = false
        onPointerDown?.(event)
      }}
      className={cn(
        [
          // Layout: equal segments (columns as wide as the widest label),
          // as wide as them or the whole row; never narrower than a label,
          // so a row too narrow scrolls (`auto-cols-fr`, `minmax(0, 1fr)`,
          // let the labels overlap instead, #433)
          'grid max-w-full auto-cols-[minmax(max-content,1fr)] grid-flow-col items-stretch gap-0.5',
          fullWidth ? 'w-full' : 'w-fit',

          // Track: 44px high with the padding, which also leaves room for
          // the focus ring and the touch hit areas inside the scroll box
          'bg-muted rounded-full p-[3px]',
          'dark:bg-black/25',

          // Too many segments for the row: scroll sideways, no scrollbar
          'overflow-x-auto overscroll-x-contain',
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        ].join(' '),
        className,
      )}
      {...props}
    >
      <SegmentedControlContext.Provider value={context}>
        {children}
      </SegmentedControlContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

/**
 * Segmented Control Item
 * One segment: its label (and an optional count or icon). Disabled segments
 * are skipped by the arrow keys.
 */
function SegmentedControlItem({
  className,
  value,
  onFocus,
  ...props
}: SegmentedControlItemProps) {
  const context = React.useContext(SegmentedControlContext)
  if (!context) {
    throw new Error('SegmentedControlItem must be used in a SegmentedControl')
  }

  return (
    <ToggleGroupPrimitive.Item
      data-slot="segmented-control-item"
      value={value}
      onFocus={(event) => {
        // Selection follows the focus moved by an arrow key (radio group).
        if (context.arrowKey.current) {
          context.arrowKey.current = false
          context.select(value)
        }
        onFocus?.(event)
      }}
      className={cn(
        [
          // Layout: a column of the track, never narrower than its label
          'relative inline-flex items-center justify-center gap-1.5',
          'min-h-[calc(2rem-6px)] min-w-[calc(2rem-6px)] px-3',

          // Touch screens: 44px hit area, inside the track's padding
          'pointer-coarse:touch-hitbox',

          // Styling
          'rounded-full',

          // Typography
          'text-muted-foreground text-sm font-medium whitespace-nowrap',

          // Transitions
          'transition-[color,background-color,box-shadow] outline-none',

          // Hover States
          'hover:text-foreground',

          // Focus States
          'focus-visible:ring-ring/50 focus-visible:ring-[3px]',

          // Selected: raised above the track
          'data-[state=on]:bg-card data-[state=on]:text-foreground',
          'data-[state=on]:shadow-sm',
          'dark:data-[state=on]:bg-foreground/15',

          // Disabled States
          'disabled:pointer-events-none disabled:opacity-50',

          // Icons
          '[&_svg]:pointer-events-none [&_svg]:shrink-0',
          "[&_svg:not([class*='size-'])]:size-4",
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export {
  SegmentedControl,
  SegmentedControlItem,
  type SegmentedControlItemProps,
  type SegmentedControlProps,
}
