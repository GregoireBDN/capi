'use client'

import * as React from 'react'
import * as RechartsPrimitive from 'recharts'
import type { LegendPayload, TooltipContentProps } from 'recharts'

import { cn } from '../../lib/utils'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../table'
import {
  formatEuros,
  formatPercent,
  type IndexFormatter,
  type ValueFormatter,
} from './format'

/* ============================================================================
 * TYPES
 * ========================================================================= */

/** One series (or slice) of a chart. */
type ChartSeriesConfig = {
  /** Human-readable name: legend, tooltip, data table and aria summary. */
  label: string
  /**
   * Any CSS colour, ideally a token such as `var(--chart-income)` or
   * `var(--chart-1)`. Defaults to the categorical slot matching the series
   * position (1 → `--chart-1`, …, 9+ → `--chart-other`).
   */
  color?: string
}

/**
 * Maps a data key to its label and colour. Key order is series order (legend,
 * tooltip, stacking, default colours).
 */
type ChartConfig = Record<string, ChartSeriesConfig>

type ResolvedChartConfig = Record<string, Required<ChartSeriesConfig>>

/** A row of chart data: one index field (period, category) + numeric series. */
type ChartDatum = Record<string, unknown>

/** How the data-table twin of a chart is rendered. */
type ChartDataTableMode = 'sr-only' | 'details' | 'none'

type ChartContextValue = { config: ResolvedChartConfig }

/* ============================================================================
 * PALETTE HELPERS
 * ========================================================================= */

/** Number of categorical slots (`--chart-1` … `--chart-8`). */
const CHART_CATEGORICAL_SLOTS = 8

/**
 * Categorical colour for the series at `index` (0-based). Hues are assigned in
 * a fixed order and never cycled: past the 8th series, everything is
 * `--chart-other` — fold the tail into an "Autres" bucket instead.
 */
function chartCategoricalColor(index: number): string {
  return index >= 0 && index < CHART_CATEGORICAL_SLOTS
    ? `var(--chart-${index + 1})`
    : 'var(--chart-other)'
}

function seriesVariable(key: string): `--${string}` {
  return `--color-${key.replace(/[^\w-]/g, '-')}`
}

/** CSS colour of a series inside a `ChartContainer` (`var(--color-<key>)`). */
function chartSeriesColor(key: string): string {
  return `var(${seriesVariable(key)})`
}

function resolveChartConfig(config: ChartConfig): ResolvedChartConfig {
  return Object.fromEntries(
    Object.entries(config).map(([key, series], position) => [
      key,
      {
        label: series.label,
        color: series.color ?? chartCategoricalColor(position),
      },
    ]),
  )
}

/* ============================================================================
 * CONTEXT & HOOKS
 * ========================================================================= */

const ChartContext = React.createContext<ChartContextValue | null>(null)

/** Reads the resolved series config of the closest `ChartContainer`. */
function useChart(): ChartContextValue {
  const context = React.useContext(ChartContext)
  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />')
  }
  return context
}

const subscribeNoop = () => () => {}

/**
 * `false` during SSR and hydration, `true` once mounted in the browser.
 * Recharts measures the DOM, so charts only render client-side; the server
 * renders a placeholder of the same size instead.
 */
function useIsMounted(): boolean {
  return React.useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  )
}

/* ============================================================================
 * CHART CONTAINER
 * ========================================================================= */

type ChartContainerProps = Omit<React.ComponentProps<'div'>, 'children'> & {
  /** Series config: data key → label + colour. */
  config: ChartConfig
  /**
   * Accessible summary of what the chart shows. Becomes the `aria-label` of
   * the chart graphic (`role="img"`).
   */
  label: string
  /**
   * Plot height in px, axes included (default `240`). The SSR placeholder has
   * the same height, so hydration causes no layout shift.
   */
  height?: number
  /** A single Recharts chart element (`BarChart`, `LineChart`, …). */
  children: React.ReactElement
  /** Rendered under the plot, inside the chart context (legend, data table). */
  footer?: React.ReactNode
  /** Decorative layer drawn over the plot (e.g. a donut's centre total). */
  overlay?: React.ReactNode
}

/**
 * ChartContainer
 * Responsive, themed wrapper around a Recharts chart. Exposes every series
 * colour as a CSS variable (`--color-<key>`), styles axes/grid with the design
 * tokens (light/dark aware) and guards SSR with a same-size placeholder.
 *
 * @example
 * <ChartContainer config={{ income: { label: 'Revenus', color: 'var(--chart-income)' } }} label="Revenus par mois">
 *   <BarChart data={data}><Bar dataKey="income" fill={chartSeriesColor('income')} /></BarChart>
 * </ChartContainer>
 */
function ChartContainer({
  config,
  label,
  height = 240,
  children,
  footer,
  overlay,
  className,
  style,
  ...props
}: ChartContainerProps) {
  const resolved = React.useMemo(() => resolveChartConfig(config), [config])
  const mounted = useIsMounted()

  const cssVariables = React.useMemo(
    () =>
      Object.fromEntries(
        Object.entries(resolved).map(([key, series]) => [
          seriesVariable(key),
          series.color,
        ]),
      ) as React.CSSProperties,
    [resolved],
  )

  // The <svg> itself carries role="img" + the summary: it stays focusable for
  // Recharts' keyboard navigation (arrow keys move the tooltip).
  const chart = React.cloneElement(
    children as React.ReactElement<Record<string, unknown>>,
    { role: 'img', 'aria-label': label },
  )

  return (
    <ChartContext.Provider value={{ config: resolved }}>
      <div
        data-slot="chart"
        className={cn('flex w-full min-w-0 flex-col gap-3', className)}
        style={{ ...cssVariables, ...style }}
        {...props}
      >
        <div
          data-slot="chart-plot"
          className={cn(
            [
              // Layout
              'relative w-full min-w-0 text-xs',

              // Axes & grid: recessive hairlines, muted tabular ticks
              '[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground',
              '[&_.recharts-cartesian-axis-tick_text]:tabular-nums',
              '[&_.recharts-cartesian-grid_line]:stroke-border',
              '[&_.recharts-reference-line_text]:fill-muted-foreground',

              // Hover band behind the active category
              '[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted',
              '[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border',

              // Focus: keyboard users get a visible ring on the chart graphic
              '[&_.recharts-surface]:outline-none',
              '[&_.recharts-surface:focus-visible]:outline-2',
              '[&_.recharts-surface:focus-visible]:outline-offset-2',
              '[&_.recharts-surface:focus-visible]:outline-ring',
              '[&_.recharts-sector]:outline-none',
              '[&_.recharts-layer]:outline-none',
            ].join(' '),
          )}
          style={{ height }}
        >
          {mounted ? (
            <RechartsPrimitive.ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 320, height }}
            >
              {chart}
            </RechartsPrimitive.ResponsiveContainer>
          ) : (
            <div
              data-slot="chart-placeholder"
              role="img"
              aria-label={label}
              className="size-full animate-pulse rounded-md bg-muted/60"
            />
          )}
          {overlay ? (
            <div
              data-slot="chart-overlay"
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              {overlay}
            </div>
          ) : null}
        </div>
        {footer}
      </div>
    </ChartContext.Provider>
  )
}

/* ============================================================================
 * CHART EMPTY
 * ========================================================================= */

type ChartEmptyProps = React.ComponentProps<'div'> & {
  /** Same height as the chart it replaces (default `240`). */
  height?: number
}

/** Placeholder shown instead of a chart when there is no data. */
function ChartEmpty({
  height = 240,
  className,
  style,
  children,
  ...props
}: ChartEmptyProps) {
  return (
    <div
      data-slot="chart-empty"
      className={cn(
        'flex w-full items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm text-muted-foreground',
        className,
      )}
      style={{ height, ...style }}
      {...props}
    >
      {children ?? 'Aucune donnée pour cette période'}
    </div>
  )
}

/* ============================================================================
 * TOOLTIP
 * ========================================================================= */

/** Recharts `Tooltip`, re-exported. Pass `content={<ChartTooltipContent />}`. */
const ChartTooltip = RechartsPrimitive.Tooltip

type ChartTooltipContentProps = Partial<
  Pick<TooltipContentProps<number, string>, 'active' | 'payload' | 'label'>
> & {
  className?: string
  /** Formats each value (default: cents → `1 234,56 €`). */
  valueFormatter?: ValueFormatter
  /** Formats the heading (period / category), e.g. `formatMonthLong`. */
  labelFormatter?: IndexFormatter
  /** Hides the heading (e.g. donut slices, where the series name is enough). */
  hideLabel?: boolean
  /** Series key: a short line (lines, default) or a square (bars, slices). */
  indicator?: 'line' | 'square'
  /** When set, each row also shows its share of this total. */
  total?: number
  /**
   * Extra fields of the hovered row (field → label), listed after the series
   * when not zero, without a colour key (e.g. `Dont ponctuel`).
   */
  details?: Readonly<Record<string, string>>
}

/**
 * ChartTooltipContent
 * Themed tooltip body: the value is the strong element, the series name is
 * secondary. Same content on hover, touch and keyboard focus.
 */
function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  valueFormatter = formatEuros,
  labelFormatter,
  hideLabel = false,
  indicator = 'line',
  total,
  details,
}: ChartTooltipContentProps) {
  const { config } = useChart()

  if (!active || !payload?.length) return null

  const items = payload.filter(
    (item) => item.type !== 'none' && typeof item.value === 'number',
  )
  if (!items.length) return null

  const row = items[0]?.payload as Record<string, unknown> | undefined
  const extras = Object.entries(details ?? {}).flatMap(([key, name]) => {
    const value = row?.[key]
    return typeof value === 'number' && value !== 0
      ? [{ key, name, value }]
      : []
  })

  const heading =
    hideLabel || label === undefined || label === ''
      ? null
      : labelFormatter
        ? labelFormatter(String(label))
        : String(label)

  return (
    <div
      data-slot="chart-tooltip"
      className={cn(
        'grid min-w-40 gap-1.5 rounded-lg border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-lg',
        className,
      )}
    >
      {heading ? <div className="font-medium">{heading}</div> : null}
      <div className="grid gap-1">
        {items.map((item, position) => {
          const series =
            config[String(item.dataKey)] ?? config[String(item.name)]
          const name = series?.label ?? String(item.name ?? item.dataKey)
          const color =
            series?.color ??
            item.color ??
            (item.payload as { fill?: string } | undefined)?.fill
          const value = item.value as number

          return (
            <div
              key={`${String(item.dataKey)}-${position}`}
              className="flex items-center gap-2"
            >
              <span
                aria-hidden
                className={cn(
                  'shrink-0',
                  indicator === 'line'
                    ? 'h-0.5 w-3 rounded-full'
                    : 'size-2.5 rounded-[3px]',
                )}
                style={{ backgroundColor: color }}
              />
              <span className="text-muted-foreground">{name}</span>
              <span className="ml-auto pl-3 font-semibold text-foreground tabular-nums">
                {valueFormatter(value)}
              </span>
              {total ? (
                <span className="text-muted-foreground tabular-nums">
                  {formatPercent(value / total)}
                </span>
              ) : null}
            </div>
          )
        })}
        {extras.map(({ key, name, value }) => (
          <div
            key={key}
            data-slot="chart-tooltip-detail"
            className="flex items-center gap-2"
          >
            {/* No colour key: a detail of the row, not a drawn series. */}
            <span
              aria-hidden
              className={cn('shrink-0', indicator === 'line' ? 'w-3' : 'w-2.5')}
            />
            <span className="text-muted-foreground">{name}</span>
            <span className="ml-auto pl-3 text-foreground tabular-nums">
              {valueFormatter(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ============================================================================
 * LEGEND
 * ========================================================================= */

/** Recharts `Legend`, re-exported. Pass `content={<ChartLegendContent />}`. */
const ChartLegend = RechartsPrimitive.Legend

type ChartLegendContentProps = {
  className?: string
  /** Provided by Recharts when used as `<ChartLegend content={…} />`. */
  payload?: ReadonlyArray<LegendPayload>
  /** Series to list, in order (default: every key of the config). */
  keys?: string[]
  /** Mirrors the mark: square for bars/areas/slices, line for lines. */
  marker?: 'square' | 'line'
  /** Optional value printed after each label (e.g. donut amounts). */
  values?: Record<string, React.ReactNode>
}

/**
 * ChartLegendContent
 * Wrapping legend list. Works standalone (reads the series from the closest
 * `ChartContainer`) or as the `content` of a Recharts `Legend`.
 */
function ChartLegendContent({
  className,
  payload,
  keys,
  marker = 'square',
  values,
}: ChartLegendContentProps) {
  const { config } = useChart()

  const entries = payload
    ? payload.map((item) => String(item.dataKey ?? item.value))
    : (keys ?? Object.keys(config))

  if (!entries.length) return null

  return (
    <ul
      data-slot="chart-legend"
      aria-label="Légende"
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs',
        className,
      )}
    >
      {entries.map((key) => {
        const series = config[key]
        if (!series) return null
        return (
          <li key={key} className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                'shrink-0',
                marker === 'line'
                  ? 'h-0.5 w-3 rounded-full'
                  : 'size-2.5 rounded-[3px]',
              )}
              style={{ backgroundColor: series.color }}
            />
            <span className="text-muted-foreground">{series.label}</span>
            {values?.[key] !== undefined ? (
              <span className="font-medium text-foreground tabular-nums">
                {values[key]}
              </span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/* ============================================================================
 * DATA TABLE
 * ========================================================================= */

type ChartDataTableProps = {
  /** Rows of the chart. */
  data: ReadonlyArray<ChartDatum>
  /** Field holding the row label (period, category). */
  index: string
  /** Header of the index column (default `Période`). */
  indexLabel?: string
  /** Table caption — usually the chart title. */
  caption: string
  /** Series columns, in order (default: every key of the config). */
  keys?: string[]
  /** Column headers for keys that are not in the chart config. */
  columnLabels?: Record<string, string>
  /** Formats each cell (default: cents → euros). */
  valueFormatter?: ValueFormatter
  /** Formats each row label (e.g. `formatMonthLong`). */
  indexFormatter?: IndexFormatter
  /** `sr-only` (default): for screen readers only; `details`: a visible, collapsible table. */
  variant?: Exclude<ChartDataTableMode, 'none'>
  className?: string
}

/**
 * ChartDataTable
 * The table twin of a chart: every value is reachable without the tooltip and
 * without relying on colour. Visually hidden by default.
 */
function ChartDataTable({
  data,
  index,
  indexLabel = 'Période',
  caption,
  keys,
  columnLabels,
  valueFormatter = formatEuros,
  indexFormatter,
  variant = 'sr-only',
  className,
}: ChartDataTableProps) {
  const { config } = useChart()
  const columns = keys ?? Object.keys(config)

  const table = (
    <Table>
      <TableCaption className={variant === 'details' ? 'sr-only' : undefined}>
        {caption}
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{indexLabel}</TableHead>
          {columns.map((key) => (
            <TableHead key={key} scope="col" className="text-right">
              {columnLabels?.[key] ?? config[key]?.label ?? key}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, position) => {
          const rowLabel = String(row[index] ?? '')
          return (
            <TableRow key={`${rowLabel}-${position}`}>
              <TableHead scope="row" className="font-normal">
                {indexFormatter ? indexFormatter(rowLabel) : rowLabel}
              </TableHead>
              {columns.map((key) => {
                const value = row[key]
                return (
                  <TableCell key={key} className="text-right tabular-nums">
                    {typeof value === 'number' ? valueFormatter(value) : '—'}
                  </TableCell>
                )
              })}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )

  if (variant === 'details') {
    return (
      <details
        data-slot="chart-data-table"
        className={cn('group text-xs', className)}
      >
        <summary className="relative w-fit cursor-pointer pointer-coarse:touch-hitbox rounded-sm text-muted-foreground select-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          Voir les données
        </summary>
        <div className="mt-2">{table}</div>
      </details>
    )
  }

  return (
    <div data-slot="chart-data-table" className={cn('sr-only', className)}>
      {table}
    </div>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export {
  CHART_CATEGORICAL_SLOTS,
  ChartContainer,
  ChartDataTable,
  ChartEmpty,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  chartCategoricalColor,
  chartSeriesColor,
  resolveChartConfig,
  useChart,
  useIsMounted,
  type ChartConfig,
  type ChartContainerProps,
  type ChartDataTableMode,
  type ChartDataTableProps,
  type ChartDatum,
  type ChartEmptyProps,
  type ChartLegendContentProps,
  type ChartSeriesConfig,
  type ChartTooltipContentProps,
  type ResolvedChartConfig,
}
