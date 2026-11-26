'use client'

import { CheckIcon } from 'lucide-react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import * as React from 'react'

import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type CheckboxProps = React.ComponentProps<typeof CheckboxPrimitive.Root>

/* ============================================================================
 * CHECKBOX (ROOT COMPONENT)
 * ========================================================================= */

function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        [
          // Peer marker for label states
          'peer relative',

          // Layout
          'flex size-4 shrink-0 items-center justify-center',

          // Styling: a small glass box, its edge drawn inside (#507)
          'rounded-[5px] bg-card',
          'shadow-[inset_0_0_0_1.5px_oklch(from_var(--foreground)_l_c_h/35%)]',

          // Transitions
          'transition-[background-color,box-shadow] outline-none',

          // Click area expansion
          'touch-hitbox',

          // Focus states: the fields' glow
          'focus-visible:shadow-(--glass-focus)',

          // Disabled states
          'disabled:cursor-not-allowed disabled:opacity-50',
          'group-has-disabled/field:opacity-50',

          // Checked states
          'data-[state=checked]:bg-primary',
          'data-[state=checked]:text-primary-foreground',
          'data-[state=checked]:shadow-glass-primary',
          'data-[state=checked]:focus-visible:shadow-(--glass-focus)',

          // Invalid states (win)
          'aria-invalid:shadow-(--glass-invalid)',
        ].join(' '),
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className={cn(
          [
            // Layout
            'grid place-content-center',

            // Text
            'text-current',

            // Transitions
            'transition-none',

            // Icon sizing
            '[&>svg]:size-3.5',
          ].join(' '),
        )}
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export { Checkbox, type CheckboxProps }
