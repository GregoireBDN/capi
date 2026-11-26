'use client'

import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import * as React from 'react'

import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type RadioGroupProps = React.ComponentProps<typeof RadioGroupPrimitive.Root>
type RadioGroupItemProps = React.ComponentProps<typeof RadioGroupPrimitive.Item>

/* ============================================================================
 * COMPONENTS
 * ========================================================================= */

/**
 * Radio Group
 * Container for radio button options
 * Built on Radix UI RadioGroup - ensures only one option is selected
 */
function RadioGroup({ className, ...props }: RadioGroupProps) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn(
        [
          // Layout
          'grid w-full gap-2',
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
}

/**
 * Radio Group Item
 * Individual radio button with custom styling
 * Shows checked state with filled circle indicator
 */
function RadioGroupItem({ className, ...props }: RadioGroupItemProps) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        [
          // Grouping & Peering
          'group/radio-group-item peer',

          // Layout
          'relative flex aspect-square size-4 shrink-0',

          // Styling: a small glass disc, its edge drawn inside (#507)
          'rounded-full bg-card',
          'shadow-[inset_0_0_0_1.5px_oklch(from_var(--foreground)_l_c_h/35%)]',
          'transition-[background-color,box-shadow]',

          // Interactivity
          'outline-none',

          // Expanded clickable area
          'touch-hitbox',

          // Focus States: the fields' glow
          'focus-visible:shadow-(--glass-focus)',

          // Disabled States
          'disabled:cursor-not-allowed',
          'disabled:opacity-50',

          // Checked States
          'data-[state=checked]:bg-primary',
          'data-[state=checked]:text-primary-foreground',
          'data-[state=checked]:shadow-glass-primary',
          'data-[state=checked]:focus-visible:shadow-(--glass-focus)',

          // Invalid States (win)
          'aria-invalid:shadow-(--glass-invalid)',
        ].join(' '),
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-4 items-center justify-center"
      >
        <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export {
  RadioGroup,
  RadioGroupItem,
  type RadioGroupItemProps,
  type RadioGroupProps,
}
