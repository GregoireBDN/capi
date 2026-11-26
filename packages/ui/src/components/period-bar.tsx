import {
  CalendarDaysIcon,
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
 * STYLES
 * ========================================================================= */

/** A raised white piece of the pill (#505, the owner's « C2 · Tout en
 * blanc »): the card with the sheen and a small shadow, like a segmented
 * control's thumb. */
const PIECE = cn(
  'bg-card text-foreground shadow-[var(--glass-edge),var(--glass-shadow-sm)] hover:bg-card',
  'dark:bg-[oklch(from_var(--card)_calc(l+0.06)_c_h)]',
)

/** A round arrow, 44px to the touch. */
const ARROW = cn(
  PIECE,
  'size-[calc(2rem-8px)] min-w-0 shrink-0 rounded-full pointer-coarse:touch-hitbox [&_svg]:size-[1.1rem]',
  'disabled:opacity-45 disabled:shadow-none',
)

/* ============================================================================
 * COMPONENTS
 * ========================================================================= */

/**
 * The period of a page, part of the app's frame (#401, the owner's « B.
 * Barre du mois »): ‹ · 📅 period · ›, flat, no box. The arrows are round
 * buttons on a grey disc, so they read as buttons (the owner, 20 Nov). In a
 * narrow container (a phone) the bar fills it, the period centred between
 * the arrows; from 640px of container (a computer) the arrows stay beside
 * the period, one group in the middle, the period as wide whatever its
 * name so the arrows never move. The app puts it in a bar at the top of the
 * page, fixed under its header. `PeriodBarLabel` switches to its short
 * text when its container (put the bar in a `@container`) is under 300px.
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
      className={cn(
        // One pill as wide as its container (#505): a glass track holding
        // ‹ · the period · ›, three raised white pieces.
        'bg-glass-fill flex w-full min-w-0 items-center gap-1 rounded-full p-1',
        className,
      )}
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
        className={ARROW}
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
        className={ARROW}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  )
}

/**
 * The middle of a `PeriodBar`: a calendar, then the period's name, filling
 * the space between the arrows (the calendar says what a tap opens: the
 * owner's « A. Icône calendrier », #401, rather than a ⌄). It is a button,
 * so it can open a picker (`PopoverTrigger asChild`).
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
        PIECE,
        'h-[calc(2rem-8px)] min-w-0 flex-1 gap-1.5 rounded-full px-2 text-base font-semibold',
        className,
      )}
      {...props}
    >
      <CalendarDaysIcon
        aria-hidden
        className="text-muted-foreground size-[1.1rem]! shrink-0"
      />
      <span aria-live="polite" className="min-w-0 truncate">
        <span className={shortText ? 'hidden @[300px]:inline' : undefined}>
          {text}
        </span>
        {shortText && <span className="@[300px]:hidden">{shortText}</span>}
      </span>
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
