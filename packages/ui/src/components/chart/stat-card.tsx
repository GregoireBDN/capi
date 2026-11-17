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
  /**
   * Short muted text shown in place of the delta line when there is no
   * comparison, e.g. why the value is a dash or why the month is not
   * compared (`Pas encore de revenus ce mois-ci`).
   */
  note?: React.ReactNode
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

/**
 * Average advance of a figure of the value line, in em: digits are ~0.58em
 * (tabular), separators and narrow no-break spaces much less, so 0.55 keeps
 * a margin for any amount or percentage.
 */
const VALUE_EM_PER_CHAR = 0.55

/**
 * Font size that fits `text` on one line in its container (`cqi`), between
 * 0.75rem and 1.5rem: `-1 234 567,89 €` (15 characters) gets 12cqi,
 * `1 183,67 €` 18cqi.
 */
function fittedFontSize(text: string) {
  const cqi = 100 / (Math.max(text.length, 6) * VALUE_EM_PER_CHAR)
  return `clamp(0.75rem, ${cqi.toFixed(1)}cqi, 1.5rem)`
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
 * sparkline: beside the figures when the tile is at least 260px wide (one
 * tile per row on a phone), below them when it is narrower (tiles abreast).
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
  note,
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

  const hasTrend = trend !== undefined && trend.length > 1
  const valueText = valueFormatter(value)

  return (
    <Card
      data-slot="stat-card"
      size="sm"
      className={cn('@container min-w-0', className)}
      {...props}
    >
      {/* Narrow tile (several abreast): figures stacked, sparkline below.
          Wide tile (one per row on a phone): the label across the tile, then
          the figures on the left and the sparkline on the right, so the tile
          stays wider than tall and the label keeps its whole width. */}
      <div
        data-slot="stat-card-body"
        className={cn(
          'grid gap-2',
          hasTrend &&
            '@min-[260px]:grid-cols-[minmax(0,1fr)_minmax(4rem,35%)] @min-[260px]:items-center @min-[260px]:gap-x-1',
        )}
      >
        {/* Labels wrap rather than truncate: a phone shows them whole. */}
        <div
          className={cn(
            'flex min-w-0 items-center gap-2 px-3 text-sm text-muted-foreground',
            hasTrend && '@min-[260px]:col-span-2',
          )}
        >
          {icon ? (
            <span aria-hidden className="shrink-0 [&_svg]:size-4">
              {icon}
            </span>
          ) : null}
          <span className="min-w-0 break-words">{label}</span>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          {/* Amounts never break: the size follows the width left to the
              figures (their own container, so a sparkline beside them is
              accounted for) and the length of the text, so a long amount
              shrinks to stay on one line and a short one stays large. */}
          <div className="@container/stat-value min-w-0 px-3">
            <div
              data-slot="stat-card-value"
              className="leading-tight font-semibold tracking-tight whitespace-nowrap text-foreground tabular-nums"
              style={{ fontSize: fittedFontSize(valueText) }}
            >
              {valueText}
            </div>
          </div>

          {delta ? (
            // The delta never breaks either: its arrow and gap scale with the
            // text (em) so "+123 456,78 €" fits a 320px phone's half-width tile.
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-3 text-[clamp(0.55rem,9cqi,0.75rem)]">
              <span
                data-slot="stat-card-delta"
                data-tone={delta.tone}
                className={cn(
                  'inline-flex items-center gap-[0.3em] font-medium whitespace-nowrap tabular-nums',
                  TONE_CLASSES[delta.tone],
                )}
              >
                <DeltaIcon aria-hidden className="size-[1.1em] shrink-0" />
                <span className="sr-only">
                  {DIRECTION_TEXT[delta.direction]}
                  {TONE_TEXT[delta.tone]} :{' '}
                </span>
                {delta.text}
              </span>
              <span className="text-muted-foreground">{comparisonLabel}</span>
            </p>
          ) : note ? (
            <p
              data-slot="stat-card-note"
              className="px-3 text-[clamp(0.55rem,9cqi,0.75rem)] text-muted-foreground"
            >
              {note}
            </p>
          ) : null}
        </div>

        {hasTrend ? (
          <Sparkline
            data={trend}
            label={
              trendLabel ?? `${label} : tendance sur ${trend.length} périodes`
            }
            className="mt-1 px-3 @min-[260px]:mt-0 @min-[260px]:pl-0"
          />
        ) : null}
      </div>
    </Card>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export { StatCard, type StatCardProps }
