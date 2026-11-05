import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '../../lib/utils'
import { Card } from '../card'
import {
  formatEuros,
  formatSignedEuros,
  formatSignedPercent,
  type ValueFormatter,
} from './format'
import { Sparkline } from './sparkline'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type StatCardProps = Omit<React.ComponentProps<'div'>, 'children'> & {
  /** What the figure is, sentence case, no trailing colon (e.g. `Dépenses du mois`). */
  label: string
  /** Current value, in integer **cents** for monetary figures. */
  value: number
  /** Value of the comparison period; enables the delta line. */
  previousValue?: number
  /** Formats `value` (default: cents → `1 234,56 €`). */
  valueFormatter?: ValueFormatter
  /** Delta as a percentage (default) or as a signed amount. */
  deltaDisplay?: 'percent' | 'value'
  /** Formats the delta when `deltaDisplay="value"` (default: signed euros). */
  deltaFormatter?: ValueFormatter
  /** Names the comparison period (default `vs mois précédent`). */
  comparisonLabel?: string
  /**
   * Whether an increase is good news. `true` (default) for income, savings or
   * net worth; `false` for expenses, where a rise is shown as unfavourable.
   */
  increaseIsGood?: boolean
  /** Optional recent history (oldest first), drawn as a sparkline. */
  trend?: ReadonlyArray<number>
  /** Accessible description of the trend (default: generated from `label`). */
  trendLabel?: string
  /** Optional icon shown next to the label. */
  icon?: React.ReactNode
}

type DeltaTone = 'good' | 'bad' | 'neutral'

/* ============================================================================
 * HELPERS
 * ========================================================================= */

function describeDelta({
  value,
  previousValue,
  increaseIsGood,
  deltaDisplay,
  deltaFormatter,
}: {
  value: number
  previousValue: number
  increaseIsGood: boolean
  deltaDisplay: 'percent' | 'value'
  deltaFormatter: ValueFormatter
}) {
  const difference = value - previousValue
  const direction: keyof typeof DIRECTION_TEXT =
    difference > 0 ? 'up' : difference < 0 ? 'down' : 'flat'
  const tone: DeltaTone =
    direction === 'flat'
      ? 'neutral'
      : (direction === 'up') === increaseIsGood
        ? 'good'
        : 'bad'

  // A percentage of zero is meaningless: fall back to the amount.
  const text =
    deltaDisplay === 'percent' && previousValue !== 0
      ? formatSignedPercent(difference / Math.abs(previousValue))
      : deltaFormatter(difference)

  return { direction, tone, text }
}

const TONE_CLASSES: Record<DeltaTone, string> = {
  good: 'text-chart-delta-good',
  bad: 'text-chart-delta-bad',
  neutral: 'text-muted-foreground',
}

const DIRECTION_TEXT = {
  up: 'En hausse',
  down: 'En baisse',
  flat: 'Stable',
} as const

const TONE_TEXT: Record<DeltaTone, string> = {
  good: ', favorable',
  bad: ', défavorable',
  neutral: '',
}

/* ============================================================================
 * COMPONENT
 * ========================================================================= */

/**
 * StatCard
 * KPI tile: label, headline value, delta vs the previous period (arrow, sign
 * and favourable/unfavourable colour — never colour alone) and an optional
 * sparkline.
 *
 * @example
 * <StatCard label="Dépenses du mois" value={245000} previousValue={231000} increaseIsGood={false} />
 */
function StatCard({
  label,
  value,
  previousValue,
  valueFormatter = formatEuros,
  deltaDisplay = 'percent',
  deltaFormatter = formatSignedEuros,
  comparisonLabel = 'vs mois précédent',
  increaseIsGood = true,
  trend,
  trendLabel,
  icon,
  className,
  ...props
}: StatCardProps) {
  const delta =
    previousValue === undefined
      ? undefined
      : describeDelta({
          value,
          previousValue,
          increaseIsGood,
          deltaDisplay,
          deltaFormatter,
        })

  const DeltaIcon =
    delta?.direction === 'up'
      ? TrendingUpIcon
      : delta?.direction === 'down'
        ? TrendingDownIcon
        : MinusIcon

  return (
    <Card
      data-slot="stat-card"
      size="sm"
      className={cn('min-w-0 gap-2', className)}
      {...props}
    >
      <div className="flex items-center gap-2 px-3 text-sm text-muted-foreground">
        {icon ? (
          <span aria-hidden className="shrink-0 [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 truncate">{label}</span>
      </div>

      <div className="px-3 text-xl leading-tight font-semibold tracking-tight break-words text-foreground sm:text-2xl">
        {valueFormatter(value)}
      </div>

      {delta ? (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-3 text-xs">
          <span
            data-slot="stat-card-delta"
            data-tone={delta.tone}
            className={cn(
              'inline-flex items-center gap-1 font-medium tabular-nums',
              TONE_CLASSES[delta.tone],
            )}
          >
            <DeltaIcon aria-hidden className="size-3.5 shrink-0" />
            <span className="sr-only">
              {DIRECTION_TEXT[delta.direction]}
              {TONE_TEXT[delta.tone]} :{' '}
            </span>
            {delta.text}
          </span>
          <span className="text-muted-foreground">{comparisonLabel}</span>
        </p>
      ) : null}

      {trend && trend.length > 1 ? (
        <Sparkline
          data={trend}
          label={
            trendLabel ?? `${label} : tendance sur ${trend.length} périodes`
          }
          className="mt-1 px-3"
        />
      ) : null}
    </Card>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export { StatCard, type StatCardProps }
