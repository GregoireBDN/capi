'use client'

import * as React from 'react'
import type { XAxisProps, YAxisProps } from 'recharts'

import {
  ChartDataTable,
  ChartLegendContent,
  type ChartConfig,
  type ChartDataTableMode,
  type ChartDatum,
} from './chart-container'
import {
  formatCompactEuros,
  formatEuros,
  type IndexFormatter,
  type ValueFormatter,
} from './format'

/* ============================================================================
 * TYPES
 * ========================================================================= */

/** A horizontal reference line (target, average, threshold). */
type ChartReferenceLine = {
  /** Value on the value axis (cents for monetary charts). */
  value: number
  /** Short label printed on the line, e.g. `Objectif`. */
  label?: string
}

/** Props shared by the ready-made cartesian charts (bar, line, area). */
type CartesianChartProps<TDatum extends ChartDatum> = {
  /** Rows, in display order (e.g. one per month). */
  data: ReadonlyArray<TDatum>
  /** Field holding the category / period of each row (e.g. `month`). */
  index: keyof TDatum & string
  /** Series to plot: data key → label + colour. Key order is series order. */
  config: ChartConfig
  /**
   * Accessible summary (aria-label of the graphic, caption of the data
   * table). Defaults to a generated description; prefer a meaningful one,
   * e.g. "Revenus et dépenses par mois, janvier à juin 2026".
   */
  label?: string
  /** Plot height in px, axes included (default `240`). */
  height?: number
  /**
   * Formats values in the tooltip and the data table.
   * Default: integer **cents** → `1 234,56 €`.
   */
  valueFormatter?: ValueFormatter
  /** Formats value-axis ticks. Default: cents → compact euros (`1,2 k€`). */
  axisFormatter?: ValueFormatter
  /** Formats index-axis ticks, e.g. `formatMonthShort` (`janv.`). */
  indexFormatter?: IndexFormatter
  /** Formats the index in the tooltip and data table, e.g. `formatMonthLong`. Defaults to `indexFormatter`. */
  tooltipIndexFormatter?: IndexFormatter
  /** Header of the index column in the data table (default `Période`). */
  indexLabel?: string
  /** Shows the legend. Default: only when there are 2+ series. */
  showLegend?: boolean
  /** Shows horizontal gridlines (default `true`). */
  showGrid?: boolean
  /** Data-table twin: `sr-only` (default), `details` (visible toggle) or `none`. */
  dataTable?: ChartDataTableMode
  /** Horizontal reference lines (targets, averages). */
  referenceLines?: ReadonlyArray<ChartReferenceLine>
  /** Content shown instead of the chart when `data` is empty. */
  emptyMessage?: React.ReactNode
  className?: string
}

/* ============================================================================
 * HELPERS
 * ========================================================================= */

const identity: IndexFormatter = (value) => value

/** Builds a French aria summary such as "Graphique en barres : Revenus, Dépenses, de janvier 2026 à juin 2026". */
function buildChartSummary({
  kind,
  config,
  data,
  index,
  indexFormatter = identity,
}: {
  kind: string
  config: ChartConfig
  data: ReadonlyArray<ChartDatum>
  index: string
  indexFormatter?: IndexFormatter
}): string {
  const series = Object.values(config)
    .map((item) => item.label)
    .join(', ')
  const first = data[0]?.[index]
  const last = data[data.length - 1]?.[index]
  const range =
    first !== undefined && last !== undefined && data.length > 1
      ? `, de ${indexFormatter(String(first))} à ${indexFormatter(String(last))}`
      : ''
  return `${kind} : ${series}${range}`
}

/** Resolves the formatter defaults shared by every cartesian chart. */
function useCartesianDefaults<TDatum extends ChartDatum>(
  props: CartesianChartProps<TDatum>,
  kind: string,
) {
  const valueFormatter = props.valueFormatter ?? formatEuros
  const axisFormatter = props.axisFormatter ?? formatCompactEuros
  const indexFormatter = props.indexFormatter ?? identity
  const tooltipIndexFormatter = props.tooltipIndexFormatter ?? indexFormatter
  const keys = Object.keys(props.config)
  const label =
    props.label ??
    buildChartSummary({
      kind,
      config: props.config,
      data: props.data,
      index: props.index,
      indexFormatter: tooltipIndexFormatter,
    })

  return {
    valueFormatter,
    axisFormatter,
    indexFormatter,
    tooltipIndexFormatter,
    keys,
    label,
    height: props.height ?? 240,
    showLegend: props.showLegend ?? keys.length > 1,
    showGrid: props.showGrid ?? true,
    dataTable: props.dataTable ?? 'sr-only',
  }
}

/** Legend + data table rendered under a cartesian chart. */
function CartesianFooter({
  showLegend,
  marker,
  dataTable,
  data,
  index,
  indexLabel,
  label,
  valueFormatter,
  tooltipIndexFormatter,
}: {
  showLegend: boolean
  marker: 'square' | 'line'
  dataTable: ChartDataTableMode
  data: ReadonlyArray<ChartDatum>
  index: string
  indexLabel?: string
  label: string
  valueFormatter: ValueFormatter
  tooltipIndexFormatter: IndexFormatter
}) {
  return (
    <>
      {showLegend ? <ChartLegendContent marker={marker} /> : null}
      {dataTable !== 'none' ? (
        <ChartDataTable
          data={data}
          index={index}
          indexLabel={indexLabel}
          caption={label}
          valueFormatter={valueFormatter}
          indexFormatter={tooltipIndexFormatter}
          variant={dataTable}
        />
      ) : null}
    </>
  )
}

/** Index axis: no rules, thinned ticks so labels never collide at 375 px. */
function indexAxisProps(
  index: string,
  indexFormatter: IndexFormatter,
): XAxisProps {
  return {
    dataKey: index,
    tickLine: false,
    axisLine: false,
    tickMargin: 8,
    minTickGap: 12,
    interval: 'preserveStartEnd',
    tickFormatter: (value: unknown) => indexFormatter(String(value)),
  }
}

/** Rounds a raw step up to 1, 2, 2.5 or 5 × 10^n. */
function niceStep(rough: number): number {
  const base = 10 ** Math.floor(Math.log10(rough))
  const fraction = rough / base
  const nice =
    fraction <= 1
      ? 1
      : fraction <= 2
        ? 2
        : fraction <= 2.5
          ? 2.5
          : fraction <= 5
            ? 5
            : 10
  return nice * base
}

/**
 * Clean, evenly spaced ticks covering `[min, max]` (at most ~`count`).
 * Works on cents: a round step in cents is a round step in euros.
 */
function niceTicks(min: number, max: number, count = 5): number[] {
  let low = Math.min(min, max)
  let high = Math.max(min, max)
  if (low === high) {
    const pad = low === 0 ? 1 : Math.abs(low) * 0.1
    low -= pad
    high += pad
  }
  const step = niceStep((high - low) / Math.max(1, count - 1))
  const start = Math.floor(low / step) * step
  const end = Math.ceil(high / step) * step
  const ticks: number[] = []
  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(Math.round(value))
  }
  return ticks
}

/**
 * Extent of the plotted values: per-row sums on each side of zero when
 * stacked, reference lines included, zero included when asked.
 */
function valueExtent(
  data: ReadonlyArray<ChartDatum>,
  keys: string[],
  {
    stacked = false,
    includeZero = false,
    referenceLines,
  }: {
    stacked?: boolean
    includeZero?: boolean
    referenceLines?: ReadonlyArray<ChartReferenceLine>
  } = {},
): [number, number] {
  const values: number[] = includeZero ? [0] : []
  for (const row of data) {
    let positive = 0
    let negative = 0
    for (const key of keys) {
      const value = row[key]
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      if (!stacked) values.push(value)
      else if (value >= 0) positive += value
      else negative += value
    }
    if (stacked) values.push(positive, negative)
  }
  for (const line of referenceLines ?? []) values.push(line.value)
  if (!values.length) return [0, 0]
  return [Math.min(...values), Math.max(...values)]
}

/** Value axis: compact ticks on round values, width fitted to the labels. */
function valueAxisProps(
  axisFormatter: ValueFormatter,
  [min, max]: [number, number],
): YAxisProps {
  const ticks = niceTicks(min, max)
  return {
    tickLine: false,
    axisLine: false,
    tickMargin: 4,
    width: 'auto',
    ticks,
    interval: 0,
    domain: [ticks[0] ?? min, ticks[ticks.length - 1] ?? max],
    tickFormatter: (value: unknown) => axisFormatter(Number(value)),
  }
}

/** Shared styling of the zero baseline and reference lines. */
const ZERO_LINE_PROPS = {
  y: 0,
  stroke: 'var(--muted-foreground)',
  strokeOpacity: 0.5,
  strokeWidth: 1,
} as const

const REFERENCE_LINE_PROPS = {
  stroke: 'var(--chart-target)',
  strokeWidth: 1.5,
  strokeDasharray: '4 4',
} as const

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export {
  CartesianFooter,
  REFERENCE_LINE_PROPS,
  ZERO_LINE_PROPS,
  buildChartSummary,
  indexAxisProps,
  niceTicks,
  useCartesianDefaults,
  valueAxisProps,
  valueExtent,
  type CartesianChartProps,
  type ChartReferenceLine,
}
