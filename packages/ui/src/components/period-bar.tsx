import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react'
import * as React from 'react'

import { Button } from './button'
import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

interface PeriodBarStep {
  /** Accessible name ("Mois précédent"). */
  label: string
  onClick: () => void
  disabled?: boolean
  /** `aria-keyshortcuts` (e.g. "ArrowLeft"). */
  keyShortcuts?: string
}

type PeriodBarProps = Omit<React.ComponentProps<'div'>, 'children'> & {
  previous: PeriodBarStep
  next: PeriodBarStep
  /** The middle, usually a `PeriodBarLabel`. */
  children: React.ReactNode
}

type PeriodBarLabelProps = Omit<React.ComponentProps<'button'>, 'children'> & {
  /** The period shown ("Novembre 2026"). */
  text: string
  /** Shown instead of `text` in containers under 300px ("nov. 2026"). */
  shortText?: string
}

/* ============================================================================
 * COMPONENTS
 * ========================================================================= */

/**
 * The period of a page, part of the app's frame (#401, the owner's « B.
 * Barre du mois »): ‹ · period ⌄ · ›, flat, no box. It fills its container,
 * the period centred between two 44px arrows, so the arrows never move;
 * the app puts it in a bar under its header on phones and in the header
 * itself on a computer. `PeriodBarLabel` switches to its short text when
 * its container (put the bar in a `@container`) is under 300px.
 */
function PeriodBar({
  previous,
  next,
  children,
  className,
  ...props
}: PeriodBarProps) {
  return (
    <div
      data-slot="period-bar"
      role="group"
      className={cn('flex w-full min-w-0 items-center', className)}
      {...props}
    >
      <Button
        variant="secondary"
        ghost
        iconOnly
        aria-label={previous.label}
        aria-keyshortcuts={previous.keyShortcuts}
        disabled={previous.disabled}
        onClick={previous.onClick}
        className="shrink-0 [&_svg]:size-[1.1rem]"
      >
        <ChevronLeftIcon />
      </Button>
      {children}
      <Button
        variant="secondary"
        ghost
        iconOnly
        aria-label={next.label}
        aria-keyshortcuts={next.keyShortcuts}
        disabled={next.disabled}
        onClick={next.onClick}
        className="shrink-0 [&_svg]:size-[1.1rem]"
      >
        <ChevronRightIcon />
      </Button>
    </div>
  )
}

/**
 * The middle of a `PeriodBar`: the period's name and a ⌄, filling the space
 * between the arrows. It is a button, so it can open a picker
 * (`PopoverTrigger asChild`).
 */
function PeriodBarLabel({
  text,
  shortText,
  className,
  ...props
}: PeriodBarLabelProps) {
  return (
    <Button
      data-slot="period-bar-label"
      variant="secondary"
      ghost
      className={cn(
        'text-foreground min-w-0 flex-1 gap-1 px-1 text-base font-semibold',
        className,
      )}
      {...props}
    >
      <span aria-live="polite" className="min-w-0 truncate">
        <span className={shortText ? 'hidden @[300px]:inline' : undefined}>
          {text}
        </span>
        {shortText && <span className="@[300px]:hidden">{shortText}</span>}
      </span>
      <ChevronDownIcon
        aria-hidden
        className="text-muted-foreground size-4 shrink-0"
      />
    </Button>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export {
  PeriodBar,
  PeriodBarLabel,
  type PeriodBarLabelProps,
  type PeriodBarProps,
  type PeriodBarStep,
}
