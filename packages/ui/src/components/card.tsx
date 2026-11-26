import * as React from 'react'

import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type CardSize = 'default' | 'sm'

type CardProps = React.ComponentProps<'div'> & {
  /** Size variant of the card */
  size?: CardSize
}

type CardHeaderProps = React.ComponentProps<'div'>
type CardTitleProps = React.ComponentProps<'div'>
type CardDescriptionProps = React.ComponentProps<'div'>
type CardActionProps = React.ComponentProps<'div'>
type CardContentProps = React.ComponentProps<'div'>
type CardFooterProps = React.ComponentProps<'div'>

/* ============================================================================
 * CARD (ROOT COMPONENT)
 * ========================================================================= */

function Card({ className, size = 'default', ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        [
          // Layout
          'group/card flex flex-col overflow-hidden',

          // Spacing
          'gap-4 py-4',
          'data-[size=sm]:gap-3 data-[size=sm]:py-3',

          // Styling: a glass card (#503 « A · Givré », #508), opaque with
          // the sheen and a soft shadow, no ring or border.
          // `glass-card` spelled out, so a page can still tint the card
          // with a `bg-*` class (tailwind-merge drops `bg-card`).
          'rounded-card bg-card text-sm text-card-foreground',
          'shadow-[var(--glass-edge),var(--glass-shadow-md)]',

          // Footer spacing adjustment
          'has-data-[slot=card-footer]:pb-0',
          'data-[size=sm]:has-data-[slot=card-footer]:pb-0',

          // Image handling (first/last child)
          'has-[>img:first-child]:pt-0',
          '*:[img:first-child]:rounded-t-card',
          '*:[img:last-child]:rounded-b-card',
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
}

/* ============================================================================
 * CARD HEADER
 * ========================================================================= */

function CardHeader({ className, ...props }: CardHeaderProps) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        [
          // Container
          'group/card-header @container/card-header',

          // Layout
          'grid auto-rows-min items-start',

          // Spacing
          'gap-1 rounded-t-card px-4',
          'group-data-[size=sm]/card:px-3',

          // Grid configuration
          'has-data-[slot=card-action]:grid-cols-[1fr_auto]',
          'has-data-[slot=card-description]:grid-rows-[auto_auto]',

          // Border bottom spacing (when border-b class is applied)
          '[.border-b]:pb-4',
          'group-data-[size=sm]/card:[.border-b]:pb-3',
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
}

/* ============================================================================
 * CARD TITLE
 * ========================================================================= */

function CardTitle({ className, ...props }: CardTitleProps) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        [
          // Typography
          'font-heading text-base leading-snug font-medium',
          'group-data-[size=sm]/card:text-sm',
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
}

/* ============================================================================
 * CARD DESCRIPTION
 * ========================================================================= */

function CardDescription({ className, ...props }: CardDescriptionProps) {
  return (
    <div
      data-slot="card-description"
      className={cn(
        // Under the title and action on narrow cards, beside the title
        // (left of the action) on wide ones
        'col-span-full text-sm text-muted-foreground @md/card-header:col-span-1',
        className,
      )}
      {...props}
    />
  )
}

/* ============================================================================
 * CARD ACTION
 * ========================================================================= */

function CardAction({ className, ...props }: CardActionProps) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        [
          // Grid positioning: top-right corner of the header, beside the
          // title only on narrow cards (the description gets the width) and
          // beside the title and description on wide ones. `row-end-[-1]`
          // keeps the start line: `row-span-2` (the `grid-row` shorthand)
          // would reset it and let the description slip into the action's
          // `auto` column, squeezing the title letter by letter (#209).
          'col-start-2 row-start-1 @md/card-header:row-end-[-1]',
          'self-start justify-self-end',
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
}

/* ============================================================================
 * CARD CONTENT
 * ========================================================================= */

function CardContent({ className, ...props }: CardContentProps) {
  return (
    <div
      data-slot="card-content"
      className={cn(
        [
          // Spacing
          'px-4',
          'group-data-[size=sm]/card:px-3',

          // Room before the next block (a footer, more content). The last
          // block adds nothing: the card's own padding is the space under
          // it, the same as above the first one (#330).
          'mb-4 last:mb-0',
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
}

/* ============================================================================
 * CARD FOOTER
 * ========================================================================= */

function CardFooter({ className, ...props }: CardFooterProps) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        [
          // Layout
          'flex items-center',

          // Spacing
          'p-4',
          'group-data-[size=sm]/card:p-3',

          // Styling
          'rounded-b-card bg-muted/50',
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
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
}
