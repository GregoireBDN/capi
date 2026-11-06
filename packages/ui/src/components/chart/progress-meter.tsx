import {
  CircleAlertIcon,
  CircleCheckIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import * as React from 'react'

import { cn } from '../../lib/utils'
import { formatEuros, formatPercent, type ValueFormatter } from './format'

/* ============================================================================
 * TYPES
 * ========================================================================= */

/**
 * `limit`: a ceiling not to pass (budgets): on track, warning, over target.
 * `reach`: an amount to get to (savings goals): in progress, then reached;
 * going past the target is good news, never a warning.
 */
type ProgressMeterGoal = 'limit' | 'reach'

type ProgressMeterState = 'under' | 'warning' | 'over' | 'reached'

type ProgressMeterProps = Omit<React.ComponentProps<'div'>, 'children'> & {
  /** What is measured, e.g. a budget category (`Courses`). */
  label: string
  /**
   * Amount so far, in integer **cents** (spent for `limit`, saved for
   * `reach`; a negative amount empties the bar).
   */
  value: number
  /** Target / budget, in integer **cents**. */
  target: number
  /** What the target means (default `limit`, see `ProgressMeterGoal`). */
  goal?: ProgressMeterGoal
  /** Formats amounts (default: cents → `1 234,56 €`). */
  valueFormatter?: ValueFormatter
  /**
   * Share of the target from which the meter turns to warning (default
   * `0.9`). Ignored with `goal="reach"`.
   */
  warningThreshold?: number
  /** Hides the status line under the bar (remaining / overspent / reached). */
  hideStatus?: boolean
  /** Control at the end of the header (e.g. an edit button). */
  action?: React.ReactNode
}

/* ============================================================================
 * HELPERS
 * ========================================================================= */

function getProgressMeterState(
  value: number,
  target: number,
  warningThreshold: number,
  goal: ProgressMeterGoal = 'limit',
): ProgressMeterState {
  if (goal === 'reach') return value >= target ? 'reached' : 'under'
  if (value > target) return 'over'
  if (target > 0 && value / target >= warningThreshold) return 'warning'
  return 'under'
}

const FILL_COLOR: Record<ProgressMeterState, string> = {
  under: 'var(--chart-1)',
  warning: 'var(--chart-warning)',
  over: 'var(--chart-over)',
  reached: 'var(--chart-delta-good)',
}

/** Status line of the meter, in French. */
function getStatusText(
  state: ProgressMeterState,
  value: number,
  target: number,
  format: ValueFormatter,
): string {
  switch (state) {
    case 'over':
      return `Dépassement de ${format(value - target)}`
    case 'warning':
      return `Bientôt atteint, reste ${format(target - value)}`
    case 'reached':
      return value > target
        ? `Objectif atteint, ${format(value - target)} de plus`
        : 'Objectif atteint'
    default:
      return `Reste ${format(target - value)}`
  }
}

const STATUS_ICON: Partial<
  Record<ProgressMeterState, React.ComponentType<{ className?: string }>>
> = {
  over: CircleAlertIcon,
  warning: TriangleAlertIcon,
  reached: CircleCheckIcon,
}

/* ============================================================================
 * COMPONENT
 * ========================================================================= */

/**
 * ProgressMeter
 * Actual vs target. With `goal="limit"` (budgets, default) the fill carries
 * the state (on track → warning → over target); with `goal="reach"`
 * (savings) it is in progress, then reached. The status line repeats the
 * state in words with an icon, so colour is never the only signal. Past the
 * target, the extra part is drawn beyond a gap that marks the target.
 *
 * @example
 * <ProgressMeter label="Courses" value={32000} target={40000} />
 * <ProgressMeter goal="reach" label="Vacances" value={180000} target={150000} />
 */
function ProgressMeter({
  label,
  value,
  target,
  goal = 'limit',
  valueFormatter = formatEuros,
  warningThreshold = 0.9,
  hideStatus = false,
  action,
  className,
  ...props
}: ProgressMeterProps) {
  const reach = goal === 'reach'
  const filled = Math.max(0, value)
  const budget = Math.max(0, target)
  // A savings amount can be negative (a month in the red): it is shown as
  // is, only the bar stops at zero. A budget never shows negative spending.
  const shown = reach ? value : filled
  const state = getProgressMeterState(shown, budget, warningThreshold, goal)
  const scale = Math.max(filled, budget, 1)
  const within = (Math.min(filled, budget) / scale) * 100
  const overflow = filled > budget ? ((filled - budget) / scale) * 100 : 0
  const fill = FILL_COLOR[state]

  const share = budget > 0 ? formatPercent(shown / budget) : undefined
  const statusText = getStatusText(state, shown, budget, valueFormatter)
  const valueText = `${valueFormatter(shown)} sur ${valueFormatter(budget)}${
    share ? ` (${share})` : ''
  }, ${statusText.charAt(0).toLowerCase()}${statusText.slice(1)}`
  const StatusIcon = STATUS_ICON[state]

  return (
    <div
      data-slot="progress-meter"
      data-state={state}
      data-goal={goal}
      className={cn('grid min-w-0 gap-1.5', className)}
      {...props}
    >
      <div className="flex items-start gap-2">
        {/* Wraps on a phone rather than cutting the label. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 text-sm">
          <span className="min-w-0 flex-auto font-medium break-words text-foreground">
            {label}
          </span>
          {/* Amounts never break inside; on a narrow card the target goes
              under the value rather than overflowing. */}
          <span className="ml-auto max-w-full text-right text-muted-foreground tabular-nums">
            <span className="font-medium whitespace-nowrap text-foreground">
              {valueFormatter(shown)}
            </span>{' '}
            <span className="whitespace-nowrap">
              / {valueFormatter(budget)}
            </span>
          </span>
        </div>
        {action}
      </div>

      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={scale}
        aria-valuenow={filled}
        aria-valuetext={valueText}
        className="relative h-2 w-full overflow-hidden rounded-full"
        style={{
          backgroundColor: `color-mix(in oklab, ${fill} 18%, transparent)`,
        }}
      >
        {within > 0 ? (
          <div
            data-slot="progress-meter-fill"
            className={cn(
              'absolute inset-y-0 left-0 rounded-full transition-[width]',
              overflow > 0 && 'rounded-r-none',
            )}
            style={{ width: `${within}%`, backgroundColor: fill }}
          />
        ) : null}
        {overflow > 0 ? (
          <div
            data-slot="progress-meter-overflow"
            className="absolute inset-y-0 right-0 rounded-r-full"
            style={{
              width: `calc(${overflow}% - 2px)`,
              backgroundColor: fill,
            }}
          />
        ) : null}
      </div>

      {hideStatus ? null : (
        <p
          className={cn(
            'flex items-center gap-1 text-xs',
            state === 'over'
              ? 'font-medium text-chart-delta-bad'
              : state === 'reached'
                ? 'font-medium text-chart-delta-good'
                : 'text-muted-foreground',
          )}
        >
          {StatusIcon ? (
            <StatusIcon
              aria-hidden
              className={cn(
                'size-3.5 shrink-0',
                state === 'warning' && 'text-chart-warning',
              )}
            />
          ) : null}
          <span className="min-w-0">{statusText}</span>
          {share ? (
            <span className="ml-auto shrink-0 whitespace-nowrap text-muted-foreground tabular-nums">
              {share}
            </span>
          ) : null}
        </p>
      )}
    </div>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export {
  ProgressMeter,
  getProgressMeterState,
  type ProgressMeterGoal,
  type ProgressMeterProps,
  type ProgressMeterState,
}
