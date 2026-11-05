import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import { expect } from 'storybook/test'

import {
  ChartContainer,
  ChartDataTable,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  chartSeriesColor,
} from './chart-container'
import { cashflow2026, cashflowConfig } from './chart.fixtures'
import { ChartFrame, DARK, findChartGraphic, MOBILE } from './chart.story-utils'
import {
  formatCompactEuros,
  formatEuros,
  formatMonthLong,
  formatMonthShort,
} from './format'

const meta = {
  title: 'Charts/ChartContainer',
  component: ChartContainer,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Low-level building blocks for charts the ready-made components do not cover. `ChartContainer` takes a `config` (data key → label + colour token), exposes each series colour as `var(--color-<key>)` (`chartSeriesColor(key)`), styles axes and grid with the theme tokens, sets `role="img"` + `aria-label` on the graphic and renders a same-size placeholder during SSR. Compose it with Recharts primitives, `ChartTooltipContent`, `ChartLegendContent` and `ChartDataTable`.',
      },
    },
  },
  args: {
    config: cashflowConfig,
    label: 'Revenus et dépenses en barres, épargne en courbe, 2026',
    children: <></>,
  },
  render: (args) => (
    <ChartFrame title="Composition libre" description="Barres + courbe, 2026">
      <ChartContainer
        {...args}
        footer={
          <>
            <ChartLegendContent />
            <ChartDataTable
              data={cashflow2026}
              index="month"
              caption={args.label}
              indexFormatter={formatMonthLong}
            />
          </>
        }
      >
        <ComposedChart
          data={cashflow2026}
          margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={12}
            tickFormatter={formatMonthShort}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width="auto"
            tickFormatter={formatCompactEuros}
          />
          <ChartTooltip
            content={<ChartTooltipContent labelFormatter={formatMonthLong} />}
          />
          <ReferenceLine
            y={0}
            stroke="var(--muted-foreground)"
            strokeOpacity={0.5}
          />
          <Bar
            dataKey="income"
            fill={chartSeriesColor('income')}
            radius={[4, 4, 0, 0]}
            maxBarSize={16}
          />
          <Bar
            dataKey="expenses"
            fill={chartSeriesColor('expenses')}
            radius={[4, 4, 0, 0]}
            maxBarSize={16}
          />
          <Line
            dataKey="savings"
            type="monotone"
            stroke={chartSeriesColor('savings')}
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ChartContainer>
    </ChartFrame>
  ),
} satisfies Meta<typeof ChartContainer>

export default meta
type Story = StoryObj<typeof meta>

export const Composition: Story = {
  play: async ({ canvasElement }) => {
    const graphic = await findChartGraphic(canvasElement, /épargne en courbe/)
    await expect(graphic).toHaveAttribute('role', 'img')
    const table = canvasElement.querySelector(
      '[data-slot="chart-data-table"] table',
    )
    await expect(table?.textContent).toContain(
      formatEuros(cashflow2026[0]!.income),
    )
  },
}

export const CompositionDark: Story = { globals: DARK }

export const CompositionMobile: Story = {
  globals: MOBILE,
  parameters: { layout: 'padded' },
}

const PALETTE: { token: string; label: string }[] = [
  { token: '--chart-1', label: '1 · bleu' },
  { token: '--chart-2', label: '2 · orange' },
  { token: '--chart-3', label: '3 · aqua' },
  { token: '--chart-4', label: '4 · jaune' },
  { token: '--chart-5', label: '5 · magenta' },
  { token: '--chart-6', label: '6 · vert' },
  { token: '--chart-7', label: '7 · violet' },
  { token: '--chart-8', label: '8 · rouge' },
  { token: '--chart-other', label: 'Autres' },
]

const SEMANTIC: { token: string; label: string }[] = [
  { token: '--chart-income', label: 'Revenus' },
  { token: '--chart-expense', label: 'Dépenses' },
  { token: '--chart-savings', label: 'Épargne / net' },
  { token: '--chart-target', label: 'Objectif / neutre' },
  { token: '--chart-warning', label: 'Alerte (budget)' },
  { token: '--chart-over', label: 'Dépassement' },
]

function Swatches({ items }: { items: { token: string; label: string }[] }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
      {items.map((item) => (
        <li key={item.token} className="flex items-center gap-2 text-xs">
          <span
            className="size-6 shrink-0 rounded-md"
            style={{ backgroundColor: `var(${item.token})` }}
          />
          <span className="grid">
            <span className="text-foreground">{item.label}</span>
            <code className="text-muted-foreground">{item.token}</code>
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The chart tokens from `globals.css`. Categorical slots are assigned in this
 * fixed order and never cycled; the finance semantics were validated together
 * for colour-vision deficiencies against the card surface, in both themes.
 */
export const Palette: Story = {
  render: () => (
    <ChartFrame title="Palette des graphiques">
      <div className="grid gap-5">
        <Swatches items={PALETTE} />
        <Swatches items={SEMANTIC} />
      </div>
    </ChartFrame>
  ),
}

export const PaletteDark: Story = { ...Palette, globals: DARK }
