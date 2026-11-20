import * as React from 'react'

import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

interface SheetStep {
  /** Identifies the step (given back to `onSelect`). */
  key: string
  /** Its short name, under its icon (« Montant »). */
  label: string
  icon: React.ReactNode
  /**
   * What the step chose, as a colour (a category's): its icon then takes
   * it, on a round tinted like `CategoryIcon`'s tile.
   */
  color?: string | null
  /** Not reachable yet: an earlier step is not filled in. */
  disabled?: boolean
}

type SheetStepsProps = Omit<React.ComponentProps<'nav'>, 'onSelect'> & {
  steps: readonly SheetStep[]
  /** The step shown. */
  current: string
  /** Goes to a step; without it the steps only show where one is. */
  onSelect?: (key: string) => void
}

/* ============================================================================
 * COMPONENT
 * ========================================================================= */

/**
 * Sheet Steps
 * Where a stepped editor is (#385, under its `SheetBar`): one round icon
 * per step with its name, linked by a line that fills up to the step shown,
 * like a progress bar. The steps before it and those already reachable
 * open with a tap; a step that needs an earlier one filled in is greyed out.
 */
function SheetSteps({
  steps,
  current,
  onSelect,
  className,
  ...props
}: SheetStepsProps) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.key === current),
  )
  return (
    <nav
      data-slot="sheet-steps"
      aria-label="Étapes"
      className={cn('px-3 pb-3', className)}
      {...props}
    >
      <ol className="flex items-start">
        {steps.map((step, index) => {
          const isCurrent = index === currentIndex
          const done = index < currentIndex
          const reachable = !step.disabled && onSelect !== undefined
          const tinted = step.color && !step.disabled ? step.color : null
          const ink = tinted
            ? `color-mix(in oklab, ${tinted} 82%, var(--foreground))`
            : undefined
          return (
            <li
              key={step.key}
              className="relative flex min-w-0 flex-1 flex-col items-center"
            >
              {index > 0 && (
                // The line from the previous step, filled once reached.
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-[17px] right-1/2 h-[2px] w-full',
                    index <= currentIndex ? 'bg-primary' : 'bg-border',
                  )}
                />
              )}
              <button
                type="button"
                disabled={!isCurrent && !reachable}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`${index + 1}. ${step.label}${done ? ', fait' : ''}`}
                onClick={() => {
                  if (!isCurrent) onSelect?.(step.key)
                }}
                style={
                  tinted
                    ? ({
                        color: ink,
                        borderColor: ink,
                        backgroundColor: `color-mix(in srgb, ${tinted} 14%, var(--popover))`,
                        '--tw-ring-color': `color-mix(in srgb, ${tinted} 30%, transparent)`,
                      } as React.CSSProperties)
                    : undefined
                }
                className={cn(
                  'relative z-10 flex size-[36px] items-center justify-center rounded-full border-2 transition-colors outline-none',
                  'pointer-coarse:touch-hitbox [&_svg]:size-[18px]',
                  'focus-visible:ring-3 focus-visible:ring-ring/50',
                  isCurrent &&
                    'border-primary bg-primary text-primary-foreground ring-4 ring-primary/20',
                  // Done: a light blue round (opaque, the line stays behind it).
                  done &&
                    'border-primary bg-[color-mix(in_srgb,var(--primary)_14%,var(--popover))] text-primary',
                  !isCurrent &&
                    !done &&
                    (step.disabled
                      ? 'border-border bg-muted text-muted-foreground/60'
                      : 'border-border bg-popover text-foreground'),
                  isCurrent || !reachable ? 'cursor-default' : 'cursor-pointer',
                )}
              >
                {step.icon}
              </button>
              <span
                aria-hidden
                className={cn(
                  'mt-1 max-w-full truncate px-1 text-[12px] leading-tight',
                  isCurrent
                    ? 'font-semibold text-foreground'
                    : step.disabled
                      ? 'text-muted-foreground/60'
                      : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export { SheetSteps, type SheetStep, type SheetStepsProps }
