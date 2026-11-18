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

interface PeriodStepperStep {
  /** Accessible name ("Mois précédent"). */
  label: string
  onClick: () => void
  disabled?: boolean
  /** `aria-keyshortcuts` (e.g. "ArrowLeft"). */
  keyShortcuts?: string
}

type PeriodStepperProps = Omit<React.ComponentProps<'div'>, 'children'> & {
  previous: PeriodStepperStep
  next: PeriodStepperStep
  /** The middle segment, usually a `PeriodStepperLabel`. */
  children: React.ReactNode
}

type PeriodStepperLabelProps = Omit<
  React.ComponentProps<'button'>,
  'children'
> & {
  /** The period shown ("Octobre 2026"). */
  text: string
  /** Shown instead of `text` in containers under 320px ("oct. 2026"). */
  shortText?: string
  /**
   * Every value `text` can take (e.g. the twelve months of the year): the
   * label keeps the widest one's width, so the arrows stay in place.
   */
  sizers?: readonly string[]
  /** Same for `shortText`. */
  shortSizers?: readonly string[]
}

/* ============================================================================
 * STYLES
 * ========================================================================= */

/** A segment of the box: square inside, 44px high with the border. */
const SEGMENT =
  'h-auto min-h-[calc(2rem-2px)] rounded-none border-0 py-0 focus-visible:z-10'

/* ============================================================================
 * COMPONENTS
 * ========================================================================= */

/**
 * The label, at least as wide as its widest `sizers`: they are stacked in
 * the same grid cell and drawn invisibly by `::before` from an attribute, so
 * they add no text for assistive technologies or queries.
 */
function SizedText({
  text,
  sizers = [],
  className,
}: {
  text: string
  sizers?: readonly string[]
  className?: string
}) {
  return (
    <span className={cn('min-w-0 grid-cols-1 text-center', className)}>
      {sizers.map((sizer) => (
        <span
          key={sizer}
          aria-hidden
          data-sizer={sizer}
          className="invisible col-start-1 row-start-1 whitespace-nowrap before:content-[attr(data-sizer)]"
        />
      ))}
      <span className="col-start-1 row-start-1 truncate">{text}</span>
    </span>
  )
}

/**
 * One box ‹ | period | ›, 44px high, as wide as its content at every width
 * (never stretched across the row). `PeriodStepperLabel` switches to its
 * short text when its container (put it in a `@container`) is under 320px;
 * px rather than rem: with the app's 22px root, a container `rem` is about
 * 1.4× the usual one.
 */
function PeriodStepper({
  previous,
  next,
  children,
  className,
  ...props
}: PeriodStepperProps) {
  return (
    <div
      data-slot="period-stepper"
      role="group"
      className={cn(
        'bg-card flex w-fit max-w-full items-stretch rounded-lg border shadow-xs',
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
        className={cn(SEGMENT, 'rounded-s-[calc(var(--radius-lg)-1px)]')}
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
        className={cn(SEGMENT, 'rounded-e-[calc(var(--radius-lg)-1px)]')}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  )
}

/**
 * The middle segment of a `PeriodStepper`: the period's name and a ⌄ (from
 * 320px), touching the arrows through the box's dividers. It is a button, so
 * it can open a picker (`PopoverTrigger asChild`).
 */
function PeriodStepperLabel({
  text,
  shortText,
  sizers,
  shortSizers,
  className,
  ...props
}: PeriodStepperLabelProps) {
  return (
    <Button
      data-slot="period-stepper-label"
      variant="secondary"
      ghost
      className={cn(
        SEGMENT,
        'border-border text-foreground min-w-0 gap-1 border-x px-2.5 text-base font-semibold',
        className,
      )}
      {...props}
    >
      <span aria-live="polite" className="min-w-0">
        <SizedText
          text={text}
          sizers={sizers}
          className="hidden @[320px]:grid"
        />
        <SizedText
          text={shortText ?? text}
          sizers={shortText === undefined ? sizers : shortSizers}
          className="grid @[320px]:hidden"
        />
      </span>
      <ChevronDownIcon
        aria-hidden
        className="hidden opacity-60 @[320px]:block"
      />
    </Button>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export {
  PeriodStepper,
  PeriodStepperLabel,
  type PeriodStepperLabelProps,
  type PeriodStepperProps,
  type PeriodStepperStep,
}
