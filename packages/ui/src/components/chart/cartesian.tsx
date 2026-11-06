'use client'

import * as React from 'react'
import {
  Text,
  useChartWidth,
  usePlotArea,
  type XAxisProps,
  type YAxisProps,
} from 'recharts'

import {
  ChartDataTable,
  ChartLegendContent,
  type ChartConfig,
  type ChartDataTableMode,
  type ChartDatum,
} from './chart-container'
import {
  calendarToTime,
  formatCompactEuros,
  formatEuros,
  timeToCalendar,
  type IndexFormatter,
  type ValueFormatter,
} from './format'
import { timeDomain, timeTicks } from './time-axis'

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

/** A vertical reference line at an index value (e.g. a "today" marker). */
type ChartIndexReferenceLine = {
  /** Index value, e.g. the `YYYY-MM-DD` date of today. */
  value: string
  /** Short label printed above the line, e.g. `Aujourd’hui`. */
  label?: string
}

/**
 * How the index axis is scaled: `category` spaces rows evenly (default);
 * `time` reads the index as `YYYY-MM-DD` / `YYYY-MM` calendar dates (UTC)
 * and spaces rows by the time between them.
 */
type ChartIndexScale = 'category' | 'time'

/** Index-axis options of the time-series charts (line, area). */
type TimeSeriesChartProps = {
  /**
   * `time`: numeric time axis, rows sorted by date and spaced by time, ticks
   * on calendar boundaries labelled in French (`14 mars`, `mars 26`,
   * `2026`); `indexFormatter` is then only the tooltip default. Rows whose
   * index is not a calendar date are left out. Default `category`.
   */
  indexScale?: ChartIndexScale
  /** Vertical reference lines at index values (e.g. today). */
  indexReferenceLines?: ReadonlyArray<ChartIndexReferenceLine>
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

/** Average advance of a 12 px tick character, rounded up so labels never touch. */
const TICK_CHAR_WIDTH = 7
/** Minimum air between two index labels, in px. */
const TICK_GAP = 8
/** Estimated width of a tick label, in px (no layout needed, SSR-safe). */
function estimateLabelWidth(
  label: string,
  charWidth = TICK_CHAR_WIDTH,
): number {
  return label.length * charWidth
}

/**
 * Which of `count` evenly spaced category ticks get a label, so labels of
 * `labelWidth` px never overlap on a `plotWidth` px axis: the first and the
 * last (most recent) are always kept, and as many as fit are spread evenly
 * between them (gaps differ by one category at most, e.g. every 2nd or
 * 3rd month on a phone). Indices are ascending.
 */
function categoryTickIndices(
  count: number,
  plotWidth: number,
  labelWidth: number,
  gap = TICK_GAP,
): number[] {
  if (count <= 0) return []
  const last = count - 1
  if (count === 1 || !(plotWidth > 0)) return count === 1 ? [0] : [0, last]
  const band = plotWidth / count
  // Minimum distance between two labels, in categories.
  const need = Math.max(1, Math.ceil((labelWidth + gap) / band))
  if (need > last) return [last]
  // Every gap is floor or ceil of last / intervals, both >= need.
  const intervals = Math.floor(last / need)
  return Array.from({ length: intervals + 1 }, (_, i) =>
    Math.round((i * last) / intervals),
  )
}

type CategoryTickProps = React.ComponentProps<typeof Text> & {
  payload?: { value?: unknown }
  index?: number
  visibleTicksCount?: number
  tickFormatter?: (value: unknown, index: number) => string
  /** Width of the widest label of the axis, in px. */
  labelWidth: number
}

/**
 * Index-axis tick: draws only the labels picked by `categoryTickIndices`
 * for the current plot width, so a phone gets every 2nd or 3rd month,
 * deliberately, instead of whatever Recharts manages to fit. The first and
 * last labels are nudged inside the chart so they are never clipped.
 */
function CategoryTick({
  payload,
  index = 0,
  visibleTicksCount = 0,
  tickFormatter,
  labelWidth,
  x,
  ...props
}: CategoryTickProps) {
  const plot = usePlotArea()
  const chartWidth = useChartWidth()
  const indices = React.useMemo(
    () =>
      new Set(
        categoryTickIndices(visibleTicksCount, plot?.width ?? 0, labelWidth),
      ),
    [visibleTicksCount, plot?.width, labelWidth],
  )
  if (!indices.has(index)) return null
  const text = tickFormatter
    ? tickFormatter(payload?.value, index)
    : String(payload?.value ?? '')
  const half = estimateLabelWidth(text) / 2
  const center = Number(x)
  const clamped =
    chartWidth && Number.isFinite(center)
      ? Math.min(Math.max(center, half), chartWidth - half)
      : x
  return (
    <Text {...props} x={clamped}>
      {text}
    </Text>
  )
}

/** Shared props of every index axis: no rules, muted labels. */
const INDEX_AXIS_BASE = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
} as const

/**
 * Category index axis (one label slot per row): every row gets a tick, and
 * `CategoryTick` labels a regular subset that fits the plot width, first
 * and last included, so labels never collide at 375 px.
 */
function indexAxisProps(
  index: string,
  indexFormatter: IndexFormatter,
  data: ReadonlyArray<ChartDatum>,
): XAxisProps {
  const labelWidth = Math.max(
    0,
    ...data.map((row) =>
      estimateLabelWidth(indexFormatter(String(row[index]))),
    ),
  )
  return {
    ...INDEX_AXIS_BASE,
    dataKey: index,
    interval: 0,
    tick: <CategoryTick labelWidth={labelWidth} />,
    tickFormatter: (value: unknown) => indexFormatter(String(value)),
  }
}

/** Data field holding the timestamp of each row on a time axis. */
const TIME_KEY = '__time'

/**
 * Index axis of a line / area chart, category or time-scaled: the rows to
 * plot, the X axis props, the tooltip heading formatter and the position of
 * an index value on the axis (`undefined` when it cannot be placed).
 */
function useIndexAxis<TDatum extends ChartDatum>({
  data,
  index,
  indexScale = 'category',
  indexFormatter,
  tooltipIndexFormatter,
}: {
  data: ReadonlyArray<TDatum>
  index: string
  indexScale?: ChartIndexScale
  indexFormatter: IndexFormatter
  tooltipIndexFormatter: IndexFormatter
}): {
  rows: ChartDatum[]
  axisProps: XAxisProps
  tooltipLabelFormatter: IndexFormatter
  position: (value: string) => string | number | undefined
} {
  return React.useMemo(() => {
    if (indexScale !== 'time') {
      return {
        rows: data as unknown as ChartDatum[],
        axisProps: indexAxisProps(index, indexFormatter, data),
        tooltipLabelFormatter: tooltipIndexFormatter,
        position: (value: string) => value,
      }
    }
    const rows = data
      .flatMap((row) => {
        const time = calendarToTime(String(row[index]))
        return time === undefined ? [] : [{ ...row, [TIME_KEY]: time }]
      })
      .sort((a, b) => a[TIME_KEY] - b[TIME_KEY])
    const domain = timeDomain(
      rows[0]?.[TIME_KEY] ?? 0,
      rows[rows.length - 1]?.[TIME_KEY] ?? 0,
    )
    const { ticks, format } = timeTicks(domain[0], domain[1])
    return {
      rows,
      axisProps: {
        ...INDEX_AXIS_BASE,
        dataKey: TIME_KEY,
        // Calendar ticks are already few (at most 5); Recharts only drops
        // one if it would still touch its neighbour.
        minTickGap: 12,
        interval: 'preserveStartEnd',
        tickFormatter: (value: unknown) => format(Number(value)),
        type: 'number',
        scale: 'time',
        domain,
        ticks,
      },
      tooltipLabelFormatter: (label: string) =>
        tooltipIndexFormatter(timeToCalendar(Number(label))),
      position: calendarToTime,
    }
  }, [data, index, indexScale, indexFormatter, tooltipIndexFormatter])
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
 * Works on cents: a round step in cents is a round step in euros. The step
 * never goes below `minStep` (one cent), so ticks never round onto each
 * other; they are unique, ascending and free of `-0` (Recharts keys axis
 * ticks by value, so a repeated tick is a duplicate React key). An all-zero
 * range gets a `0 → 100 × minStep` axis (`0 €`, `1 €`).
 */
function niceTicks(min: number, max: number, count = 5, minStep = 1): number[] {
  let low = Math.min(min, max)
  let high = Math.max(min, max)
  if (low === high) {
    if (low === 0) return [0, 100 * minStep]
    const pad = Math.abs(low) * 0.1
    low -= pad
    high += pad
  }
  const step = Math.max(
    minStep,
    niceStep((high - low) / Math.max(1, count - 1)),
  )
  const first = Math.floor(low / step)
  const last = Math.ceil(high / step)
  const ticks: number[] = []
  for (let i = first; i <= last; i++) {
    const value = Number.isInteger(step)
      ? i * step
      : Number((i * step).toPrecision(12))
    // `+ 0` turns `-0` into `0`.
    ticks.push(value + 0)
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

/** Which end of a horizontal reference line carries its label. */
type ReferenceLabelSide = 'start' | 'end'

/** Rows under a label at the end of the line (two bands on a phone). */
const LABEL_EDGE_ROWS = 2

/**
 * Share of the value range around the line that the label covers (a 16 px
 * tag on a ~200 px plot, rounded up).
 */
const LABEL_VALUE_MARGIN = 0.08

/**
 * End of a horizontal reference line where its label covers no bar: the
 * end (right) by default, the start when the last bars reach the line (or
 * come close enough to touch the label) and the first ones do not. The
 * label has its own background either way, so it stays readable when both
 * ends are crossed.
 */
function referenceLabelSide(
  data: ReadonlyArray<ChartDatum>,
  keys: string[],
  value: number,
  stacked = false,
): ReferenceLabelSide {
  const [low, high] = valueExtent(data, keys, {
    stacked,
    includeZero: true,
    referenceLines: [{ value }],
  })
  const margin = (high - low) * LABEL_VALUE_MARGIN
  const reaches = (row: ChartDatum) => {
    const [min, max] = valueExtent([row], keys, { stacked })
    return value >= 0 ? max >= value - margin : min <= value + margin
  }
  const atEnd = data.slice(-LABEL_EDGE_ROWS).some(reaches)
  const atStart = data.slice(0, LABEL_EDGE_ROWS).some(reaches)
  return atEnd && !atStart ? 'start' : 'end'
}

/** Average advance of an 11 px label character. */
const REFERENCE_LABEL_CHAR_WIDTH = 6.5
const REFERENCE_LABEL_HEIGHT = 16

/**
 * Label of a horizontal reference line: a small tag sitting on the line at
 * one end of the plot, on the chart surface with a hairline border, so it
 * reads the same over a bar, a line or the empty plot, in light and dark.
 */
function ReferenceLineLabel({
  text,
  side = 'end',
  viewBox,
}: {
  text: string
  side?: ReferenceLabelSide
  viewBox?: { x?: number; y?: number; width?: number }
}) {
  if (viewBox?.x === undefined || viewBox.y === undefined) return null
  const width = estimateLabelWidth(text, REFERENCE_LABEL_CHAR_WIDTH) + 2 * 5
  const left =
    side === 'end' ? viewBox.x + (viewBox.width ?? 0) - width : viewBox.x
  return (
    <g data-slot="chart-reference-label" data-side={side}>
      <rect
        x={left}
        y={viewBox.y - REFERENCE_LABEL_HEIGHT / 2}
        width={width}
        height={REFERENCE_LABEL_HEIGHT}
        rx={4}
        fill="var(--chart-surface)"
        stroke="var(--chart-target)"
        strokeWidth={1}
      />
      <text
        x={left + width / 2}
        y={viewBox.y}
        dy="0.35em"
        textAnchor="middle"
        fontSize={11}
        fill="var(--muted-foreground)"
      >
        {text}
      </text>
    </g>
  )
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
  ReferenceLineLabel,
  categoryTickIndices,
  referenceLabelSide,
  ZERO_LINE_PROPS,
  buildChartSummary,
  indexAxisProps,
  niceTicks,
  useCartesianDefaults,
  valueAxisProps,
  valueExtent,
  useIndexAxis,
  type CartesianChartProps,
  type ChartIndexReferenceLine,
  type ChartIndexScale,
  type ChartReferenceLine,
  type ReferenceLabelSide,
  type TimeSeriesChartProps,
}
