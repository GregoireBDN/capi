'use client'

import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui'
import * as React from 'react'

import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

interface ChoiceTileOption<T extends string> {
  value: T
  /** Its name, under its icon (« Dépense »). */
  label: string
  icon: React.ReactNode
  /**
   * The tile's colour once chosen (any CSS colour, `var(--…)` included):
   * its border, its icon and a light tint. The primary colour without one.
   */
  color?: string
}

type ChoiceTilesProps<T extends string> = Omit<
  React.ComponentProps<'div'>,
  'defaultValue' | 'dir' | 'onChange'
> & {
  options: readonly ChoiceTileOption<T>[]
  /** The chosen tile: never empty. */
  value: T
  onValueChange: (value: T) => void
  disabled?: boolean
}

/** Keys that move the focus between tiles (Radix roving focus). */
const NAVIGATION_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
])

/* ============================================================================
 * COMPONENT
 * ========================================================================= */

/**
 * Choice Tiles
 * One choice among a few, shown big (#396, the owner's « A. Tuiles »): a
 * row of equal tiles, an icon over a short name, the chosen one drawn in its
 * colour. Radio semantics like `SegmentedControl`: an arrow key moves to the
 * next tile and chooses it, choosing the chosen tile again keeps it.
 */
function ChoiceTiles<T extends string>({
  options,
  value,
  onValueChange,
  disabled,
  className,
  style,
  onKeyDown,
  onPointerDown,
  ...props
}: ChoiceTilesProps<T>) {
  const arrowKey = React.useRef(false)
  const select = (next: string) => {
    if (next && next !== value) onValueChange(next as T)
  }
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      role="radiogroup"
      data-slot="choice-tiles"
      value={value}
      onValueChange={select}
      disabled={disabled}
      onKeyDown={(event) => {
        arrowKey.current = NAVIGATION_KEYS.has(event.key)
        onKeyDown?.(event)
      }}
      onPointerDown={(event) => {
        arrowKey.current = false
        onPointerDown?.(event)
      }}
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        ...style,
      }}
      className={cn('grid gap-2', className)}
      {...props}
    >
      {options.map((option) => (
        <ToggleGroupPrimitive.Item
          key={option.value}
          value={option.value}
          data-slot="choice-tile"
          onFocus={() => {
            // Selection follows the focus moved by an arrow key.
            if (arrowKey.current) {
              arrowKey.current = false
              select(option.value)
            }
          }}
          style={
            {
              '--tile': option.color ?? 'var(--primary)',
            } as React.CSSProperties
          }
          className={cn(
            [
              'group/tile flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-1',
              'rounded-xl border-2 border-border px-1 py-2',
              'text-[15px] leading-tight font-semibold',
              'transition-colors outline-none',
              'hover:bg-muted/50',
              'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
              'disabled:pointer-events-none disabled:opacity-50',
              // Chosen: its colour's border and a light tint of it.
              'data-[state=on]:border-(--tile)',
              'data-[state=on]:bg-[color-mix(in_srgb,var(--tile)_10%,transparent)]',
              'data-[state=on]:hover:bg-[color-mix(in_srgb,var(--tile)_14%,transparent)]',
              '[&_svg]:pointer-events-none [&_svg]:size-[22px] [&_svg]:shrink-0',
            ].join(' '),
          )}
        >
          <span
            aria-hidden
            className="text-muted-foreground group-data-[state=on]/tile:text-(--tile) flex"
          >
            {option.icon}
          </span>
          <span className="w-full truncate text-center">{option.label}</span>
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export { ChoiceTiles, type ChoiceTileOption, type ChoiceTilesProps }
