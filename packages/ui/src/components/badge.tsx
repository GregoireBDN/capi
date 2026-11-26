import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import * as React from 'react'

import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type SemanticVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
type VisualStyle = 'solid' | 'outline'

type BadgeProps = React.ComponentProps<'span'> &
  VariantProps<typeof badgeBase> & {
    /** Semantic variant - defines the intent/meaning of the badge */
    variant?: SemanticVariant
    /** Visual style modifiers (priority:  ghost > outline > solid) */
    outline?: boolean
    /** Render as a different component using Radix Slot */
    asChild?: boolean
  }

/* ============================================================================
 * BASE STYLES (CVA)
 * ========================================================================= */

const badgeBase = cva(
  [
    // Layout & Display
    'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center',

    // Spacing
    'gap-1 px-2 py-0.5',

    // Styling
    'overflow-hidden rounded-4xl border border-transparent',

    // Typography
    'text-xs font-medium whitespace-nowrap',

    // Transitions
    'transition-all',

    // Focus States
    'focus-visible:ring-[3px] focus-visible:ring-ring/85',

    // Icon padding adjustments
    'has-data-[icon=inline-end]:pr-1.5',
    'has-data-[icon=inline-start]:pl-1.5',

    // Invalid States (Light)
    'aria-invalid:border-destructive aria-invalid:ring-destructive/20',

    // Invalid States (Dark)
    'dark:aria-invalid:ring-destructive/40',

    // Icon Styling
    '[&>svg]:pointer-events-none [&>svg]:size-3!',
  ].join(' '),
)

/* ============================================================================
 * VARIANT STYLES
 * Each visual style (solid, outline, ghost) has styles for each
 * semantic variant (primary, secondary, success, warning, danger, info)
 * ========================================================================= */

// Solid (filled background)
const solidStyles: Record<SemanticVariant, string> = {
  primary: [
    'bg-primary text-primary-foreground',
    '[a]:hover:bg-primary/80',
  ].join(' '),

  secondary: [
    'bg-secondary text-secondary-foreground',
    '[a]:hover:bg-secondary/80',
  ].join(' '),

  success: [
    'bg-success text-success-foreground',
    '[a]:hover:bg-success/80',
  ].join(' '),

  warning: [
    'bg-warning text-warning-foreground',
    '[a]:hover:bg-warning/80',
  ].join(' '),

  danger: [
    'bg-destructive text-destructive-foreground',
    '[a]:hover:bg-destructive/80',
  ].join(' '),

  info: ['bg-info text-info-foreground', '[a]:hover:bg-info/80'].join(' '),
}

// Outline, in glass (#506): no border, a faint fill of the intent's colour,
// the label in that colour (secondary: the glass fill)
const outlineStyles: Record<SemanticVariant, string> = {
  primary: [
    'bg-primary/8 text-[oklch(from_var(--primary)_calc(l-0.06)_c_h)] dark:text-primary',
    '[a]:hover:bg-primary/12',
  ].join(' '),
  secondary: [
    'bg-glass-fill text-foreground',
    '[a]:hover:bg-foreground/10',
  ].join(' '),
  success: [
    'bg-success/15 text-success-foreground',
    '[a]:hover:bg-success/20',
    'dark:text-success',
  ].join(' '),
  warning: [
    'bg-warning/15 text-warning-foreground',
    '[a]:hover:bg-warning/20',
    'dark:text-warning',
  ].join(' '),
  danger: [
    'bg-destructive/8 text-destructive',
    '[a]:hover:bg-destructive/15',
  ].join(' '),
  info: [
    'bg-info/15 text-info-foreground',
    '[a]:hover:bg-info/20',
    'dark:text-info',
  ].join(' '),
}

/* ============================================================================
 * HELPER FUNCTIONS
 * ========================================================================= */

/**
 * Get the appropriate style classes based on variant and visual style
 */
function getVariantClasses(
  variant: SemanticVariant,
  visualStyle: VisualStyle,
): string {
  switch (visualStyle) {
    case 'outline':
      return outlineStyles[variant]
    case 'solid':
    default:
      return solidStyles[variant]
  }
}

/**
 * Determine visual style based on boolean props
 * Priority: ghost > outline > solid (default)
 */
function getVisualStyle(outline: boolean): VisualStyle {
  if (outline) return 'outline'
  return 'solid'
}

/* ============================================================================
 * COMPONENT
 * ========================================================================= */

function Badge({
  className,
  variant = 'primary',
  outline = false,
  asChild = false,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot.Root : 'span'

  const visualStyle = getVisualStyle(outline)
  const variantClasses = getVariantClasses(variant, visualStyle)

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      data-visual-style={visualStyle}
      className={cn(badgeBase(), variantClasses, className)}
      {...props}
    />
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export {
  Badge,
  badgeBase,
  type BadgeProps,
  type SemanticVariant as BadgeVariant,
  type VisualStyle as BadgeVisualStyle,
}
