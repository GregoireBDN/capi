'use client'

import {
  Area,
  CartesianGrid,
  Line,
  AreaChart as RechartsAreaChart,
  LineChart as RechartsLineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'

import {
  CartesianFooter,
  REFERENCE_LINE_PROPS,
  useCartesianDefaults,
  useIndexAxis,
  valueAxisProps,
  valueExtent,
  ZERO_LINE_PROPS,
  type CartesianChartProps,
  type ChartIndexReferenceLine,
  type TimeSeriesChartProps,
} from './cartesian'
import {
  ChartContainer,
  ChartEmpty,
  ChartTooltip,
  ChartTooltipContent,
  chartSeriesColor,
  type ChartDatum,
} from './chart-container'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type LineChartProps<TDatum extends ChartDatum> = CartesianChartProps<TDatum> &
  TimeSeriesChartProps & {
    /**
     * Forces the value axis to start at zero. Default `false`: the axis fits the
     * data, which shows the trend of slow-moving series such as net worth.
     */
    zeroBaseline?: boolean
  }

type AreaChartProps<TDatum extends ChartDatum> = CartesianChartProps<TDatum> &
  TimeSeriesChartProps & {
    /** Stacks the areas (part-to-whole over time). Default: overlapping. */
    stacked?: boolean
  }

/* ============================================================================
 * CONSTANTS
 * ========================================================================= */

const LINE_WIDTH = 2
/** Active marker: r=4 (8px) with a 2px ring in the surface colour. */
const ACTIVE_DOT = {
  r: 4,
  strokeWidth: 2,
  stroke: 'var(--chart-surface)',
} as const
/** Area fills are a wash, never a saturated block. */
const AREA_FILL_OPACITY = 0.12
const CURSOR = { stroke: 'var(--border)', strokeWidth: 1 } as const
const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 } as const
/** Extra top room for the labels of vertical reference lines. */
const MARGIN_WITH_INDEX_LABELS = { ...MARGIN, top: 24 } as const

/* ============================================================================
 * HELPERS
 * ========================================================================= */

function hasNegativeValue(
  data: ReadonlyArray<ChartDatum>,
  keys: string[],
): boolean {
  return data.some((row) =>
    keys.some((key) => {
      const value = row[key]
      return typeof value === 'number' && value < 0
    }),
  )
}

function referenceLineElements(
  lines: CartesianChartProps<ChartDatum>['referenceLines'],
) {
  return lines?.map((line) => (
    <ReferenceLine
      key={`${line.value}-${line.label ?? ''}`}
      y={line.value}
      {...REFERENCE_LINE_PROPS}
      label={
        line.label
          ? { value: line.label, position: 'insideTopRight', fontSize: 11 }
          : undefined
      }
    />
  ))
}

/**
 * Label of a vertical reference line: above the plot, reading rightwards
 * from the line, so it clears the value-axis labels on the left.
 */
function IndexLineLabel({
  text,
  viewBox,
}: {
  text: string
  viewBox?: { x?: number; y?: number }
}) {
  if (viewBox?.x === undefined || viewBox.y === undefined) return null
  return (
    <text
      x={viewBox.x + 4}
      y={viewBox.y - 8}
      textAnchor="start"
      fontSize={11}
      fill="var(--muted-foreground)"
    >
      {text}
    </text>
  )
}

/** Vertical reference lines (e.g. today), labelled above the plot. */
function indexReferenceLineElements(
  lines: ReadonlyArray<ChartIndexReferenceLine> | undefined,
  position: (value: string) => string | number | undefined,
) {
  return lines?.flatMap((line) => {
    const x = position(line.value)
    if (x === undefined) return []
    return [
      <ReferenceLine
        key={`index-${line.value}-${line.label ?? ''}`}
        x={x}
        {...REFERENCE_LINE_PROPS}
        label={line.label ? <IndexLineLabel text={line.label} /> : undefined}
      />,
    ]
  })
}

/** Chart margin, with room above the plot for vertical line labels. */
function chartMargin(
  lines: ReadonlyArray<ChartIndexReferenceLine> | undefined,
) {
  return lines?.some((line) => line.label) ? MARGIN_WITH_INDEX_LABELS : MARGIN
}

/* ============================================================================
 * LINE CHART
 * ========================================================================= */

/**
 * LineChart
 * Time series (e.g. net worth by month): 2px lines, crosshair tooltip listing
 * every series, optional reference lines. Values are integer **cents**.
 *
 * @example
 * <LineChart
 *   data={[{ month: '2026-01', netWorth: 4250000 }]}
 *   index="month"
 *   config={{ netWorth: { label: 'Patrimoine net', color: 'var(--chart-savings)' } }}
 *   indexFormatter={formatMonthShort}
 *   tooltipIndexFormatter={formatMonthLong}
 * />
 */
function LineChart<TDatum extends ChartDatum>(props: LineChartProps<TDatum>) {
  const {
    data,
    index,
    config,
    zeroBaseline = false,
    referenceLines,
    indexScale,
    indexReferenceLines,
    emptyMessage,
    indexLabel,
    className,
  } = props
  const defaults = useCartesianDefaults(props, 'Courbe')
  const { keys } = defaults
  const indexAxis = useIndexAxis({
    data,
    index,
    indexScale,
    indexFormatter: defaults.indexFormatter,
    tooltipIndexFormatter: defaults.tooltipIndexFormatter,
  })

  if (!data.length) {
    return (
      <ChartEmpty height={defaults.height} className={className}>
        {emptyMessage}
      </ChartEmpty>
    )
  }

  const showZero = zeroBaseline || hasNegativeValue(data, keys)

  return (
    <ChartContainer
      config={config}
      label={defaults.label}
      height={defaults.height}
      className={className}
      footer={
        <CartesianFooter
          showLegend={defaults.showLegend}
          marker="line"
          dataTable={defaults.dataTable}
          data={data}
          index={index}
          indexLabel={indexLabel}
          label={defaults.label}
          valueFormatter={defaults.valueFormatter}
          tooltipIndexFormatter={defaults.tooltipIndexFormatter}
        />
      }
    >
      <RechartsLineChart
        data={indexAxis.rows}
        margin={chartMargin(indexReferenceLines)}
      >
        {defaults.showGrid ? <CartesianGrid vertical={false} /> : null}
        <XAxis {...indexAxis.axisProps} />
        <YAxis
          {...valueAxisProps(
            defaults.axisFormatter,
            valueExtent(data, keys, {
              includeZero: showZero,
              referenceLines,
            }),
          )}
        />
        <ChartTooltip
          cursor={CURSOR}
          content={
            <ChartTooltipContent
              valueFormatter={defaults.valueFormatter}
              labelFormatter={indexAxis.tooltipLabelFormatter}
            />
          }
        />
        {showZero ? <ReferenceLine {...ZERO_LINE_PROPS} /> : null}
        {referenceLineElements(referenceLines)}
        {indexReferenceLineElements(indexReferenceLines, indexAxis.position)}
        {keys.map((key) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            name={config[key]?.label}
            stroke={chartSeriesColor(key)}
            strokeWidth={LINE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ ...ACTIVE_DOT, fill: chartSeriesColor(key) }}
            connectNulls
          />
        ))}
      </RechartsLineChart>
    </ChartContainer>
  )
}

/* ============================================================================
 * AREA CHART
 * ========================================================================= */

/**
 * AreaChart
 * Time series with a light wash under each line, overlapping or stacked.
 * The value axis always includes zero. Values are integer **cents**.
 */
function AreaChart<TDatum extends ChartDatum>(props: AreaChartProps<TDatum>) {
  const {
    data,
    index,
    config,
    stacked = false,
    referenceLines,
    indexScale,
    indexReferenceLines,
    emptyMessage,
    indexLabel,
    className,
  } = props
  const defaults = useCartesianDefaults(
    props,
    stacked ? 'Graphique en aires empilées' : 'Graphique en aires',
  )
  const { keys } = defaults
  const indexAxis = useIndexAxis({
    data,
    index,
    indexScale,
    indexFormatter: defaults.indexFormatter,
    tooltipIndexFormatter: defaults.tooltipIndexFormatter,
  })

  if (!data.length) {
    return (
      <ChartEmpty height={defaults.height} className={className}>
        {emptyMessage}
      </ChartEmpty>
    )
  }

  return (
    <ChartContainer
      config={config}
      label={defaults.label}
      height={defaults.height}
      className={className}
      footer={
        <CartesianFooter
          showLegend={defaults.showLegend}
          marker="square"
          dataTable={defaults.dataTable}
          data={data}
          index={index}
          indexLabel={indexLabel}
          label={defaults.label}
          valueFormatter={defaults.valueFormatter}
          tooltipIndexFormatter={defaults.tooltipIndexFormatter}
        />
      }
    >
      <RechartsAreaChart
        data={indexAxis.rows}
        margin={chartMargin(indexReferenceLines)}
        stackOffset={stacked ? 'sign' : undefined}
      >
        {defaults.showGrid ? <CartesianGrid vertical={false} /> : null}
        <XAxis {...indexAxis.axisProps} />
        <YAxis
          {...valueAxisProps(
            defaults.axisFormatter,
            valueExtent(data, keys, {
              stacked,
              includeZero: true,
              referenceLines,
            }),
          )}
        />
        <ChartTooltip
          cursor={CURSOR}
          content={
            <ChartTooltipContent
              valueFormatter={defaults.valueFormatter}
              labelFormatter={indexAxis.tooltipLabelFormatter}
            />
          }
        />
        {hasNegativeValue(data, keys) ? (
          <ReferenceLine {...ZERO_LINE_PROPS} />
        ) : null}
        {referenceLineElements(referenceLines)}
        {indexReferenceLineElements(indexReferenceLines, indexAxis.position)}
        {keys.map((key) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            name={config[key]?.label}
            stroke={chartSeriesColor(key)}
            strokeWidth={LINE_WIDTH}
            fill={chartSeriesColor(key)}
            fillOpacity={AREA_FILL_OPACITY}
            stackId={stacked ? 'stack' : undefined}
            dot={false}
            activeDot={{ ...ACTIVE_DOT, fill: chartSeriesColor(key) }}
            connectNulls
          />
        ))}
      </RechartsAreaChart>
    </ChartContainer>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export { AreaChart, LineChart, type AreaChartProps, type LineChartProps }
