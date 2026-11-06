import { CircleAlertIcon, TriangleAlertIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '../../lib/utils'
import { formatEuros, formatPercent, type ValueFormatter } from './format'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type ProgressMeterState = 'under' | 'warning' | 'over'

type ProgressMeterProps = Omit<React.ComponentProps<'div'>, 'children'> & {
  /** What is measured, e.g. a budget category (`Courses`). */
  label: string
  /** Amount spent so far, in integer **cents**. */
  value: number
  /** Target / budget, in integer **cents**. */
  target: number
  /** Formats amounts (default: cents → `1 234,56 €`). */
  valueFormatter?: ValueFormatter
  /** Share of the target from which the meter turns to warning (default `0.9`). */
  warningThreshold?: number
  /** Hides the status line under the bar (remaining / overspent). */
  hideStatus?: boolean
}

/* ============================================================================
 * HELPERS
 * ========================================================================= */

function getProgressMeterState(
  value: number,
  target: number,
  warningThreshold: number,
): ProgressMeterState {
  if (value > target) return 'over'
  if (target > 0 && value / target >= warningThreshold) return 'warning'
  return 'under'
}

const FILL_COLOR: Record<ProgressMeterState, string> = {
  under: 'var(--chart-1)',
  warning: 'var(--chart-warning)',
  over: 'var(--chart-over)',
}

/* ============================================================================
 * COMPONENT
 * ========================================================================= */

/**
 * ProgressMeter
 * Budget actual vs target. The fill carries the state (on track → warning →
 * over target) and the status line repeats it in words with an icon, so
 * colour is never the only signal. When over target, the overspent part is
 * drawn past a gap that marks the target.
 *
 * @example
 * <ProgressMeter label="Courses" value={32000} target={40000} />
 */
function ProgressMeter({
  label,
  value,
  target,
  valueFormatter = formatEuros,
  warningThreshold = 0.9,
  hideStatus = false,
  className,
  ...props
}: ProgressMeterProps) {
  const spent = Math.max(0, value)
  const budget = Math.max(0, target)
  const state = getProgressMeterState(spent, budget, warningThreshold)
  const scale = Math.max(spent, budget, 1)
  const within = (Math.min(spent, budget) / scale) * 100
  const overflow = state === 'over' ? ((spent - budget) / scale) * 100 : 0
  const fill = FILL_COLOR[state]

  const share = budget > 0 ? formatPercent(spent / budget) : undefined
  const remaining = budget - spent
  const statusText =
    state === 'over'
      ? `Dépassement de ${valueFormatter(-remaining)}`
      : state === 'warning'
        ? `Bientôt atteint, reste ${valueFormatter(remaining)}`
        : `Reste ${valueFormatter(remaining)}`
  const valueText = `${valueFormatter(spent)} sur ${valueFormatter(budget)}${
    share ? ` (${share})` : ''
  }, ${statusText.toLowerCase()}`

  const StatusIcon =
    state === 'over'
      ? CircleAlertIcon
      : state === 'warning'
        ? TriangleAlertIcon
        : null

  return (
    <div
      data-slot="progress-meter"
      data-state={state}
      className={cn('grid min-w-0 gap-1.5', className)}
      {...props}
    >
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium text-foreground">
          {label}
        </span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          <span className="font-medium text-foreground">
            {valueFormatter(spent)}
          </span>{' '}
          / {valueFormatter(budget)}
        </span>
      </div>

      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={scale}
        aria-valuenow={spent}
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
  type ProgressMeterProps,
  type ProgressMeterState,
}
