'use client'

import * as React from 'react'
import {
  Bar,
  CartesianGrid,
  BarChart as RechartsBarChart,
  Rectangle,
  ReferenceLine,
  XAxis,
  YAxis,
  type BarShapeProps,
} from 'recharts'

import {
  CartesianFooter,
  indexAxisProps,
  REFERENCE_LINE_PROPS,
  useCartesianDefaults,
  valueAxisProps,
  valueExtent,
  ZERO_LINE_PROPS,
  type CartesianChartProps,
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

type BarChartProps<TDatum extends ChartDatum> = CartesianChartProps<TDatum> & {
  /**
   * Stacks the series in one column per row. Negative values (e.g. expenses
   * stored as negative cents) stack below the zero baseline. Default: grouped
   * columns, side by side.
   */
  stacked?: boolean
}

/* ============================================================================
 * CONSTANTS
 * ========================================================================= */

/** Bars are capped so they never fill the band: the leftover is air. */
const MAX_BAR_SIZE = 24
/** Rounded data-end, square at the baseline. */
const BAR_RADIUS = 4
/** Surface gap between stacked segments. */
const STACK_GAP = 2

/* ============================================================================
 * HELPERS
 * ========================================================================= */

type OuterKeys = { positive?: string; negative?: string }

/**
 * For each row, finds the outermost series on each side of zero: only that
 * segment gets the rounded data-end in a stacked column.
 */
function findOuterKeys(
  data: ReadonlyArray<ChartDatum>,
  keys: string[],
): OuterKeys[] {
  return data.map((row) => {
    const outer: OuterKeys = {}
    for (const key of keys) {
      const value = row[key]
      if (typeof value !== 'number' || value === 0) continue
      if (value > 0) outer.positive = key
      else outer.negative = key
    }
    return outer
  })
}

/* ============================================================================
 * COMPONENT
 * ========================================================================= */

/**
 * BarChart
 * Vertical columns, grouped or stacked, with a zero baseline and support for
 * negative values. All monetary values are integer **cents**.
 *
 * @example
 * <BarChart
 *   data={[{ month: '2026-01', income: 320000, expenses: -245000 }]}
 *   index="month"
 *   config={{
 *     income: { label: 'Revenus', color: 'var(--chart-income)' },
 *     expenses: { label: 'Dépenses', color: 'var(--chart-expense)' },
 *   }}
 *   indexFormatter={formatMonthShort}
 *   tooltipIndexFormatter={formatMonthLong}
 * />
 */
function BarChart<TDatum extends ChartDatum>(props: BarChartProps<TDatum>) {
  const {
    data,
    index,
    config,
    stacked = false,
    referenceLines,
    emptyMessage,
    indexLabel,
    className,
  } = props
  const defaults = useCartesianDefaults(
    props,
    stacked ? 'Graphique en barres empilées' : 'Graphique en barres',
  )
  const { keys } = defaults

  const outerKeys = React.useMemo(
    () => findOuterKeys(data, Object.keys(config)),
    [data, config],
  )

  if (!data.length) {
    return (
      <ChartEmpty height={defaults.height} className={className}>
        {emptyMessage}
      </ChartEmpty>
    )
  }

  const gapped = stacked && keys.length > 1

  const renderShape = (key: string) =>
    function BarShape(shape: BarShapeProps) {
      let { y, height } = shape
      const { x, width } = shape
      if (!width || !height) return <g />

      // Normalise to a positive height whatever the Recharts convention.
      if (height < 0) {
        y += height
        height = -height
      }

      const raw = data[shape.index]?.[key]
      const negative = typeof raw === 'number' && raw < 0
      const isEnd =
        !stacked ||
        (negative
          ? outerKeys[shape.index]?.negative === key
          : outerKeys[shape.index]?.positive === key)

      if (gapped) {
        y += STACK_GAP / 2
        height = Math.max(0, height - STACK_GAP)
      }

      const r = isEnd ? Math.min(BAR_RADIUS, width / 2, height) : 0
      const radius: [number, number, number, number] = negative
        ? [0, 0, r, r]
        : [r, r, 0, 0]

      return (
        <Rectangle
          x={x}
          y={y}
          width={width}
          height={height}
          radius={radius}
          fill={shape.fill}
        />
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
      <RechartsBarChart
        data={data as TDatum[]}
        margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
        stackOffset={stacked ? 'sign' : undefined}
        barGap={2}
        barCategoryGap="20%"
      >
        {defaults.showGrid ? <CartesianGrid vertical={false} /> : null}
        <XAxis {...indexAxisProps(index, defaults.indexFormatter)} />
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
          content={
            <ChartTooltipContent
              indicator="square"
              valueFormatter={defaults.valueFormatter}
              labelFormatter={defaults.tooltipIndexFormatter}
            />
          }
        />
        {keys.map((key) => (
          <Bar
            key={key}
            dataKey={key}
            name={config[key]?.label}
            fill={chartSeriesColor(key)}
            stackId={stacked ? 'stack' : undefined}
            maxBarSize={MAX_BAR_SIZE}
            shape={renderShape(key)}
          />
        ))}
        <ReferenceLine {...ZERO_LINE_PROPS} />
        {referenceLines?.map((line) => (
          <ReferenceLine
            key={`${line.value}-${line.label ?? ''}`}
            y={line.value}
            {...REFERENCE_LINE_PROPS}
            label={
              line.label
                ? {
                    value: line.label,
                    position: 'insideTopRight',
                    fontSize: 11,
                  }
                : undefined
            }
          />
        ))}
      </RechartsBarChart>
    </ChartContainer>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export { BarChart, type BarChartProps }
