'use client'

import { Switch as SwitchPrimitive } from 'radix-ui'
import * as React from 'react'

import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type SwitchSize = 'sm' | 'default'

type SwitchProps = React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: SwitchSize
}

/* ============================================================================
 * COMPONENT
 * ========================================================================= */

/**
 * Switch
 * Toggle switch for boolean input
 * Built on Radix UI Switch - supports two sizes (sm, default)
 */
function Switch({ className, size = 'default', ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        [
          // Grouping & Peering
          'peer group/switch',

          // Layout
          'relative inline-flex shrink-0 items-center',

          // Styling: a glass hollow track (#507)
          'rounded-full',

          // Transitions
          'transition-all outline-none',

          // Expanded clickable area
          'touch-hitbox',

          // Focus and invalid States: the fields' glow
          'focus-visible:shadow-(--glass-focus)',
          'aria-invalid:shadow-(--glass-invalid)',

          // Size: Default
          'data-[size=default]:h-[18.4px]',
          'data-[size=default]:w-[32px]',

          // Size: Small
          'data-[size=sm]:h-[14px]',
          'data-[size=sm]:w-[24px]',

          // Checked State
          'data-[state=checked]:bg-primary',
          'data-[state=checked]:not-focus-visible:not-aria-invalid:shadow-glass-primary',

          // Unchecked State: a hollow
          'data-[state=unchecked]:bg-foreground/14',
          'data-[state=unchecked]:not-focus-visible:not-aria-invalid:shadow-(--glass-field-inset)',

          // Disabled State
          'data-[disabled]:cursor-not-allowed',
          'data-[disabled]:opacity-50',
        ].join(' '),
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          [
            // Layout
            'block',

            // Interactivity
            'pointer-events-none',

            // Styling
            'rounded-full bg-white shadow-[0_1px_3px_rgb(15_23_42/30%),0_0_0_0.5px_rgb(15_23_42/8%)]',

            // Transitions
            'transition-transform',

            // Size: Default
            'group-data-[size=default]/switch:size-3.5',

            // Size: Small
            'group-data-[size=sm]/switch:size-2.5',

            // Checked - Default Size
            'group-data-[size=default]/switch:data-[state=checked]:translate-x-[15px]',

            // Checked - Small Size
            'group-data-[size=sm]/switch:data-[state=checked]:translate-x-[11px]',

            // Unchecked - Default Size
            'group-data-[size=default]/switch:data-[state=unchecked]:-translate-x-[1px]',

            // Unchecked - Small Size
            'group-data-[size=sm]/switch:data-[state=unchecked]:-translate-x-[1px]',
          ].join(' '),
        )}
      />
    </SwitchPrimitive.Root>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export { Switch, type SwitchProps, type SwitchSize }
