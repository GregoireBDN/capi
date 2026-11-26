'use client'

import { OTPInput, OTPInputContext } from 'input-otp'
import { MinusIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type InputOTPProps = React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string
}
type InputOTPGroupProps = React.ComponentProps<'div'>
type InputOTPSlotProps = React.ComponentProps<'div'> & {
  index: number
}
type InputOTPSeparatorProps = React.ComponentProps<'div'>

/* ============================================================================
 * COMPONENTS
 * ========================================================================= */

/**
 * Input OTP (One-Time Password)
 * Root component for OTP input fields
 * Handles keyboard navigation and paste behavior automatically
 */
function InputOTP({ className, containerClassName, ...props }: InputOTPProps) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn(
        [
          // Base Class (required by input-otp library)
          'cn-input-otp',

          // Layout
          'flex items-center',

          // Disabled State
          'has-disabled:opacity-50',
        ].join(' '),
        containerClassName,
      )}
      spellCheck={false}
      className={cn('disabled:cursor-not-allowed', className)}
      {...props}
    />
  )
}

/**
 * Input OTP Group
 * Container for a group of OTP slots (usually 3-6 characters)
 * Handles validation states for the entire group
 */
function InputOTPGroup({ className, ...props }: InputOTPGroupProps) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn(
        [
          // Layout: one hollow per character, apart (#507)
          'flex items-center gap-1.5',
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
}

/**
 * Input OTP Slot
 * Individual character slot within an OTP input
 * Shows active state with ring, displays fake caret during input
 */
function InputOTPSlot({ index, className, ...props }: InputOTPSlotProps) {
  const inputOTPContext = React.useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {}

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        [
          // Layout
          'relative flex size-8 items-center justify-center',

          // The glass hollow (#507)
          'glass-field rounded-control',
          char ? 'glass-field-filled' : '',

          // Typography
          'text-sm',

          // Transitions
          'transition-all outline-none',

          // Active, then invalid (wins)
          'data-[active=true]:z-10',
          'data-[active=true]:glass-field-focus',
          'aria-invalid:glass-field-invalid',
        ].join(' '),
        className,
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      )}
    </div>
  )
}

/**
 * Input OTP Separator
 * Visual separator between OTP groups (e.g., "123 - 456")
 * Uses a minus icon by default
 */
function InputOTPSeparator({ ...props }: InputOTPSeparatorProps) {
  return (
    <div
      data-slot="input-otp-separator"
      role="separator"
      className={cn(
        [
          // Layout
          'flex items-center',

          // Icon Styling
          "[&_svg:not([class*='size-'])]:size-4",
        ].join(' '),
      )}
      {...props}
    >
      <MinusIcon />
    </div>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
  type InputOTPGroupProps,
  type InputOTPProps,
  type InputOTPSeparatorProps,
  type InputOTPSlotProps,
}
