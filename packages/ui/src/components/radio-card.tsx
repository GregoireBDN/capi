'use client'

import { CheckIcon } from 'lucide-react'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import * as React from 'react'

import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type RadioCardGroupProps = React.ComponentProps<typeof RadioGroupPrimitive.Root>
type RadioCardProps = React.ComponentProps<typeof RadioGroupPrimitive.Item> & {
  /**
   * Show a check mark in the corner of the selected card (default). Turn it
   * off for compact chips, where the border and background are enough.
   */
  indicator?: boolean
}

/* ============================================================================
 * COMPONENTS
 * ========================================================================= */

/**
 * A choice between a few options shown as cards (icon, title, short text):
 * a Radix radio group, so arrow keys move between cards and one is checked.
 * Lay the cards out with grid classes, e.g. `grid-cols-2`.
 */
function RadioCardGroup({ className, ...props }: RadioCardGroupProps) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-card-group"
      className={cn('grid gap-2', className)}
      {...props}
    />
  )
}

/**
 * One option of a `RadioCardGroup`: the whole card is the radio button (at
 * least 44px high), its text content is its accessible name. A check mark
 * appears in the corner of the selected card.
 */
function RadioCard({
  className,
  children,
  indicator = true,
  ...props
}: RadioCardProps) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-card"
      className={cn(
        [
          // Grouping
          'group/radio-card',

          // Layout
          'relative flex min-h-11 w-full min-w-0 flex-col items-start gap-1',
          'p-3 text-left text-sm',

          // Styling
          'rounded-card glass-well text-card-foreground',
          'transition-[color,background-color,box-shadow]',

          // Interactivity
          'cursor-pointer outline-none hover:bg-muted/50',

          // Focus States
          'focus-visible:ring-3 focus-visible:ring-ring/50',

          // Checked States
          'data-[state=checked]:bg-primary/5',
          'data-[state=checked]:ring-2 data-[state=checked]:ring-primary',

          // Disabled States
          'disabled:cursor-not-allowed disabled:opacity-50',

          // Invalid States
          'aria-invalid:ring-2 aria-invalid:ring-destructive',

          // Icons inside the card
          '[&_svg:not([class*=size-])]:size-5',
        ].join(' '),
        // Room for the check mark in the corner.
        indicator && 'pr-8',
        className,
      )}
      {...props}
    >
      {children}
      {indicator && (
        <RadioGroupPrimitive.Indicator
          data-slot="radio-card-indicator"
          className="absolute top-2.5 right-2.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <CheckIcon className="size-3" aria-hidden />
        </RadioGroupPrimitive.Indicator>
      )}
    </RadioGroupPrimitive.Item>
  )
}

export { RadioCard, RadioCardGroup }
export type { RadioCardGroupProps, RadioCardProps }
