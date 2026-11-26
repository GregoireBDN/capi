import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import * as React from 'react'

import { Spinner } from './spinner'
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
type VisualStyle = 'solid' | 'outline' | 'ghost' | 'link'
type ButtonSize = 'xs' | 'sm' | 'default' | 'lg' | 'xl'

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonBase> & {
    /** Semantic variant - defines the intent/meaning of the button */
    variant?: SemanticVariant
    /** Visual style modifiers (priority: link > ghost > outline > solid) */
    outline?: boolean
    ghost?: boolean
    link?: boolean
    /** Icon configuration */
    iconStart?: React.ReactNode
    iconEnd?: React.ReactNode
    iconOnly?: boolean
    /** Loading state - shows spinner and disables button */
    loading?: boolean
    /** Full width button */
    fullWidth?: boolean
    /** Pill-shaped button (fully rounded) */
    pill?: boolean
    /** Render as a different component using Radix Slot */
    asChild?: boolean
  }

/* ============================================================================
 * BASE STYLES (CVA)
 * ========================================================================= */

const buttonBase = cva(
  [
    // Layout & Display
    'group/button relative inline-flex shrink-0 items-center justify-center',

    // Touch screens: at least a 44×44 px hit area, whatever the size
    'pointer-coarse:touch-hitbox',

    // Shape: the glass controls' radius (#506); no border, depth comes from
    // a fill and a shadow (recipe « A · Givré », #503)
    'rounded-control border border-transparent bg-clip-padding',

    // Typography: one line, but a label wider than its container wraps
    // (centred) instead of overflowing it (narrow phones, 22px root)
    'text-sm font-medium text-center text-balance max-w-full',

    // Transitions & Interactivity
    'transition-all outline-none select-none',

    // Focus States: a soft glow, still ≥ 3:1 against the page
    'focus-visible:ring-3 focus-visible:ring-ring/85',

    // Active States: pressed in, the glass shadow drops
    'active:not-aria-[haspopup]:translate-y-px active:not-aria-[haspopup]:shadow-none',

    // Disabled States
    'disabled:pointer-events-none disabled:opacity-50',

    // Invalid States (Light)
    'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',

    // Invalid States (Dark)
    'dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',

    // Icon Styling
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      size: {
        xs: [
          'min-h-6 gap-1 px-2 py-0.5 text-xs',
          'rounded-[min(var(--radius-control),10px)]',
          'in-data-[slot=button-group]:rounded-control',
          '[&_svg]:size-3',
        ].join(' '),

        sm: [
          'min-h-7 gap-1 px-2.5 py-0.5 text-[0.8rem]',
          'rounded-[min(var(--radius-control),12px)]',
          'in-data-[slot=button-group]:rounded-control',
          '[&_svg]:size-3.5',
        ].join(' '),

        default: ['min-h-8 gap-1.5 px-2.5 py-1', '[&_svg]:size-4'].join(' '),

        lg: ['min-h-9 gap-1.5 px-2.5 py-1 font-medium', '[&_svg]:size-4'].join(
          ' ',
        ),
        xl: ['min-h-12 gap-2 px-4 py-1.5 font-medium', '[&_svg]:size-6'].join(
          ' ',
        ),
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
)

/* ============================================================================
 * VARIANT STYLES
 * Each visual style (solid, outline, ghost, link) has styles for each
 * semantic variant (primary, secondary, success, warning, danger, info)
 * ========================================================================= */

// Solid: a sheen on top and a soft shadow in the button's own colour (#506)
const solidStyles: Record<SemanticVariant, string> = {
  primary: [
    'bg-primary text-primary-foreground glass-solid [--glass-tint:var(--primary)]',
    'hover:bg-primary/90',
    'aria-expanded:bg-primary/90',
  ].join(' '),

  // A glass fill, no border, no shadow: the same as `outline` (#506)
  secondary: [
    'bg-glass-fill text-foreground',
    'hover:bg-foreground/10',
    'aria-expanded:bg-foreground/10',
    'active:bg-foreground/12',
  ].join(' '),

  success: [
    'bg-success text-success-foreground glass-solid [--glass-tint:var(--success)]',
    'hover:bg-success/90',
    'aria-expanded:bg-success/90',
  ].join(' '),

  warning: [
    'bg-warning text-warning-foreground glass-solid [--glass-tint:var(--warning)]',
    'hover:bg-warning/90',
    'aria-expanded:bg-warning/90',
  ].join(' '),

  danger: [
    'bg-destructive text-destructive-foreground glass-solid [--glass-tint:var(--destructive)]',
    'hover:bg-destructive/90',
    'aria-expanded:bg-destructive/90',
  ].join(' '),

  info: [
    'bg-info text-info-foreground glass-solid [--glass-tint:var(--info)]',
    'hover:bg-info/90',
    'aria-expanded:bg-info/90',
  ].join(' '),
}

// Outline, in glass (#506, « Voile »): no border any more, a faint fill of
// the intent's colour (secondary: the glass fill), the label in that colour.
const outlineStyles: Record<SemanticVariant, string> = {
  primary: [
    'bg-primary/8 text-[oklch(from_var(--primary)_calc(l-0.06)_c_h)] dark:text-primary',
    'hover:bg-primary/12',
    'aria-expanded:bg-primary/15',
    'active:bg-primary/20',
  ].join(' '),

  secondary: [
    'bg-glass-fill text-foreground',
    'hover:bg-foreground/10',
    'aria-expanded:bg-foreground/10',
    'active:bg-foreground/12',
  ].join(' '),

  success: [
    'bg-success/15 text-success-foreground',
    'hover:bg-success/20',
    'aria-expanded:bg-success/20',
    'active:bg-success/25',
    'dark:text-success',
  ].join(' '),

  warning: [
    'bg-warning/15 text-warning-foreground',
    'hover:bg-warning/20',
    'aria-expanded:bg-warning/20',
    'active:bg-warning/25',
    'dark:text-warning',
  ].join(' '),

  danger: [
    'bg-destructive/8 text-destructive',
    'hover:bg-destructive/12',
    'aria-expanded:bg-destructive/15',
    'active:bg-destructive/20',
  ].join(' '),

  info: [
    'bg-info/15 text-info-foreground',
    'hover:bg-info/20',
    'aria-expanded:bg-info/20',
    'active:bg-info/25',
    'dark:text-info',
  ].join(' '),
}

// Ghost (text only, the glass fill on hover). Light intents (success,
// warning, info) use their dark shade on a light page, to stay ≥ 4.5:1.
const ghostStyles: Record<SemanticVariant, string> = {
  primary: [
    'text-primary',
    'hover:bg-primary/10',
    'aria-expanded:bg-primary/10',
  ].join(' '),

  secondary: [
    'text-muted-foreground',
    'hover:bg-glass-fill hover:text-foreground',
    'aria-expanded:bg-glass-fill aria-expanded:text-foreground',
    'active:bg-foreground/10',
  ].join(' '),

  success: [
    'text-success-foreground dark:text-success',
    'hover:bg-success/15',
    'aria-expanded:bg-success/15',
  ].join(' '),

  warning: [
    'text-warning-foreground dark:text-warning',
    'hover:bg-warning/15',
    'aria-expanded:bg-warning/15',
  ].join(' '),

  danger: [
    'text-destructive',
    'hover:bg-destructive/10',
    'aria-expanded:bg-destructive/10',
  ].join(' '),

  info: [
    'text-info-foreground dark:text-info',
    'hover:bg-info/15',
    'aria-expanded:bg-info/15',
  ].join(' '),
}

// Link (text with underline on hover)
const linkStyles: Record<SemanticVariant, string> = {
  primary: 'text-primary underline-offset-4 hover:underline',
  secondary:
    'text-muted-foreground underline-offset-4 hover:underline hover:text-foreground',
  success:
    'text-success-foreground dark:text-success underline-offset-4 hover:underline',
  warning:
    'text-warning-foreground dark:text-warning underline-offset-4 hover:underline',
  danger: 'text-destructive underline-offset-4 hover:underline',
  info: 'text-info-foreground dark:text-info underline-offset-4 hover:underline',
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
    case 'ghost':
      return ghostStyles[variant]
    case 'link':
      return linkStyles[variant]
    case 'solid':
    default:
      return solidStyles[variant]
  }
}

/**
 * Calculate dynamic padding based on icon configuration
 * - Icon-only buttons become square with no padding
 * - Buttons with icons have reduced padding on the icon side
 */
function getIconPaddingClasses(
  size: ButtonSize | null | undefined,
  iconOnly: boolean,
  iconStart?: React.ReactNode,
  iconEnd?: React.ReactNode,
): string {
  const currentSize = size || 'default'

  // Icon-only: a round button (#506)
  if (iconOnly) {
    const sizes: Record<ButtonSize, string> = {
      xs: 'size-6 p-0 rounded-full',
      sm: 'size-7 p-0 rounded-full',
      default: 'size-8 p-0 rounded-full',
      lg: 'size-9 p-0 rounded-full',
      xl: 'size-12 p-0 rounded-full',
    }
    return sizes[currentSize]
  }

  // Icon on left: reduce left padding
  if (iconStart && !iconEnd) {
    return currentSize === 'xs' || currentSize === 'sm' ? 'pl-1.5' : 'pl-2'
  }

  // Icon on right: reduce right padding
  if (!iconStart && iconEnd) {
    return currentSize === 'xs' || currentSize === 'sm' ? 'pr-1.5' : 'pr-2'
  }

  // Icons on both sides: reduce both paddings
  if (iconStart && iconEnd) {
    return currentSize === 'xs' || currentSize === 'sm' ? 'px-1.5' : 'px-2'
  }

  // No icons: use default padding from buttonBase
  return ''
}

/**
 * Determine visual style based on boolean props
 * Priority: link > ghost > outline > solid (default)
 */
function getVisualStyle(
  outline: boolean,
  ghost: boolean,
  link: boolean,
): VisualStyle {
  if (link) return 'link'
  if (ghost) return 'ghost'
  if (outline) return 'outline'
  return 'solid'
}

/* ============================================================================
 * COMPONENT
 * ========================================================================= */

function Button({
  className,
  variant = 'primary',
  size = 'default',
  outline = false,
  ghost = false,
  link = false,
  iconStart,
  iconEnd,
  iconOnly = false,
  loading = false,
  fullWidth = false,
  pill = false,
  asChild = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'

  const visualStyle = getVisualStyle(outline, ghost, link)
  const variantClasses = getVariantClasses(variant, visualStyle)
  const paddingClasses = getIconPaddingClasses(
    size,
    iconOnly,
    iconStart,
    iconEnd,
  )

  // Additional utility classes
  const utilityClasses = cn(fullWidth && 'w-full', pill && 'rounded-full')

  // When loading, replace iconStart with spinner (or add it if no iconStart)
  const displayIconStart = loading ? <Spinner /> : iconStart

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-visual-style={visualStyle}
      data-size={size}
      disabled={disabled || loading}
      className={cn(
        buttonBase({ size }),
        variantClasses,
        paddingClasses,
        utilityClasses,
        className,
      )}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {displayIconStart && (
            <span className="inline-flex">{displayIconStart}</span>
          )}
          {children}
          {iconEnd && <span className="inline-flex">{iconEnd}</span>}
        </>
      )}
    </Comp>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export {
  Button,
  buttonBase,
  getVariantClasses,
  getVisualStyle,
  type ButtonProps,
  type ButtonSize,
  type SemanticVariant as ButtonVariant,
  type VisualStyle as ButtonVisualStyle,
}
