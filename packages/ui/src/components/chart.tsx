/**
 * Charts & finance KPI primitives.
 *
 * All monetary inputs are integer **cents**; they are converted to euros only
 * when formatted (`formatEuros`, `formatCompactEuros`, …). Period keys are
 * calendar strings (`YYYY-MM`, `YYYY-MM-DD`), formatted in French without any
 * time-zone shift.
 *
 * Building blocks: `ChartContainer`, `ChartTooltip(Content)`,
 * `ChartLegend(Content)`, `ChartDataTable`. Ready-made: `BarChart`,
 * `LineChart`, `AreaChart`, `DonutChart`, `Sparkline`, `StatCard`,
 * `ProgressMeter`.
 */

export * from './chart/bar-chart'
export {
  buildChartSummary,
  niceTicks,
  valueExtent,
  type CartesianChartProps,
  type ChartIndexReferenceLine,
  type ChartIndexScale,
  type ChartReferenceLine,
  type TimeSeriesChartProps,
} from './chart/cartesian'
export * from './chart/chart-container'
export * from './chart/donut-chart'
export * from './chart/format'
export * from './chart/line-chart'
export * from './chart/progress-meter'
export * from './chart/sparkline'
export * from './chart/stat-card'
