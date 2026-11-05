'use client'

import * as React from 'react'
import { Cell, Pie, PieChart } from 'recharts'

import {
  ChartContainer,
  ChartDataTable,
  ChartEmpty,
  ChartTooltip,
  ChartTooltipContent,
  CHART_CATEGORICAL_SLOTS,
  chartCategoricalColor,
  chartSeriesColor,
  type ChartConfig,
  type ChartDataTableMode,
} from './chart-container'
import {
  formatEuros,
  formatPercent,
  formatWholeEuros,
  type ValueFormatter,
} from './format'

/* ============================================================================
 * TYPES
 * ========================================================================= */

/** One slice of a donut (e.g. a spending category). */
type DonutChartSlice = {
  /** Stable identifier (e.g. the category slug). */
  id: string
  /** Display name. */
  label: string
  /** Amount in integer **cents**. Zero and negative amounts are ignored. */
  value: number
  /**
   * Slice colour. Pass it explicitly (e.g. the category colour) so a category
   * keeps its colour from one month to the next; otherwise slices get the
   * categorical slots in input order.
   */
  color?: string
}

type DonutChartProps = {
  /** Slices, in a stable order (colours default to that order). */
  data: ReadonlyArray<DonutChartSlice>
  /** Accessible summary; defaults to a generated description with the total. */
  label?: string
  /** Most slices drawn, "Autres" included (default `6`, at most `8`); the smallest fold into "Autres". */
  maxSlices?: number
  /** Slices below this share of the total fold into "Autres" (default `0.03`). */
  minShare?: number
  /** Name of the grouped bucket (default `Autres`). */
  otherLabel?: string
  /** Caption under the centre total (default `Total`). */
  centerLabel?: string
  /** Formats amounts in the legend, tooltip and table (default: cents → euros). */
  valueFormatter?: ValueFormatter
  /** Formats the centre total (default: whole euros, `1 235 €`). */
  centerFormatter?: ValueFormatter
  /** Plot height in px (default `220`). */
  height?: number
  /** Shows the legend with amounts and shares (default `true`). */
  showLegend?: boolean
  /** Data-table twin: `sr-only` (default), `details` or `none`. */
  dataTable?: ChartDataTableMode
  /** Header of the label column in the data table (default `Catégorie`). */
  indexLabel?: string
  /** Header of the amount column in the data table (default `Montant`). */
  amountLabel?: string
  /** Content shown instead of the chart when there is nothing to draw. */
  emptyMessage?: React.ReactNode
  className?: string
}

type DonutRow = { id: string; label: string; value: number; color: string }

/* ============================================================================
 * HELPERS
 * ========================================================================= */

const OTHER_ID = '__other__'

/**
 * Keeps the largest slices (at most `maxSlices`, "Autres" included) and folds
 * the rest into one "Autres" slice, sorted by value. Slices without an
 * explicit colour get the categorical slots in **input** order among the
 * visible slices, so a colour follows the entity, never its rank.
 */
function groupDonutSlices(
  data: ReadonlyArray<DonutChartSlice>,
  {
    maxSlices,
    minShare,
    otherLabel,
  }: { maxSlices: number; minShare: number; otherLabel: string },
): DonutRow[] {
  const limit = Math.min(Math.max(1, maxSlices), CHART_CATEGORICAL_SLOTS)
  const positive = data
    .map((slice, position) => ({ ...slice, position }))
    .filter((slice) => slice.value > 0)

  const total = positive.reduce((sum, slice) => sum + slice.value, 0)
  if (total === 0) return []

  const sorted = [...positive].sort((a, b) => b.value - a.value)
  const kept = sorted.filter(
    (slice, rank) => rank < limit && slice.value / total >= minShare,
  )
  let folded = sorted.filter((slice) => !kept.includes(slice))

  // Keep the slice count within the limit, "Autres" included.
  while (folded.length > 0 && kept.length >= limit) {
    const smallest = kept.pop()
    if (smallest) folded = [smallest, ...folded]
  }

  // Folding a single slice into "Autres" would hide its name for nothing.
  if (folded.length === 1) {
    kept.push(...folded)
    folded = []
  }

  const slots = new Map(
    [...kept]
      .sort((a, b) => a.position - b.position)
      .map((slice, slot) => [slice.id, chartCategoricalColor(slot)]),
  )
  const rows: DonutRow[] = kept.map((slice) => ({
    id: slice.id,
    label: slice.label,
    value: slice.value,
    color: slice.color ?? slots.get(slice.id) ?? 'var(--chart-other)',
  }))

  if (folded.length === 0) return rows
  return [
    ...rows,
    {
      id: OTHER_ID,
      label: otherLabel,
      value: folded.reduce((sum, slice) => sum + slice.value, 0),
      color: 'var(--chart-other)',
    },
  ]
}

/* ============================================================================
 * COMPONENT
 * ========================================================================= */

/**
 * DonutChart
 * Part-to-whole breakdown (e.g. spending by category) with the total in the
 * centre and the smallest slices grouped into "Autres". Best with ≤ 6 slices;
 * for close values prefer a bar chart. Values are integer **cents**.
 *
 * @example
 * <DonutChart
 *   data={[
 *     { id: 'groceries', label: 'Courses', value: 42000 },
 *     { id: 'rent', label: 'Loyer', value: 85000 },
 *   ]}
 * />
 */
function DonutChart({
  data,
  label,
  maxSlices = 6,
  minShare = 0.03,
  otherLabel = 'Autres',
  centerLabel = 'Total',
  valueFormatter = formatEuros,
  centerFormatter = formatWholeEuros,
  height = 220,
  showLegend = true,
  dataTable = 'sr-only',
  indexLabel = 'Catégorie',
  amountLabel = 'Montant',
  emptyMessage,
  className,
}: DonutChartProps) {
  const rows = React.useMemo(
    () =>
      groupDonutSlices(data, {
        maxSlices,
        minShare,
        otherLabel,
      }),
    [data, maxSlices, minShare, otherLabel],
  )

  const config = React.useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        rows.map((row) => [row.id, { label: row.label, color: row.color }]),
      ),
    [rows],
  )

  if (!rows.length) {
    return (
      <ChartEmpty height={height} className={className}>
        {emptyMessage}
      </ChartEmpty>
    )
  }

  const total = rows.reduce((sum, row) => sum + row.value, 0)
  const summary =
    label ??
    `Graphique en anneau : ${centerLabel} ${valueFormatter(total)}, ${rows
      .map((row) => `${row.label} ${formatPercent(row.value / total)}`)
      .join(', ')}`

  return (
    <ChartContainer
      config={config}
      label={summary}
      height={height}
      className={className}
      overlay={
        <div className="flex max-w-[45%] flex-col items-center text-center">
          <span className="text-lg leading-tight font-semibold text-foreground">
            {centerFormatter(total)}
          </span>
          <span className="text-xs text-muted-foreground">{centerLabel}</span>
        </div>
      }
      footer={
        <>
          {showLegend ? (
            <ul
              data-slot="chart-legend"
              aria-label="Légende"
              className="grid gap-1.5 text-xs"
            >
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: chartSeriesColor(row.id) }}
                  />
                  <span className="min-w-0 truncate text-muted-foreground">
                    {row.label}
                  </span>
                  <span className="ml-auto font-medium text-foreground tabular-nums">
                    {valueFormatter(row.value)}
                  </span>
                  <span className="w-12 text-right text-muted-foreground tabular-nums">
                    {formatPercent(row.value / total)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {dataTable !== 'none' ? (
            <ChartDataTable
              data={rows.map((row) => ({
                label: row.label,
                amount: row.value,
              }))}
              index="label"
              indexLabel={indexLabel}
              keys={['amount']}
              columnLabels={{ amount: amountLabel }}
              caption={summary}
              valueFormatter={valueFormatter}
              variant={dataTable}
            />
          ) : null}
        </>
      }
    >
      <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideLabel
              indicator="square"
              valueFormatter={valueFormatter}
              total={total}
            />
          }
        />
        <Pie
          data={rows}
          dataKey="value"
          nameKey="id"
          innerRadius="64%"
          outerRadius="96%"
          startAngle={90}
          endAngle={-270}
          stroke="var(--chart-surface)"
          strokeWidth={2}
          isAnimationActive={false}
        >
          {rows.map((row) => (
            <Cell key={row.id} fill={chartSeriesColor(row.id)} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export {
  DonutChart,
  groupDonutSlices,
  type DonutChartProps,
  type DonutChartSlice,
}
