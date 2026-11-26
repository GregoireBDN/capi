import {
  CalendarDaysIcon,
  CheckIcon,
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

/** How far the period's data goes, drawn by its gauge. */
type PeriodBarStatusTone = 'partial' | 'complete' | 'closed' | 'empty'

type PeriodBarStatusProps = Omit<React.ComponentProps<'div'>, 'children'> & {
  tone: PeriodBarStatusTone
  /** "Données jusqu’au 16 nov. · comparées au 1–16 oct.", "le 3 oct." */
  text: string
  /** Shown instead of `text` when the state is under 400px wide ("Jusqu’au 16 nov."). */
  shortText?: string
  /** Part of the period known, 0 to 1 (`partial` only: the others are full or empty). */
  progress?: number
}

/* ============================================================================
 * STYLES
 * ========================================================================= */

/** The period's button (#505, the owner's « barre d'outils + état »): a
 * raised white piece with the sheen and a small shadow, like a segmented
 * control's thumb. */
const PIECE = cn(
  'bg-card text-foreground shadow-[var(--glass-edge),var(--glass-shadow-sm)] hover:bg-card',
  'dark:bg-[oklch(from_var(--card)_calc(l+0.08)_c_h)] dark:hover:bg-[oklch(from_var(--card)_calc(l+0.08)_c_h)]',
)

/** A round arrow on a grey disc, 44px to the touch. */
const ARROW = cn(
  'bg-glass-fill hover:bg-foreground/10 text-foreground size-[calc(2rem-8px)] min-h-0 min-w-0 shrink-0 rounded-full bg-clip-border pointer-coarse:touch-hitbox [&_svg]:size-[1.1rem]',
  'disabled:opacity-45',
)

/* ============================================================================
 * COMPONENTS
 * ========================================================================= */

/**
 * The period of a page, part of the app's frame (#401, the owner's « B.
 * Barre du mois », then « barre d'outils + état », #505): ‹ · 📅 period ⌄ ·
 * ›. The arrows are round buttons on a grey disc, so they read as buttons
 * (the owner, 20 Nov); the period is a raised white button that opens a
 * picker. Between the period and › a `PeriodBarStatus` can say how far its
 * data goes (the app shows it on a computer only). The app lays it on a
 * white toolbar at the top of the page, fixed under its header.
 * `PeriodBarLabel` switches to its short text when its container (put the
 * bar in a `@container`) is under 300px.
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
        // As wide as its container (#505): ‹ · the period (and its state) · ›,
        // laid on the app's white toolbar.
        'flex w-full min-w-0 items-center gap-1.5',
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
 * The middle of a `PeriodBar`: a calendar, the period's name and a ⌄,
 * filling the space between the arrows (the calendar says what a tap opens,
 * #401; the ⌄ that it opens a list, #505). It is a button, so it can open a
 * picker (`PopoverTrigger asChild`).
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
        'h-[calc(2rem-8px)] min-h-0 min-w-0 flex-1 gap-1.5 rounded-full px-3 text-base font-semibold',
        className,
      )}
      {...props}
    >
      {/* Only where there is room: on a phone the ⌄ says it opens a list. */}
      <CalendarDaysIcon
        aria-hidden
        className="text-muted-foreground hidden size-[1.1rem]! shrink-0 @[400px]:block"
      />
      <span aria-live="polite" className="min-w-0 truncate">
        <span className={shortText ? 'hidden @[300px]:inline' : undefined}>
          {text}
        </span>
        {shortText && <span className="@[300px]:hidden">{shortText}</span>}
      </span>
      <ChevronDownIcon
        aria-hidden
        className="text-muted-foreground size-[0.9rem]! shrink-0"
      />
    </Button>
  )
}

const GAUGE: Record<PeriodBarStatusTone, string> = {
  partial: 'bg-primary',
  complete: 'bg-emerald-600 dark:bg-emerald-500',
  closed: 'bg-emerald-600 dark:bg-emerald-500',
  empty: 'bg-transparent',
}

/**
 * How far a period's data goes, between its name and › (#505, the owner's
 * « barre d'outils + état »): one line of text above a thin gauge, blue and
 * as long as the days known while the period is partial, full and green
 * once it is complete, « ✓ Clôturé » before the text once it is closed,
 * empty without data.
 */
function PeriodBarStatus({
  tone,
  text,
  shortText,
  progress,
  className,
  ...props
}: PeriodBarStatusProps) {
  const filled =
    tone === 'partial'
      ? Math.min(1, Math.max(0, progress ?? 0))
      : tone === 'empty'
        ? 0
        : 1
  return (
    <div
      data-slot="period-bar-status"
      data-tone={tone}
      // The whole text on hover when it is cut or shortened.
      title={text}
      className={cn(
        '@container/status flex min-w-0 flex-1 flex-col justify-center gap-1 px-2',
        className,
      )}
      {...props}
    >
      <p className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
        {tone === 'closed' && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckIcon aria-hidden className="size-3.5" />
            Clôturé
          </span>
        )}
        <span className="min-w-0 truncate">
          <span
            className={shortText ? 'hidden @[400px]/status:inline' : undefined}
          >
            {text}
          </span>
          {shortText && (
            <span className="@[400px]/status:hidden">{shortText}</span>
          )}
        </span>
      </p>
      <div
        aria-hidden
        className="bg-glass-fill h-1.5 overflow-hidden rounded-full"
      >
        <div
          className={cn('h-full rounded-full', GAUGE[tone])}
          style={{ width: `${filled * 100}%` }}
        />
      </div>
    </div>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export {
  PeriodBar,
  PeriodBarLabel,
  PeriodBarStatus,
  type PeriodBarLabelProps,
  type PeriodBarProps,
  type PeriodBarStatusProps,
  type PeriodBarStatusTone,
  type PeriodBarStep,
}
