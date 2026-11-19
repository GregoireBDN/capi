import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'

import {
  investmentConfig,
  investmentSnapshots,
  netWorth2026,
  netWorthConfig,
  savingsAccounts2026,
  savingsAccountsConfig,
} from './chart.fixtures'
import {
  captureReactWarnings,
  ChartFrame,
  DARK,
  expectKeyboardTooltip,
  expectNoDuplicateKeys,
  findChartGraphic,
  MOBILE,
} from './chart.story-utils'
import {
  formatDay,
  formatEuros,
  formatMonthLong,
  formatMonthShort,
} from './format'
import { AreaChart } from './line-chart'

const meta = {
  title: 'Charts/AreaChart',
  component: AreaChart,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Time series with a light wash under each line, overlapping or `stacked` (part-to-whole over time). The value axis always includes zero. `indexScale="time"` spaces `YYYY-MM-DD` rows by date (uneven snapshots); `indexReferenceLines` draws vertical markers. Amounts are **integer cents**.',
      },
    },
  },
  args: {
    data: savingsAccounts2026,
    index: 'month',
    config: savingsAccountsConfig,
    stacked: true,
    indexFormatter: formatMonthShort,
    tooltipIndexFormatter: formatMonthLong,
    label: 'Épargne et placements par compte en fin de mois, 2026',
  },
  render: (args) => (
    <ChartFrame title="Épargne et placements" description="Par compte, 2026">
      <AreaChart {...args} />
    </ChartFrame>
  ),
} satisfies Meta<typeof AreaChart>

export default meta
type Story = StoryObj<typeof meta>

/** Accounts stacked with default categorical colours (slots 1–3). */
export const StackedAccounts: Story = {
  play: async ({ canvasElement }) => {
    await findChartGraphic(canvasElement, /Épargne et placements par compte/)
  },
}

export const SingleSeries: Story = {
  args: {
    data: netWorth2026,
    config: netWorthConfig,
    stacked: false,
    label: 'Patrimoine net en fin de mois, 2026',
  },
}

export const Dark: Story = { globals: DARK }

export const Mobile: Story = {
  globals: MOBILE,
  parameters: { layout: 'padded' },
  render: (args) => (
    <ChartFrame title="Épargne et placements" className="w-full">
      <AreaChart {...args} height={200} />
    </ChartFrame>
  ),
}

export const Empty: Story = { args: { data: [] } }

const snapshotArgs = {
  data: investmentSnapshots,
  index: 'date',
  config: investmentConfig,
  stacked: false,
  indexScale: 'time',
  indexFormatter: formatDay,
  tooltipIndexFormatter: formatDay,
  indexLabel: 'Date',
  label: 'Valeur et versements nets du compte à chaque relevé',
} as const

/**
 * Uneven snapshots on a time axis: the year without statements (2024-09 →
 * 2025-09) takes a year of width, and ticks fall on half-years.
 */
export const TimeScale: Story = {
  args: snapshotArgs,
  render: (args) => (
    <ChartFrame title="Historique" description="Valeur et versements nets">
      <AreaChart {...args} />
    </ChartFrame>
  ),
  beforeEach: captureReactWarnings,
  play: async ({ canvasElement }) => {
    const graphic = await findChartGraphic(canvasElement, /à chaque relevé/)
    await waitFor(() => {
      const ticks = [
        ...canvasElement.querySelectorAll('.recharts-xAxis-tick-labels text'),
      ].map((tick) => tick.textContent?.replace(/\s/g, ' '))
      expect(ticks).toEqual(['juil. 24', 'janv. 25', 'juil. 25'])
    })
    await expectKeyboardTooltip(canvasElement, graphic, [
      '30 juin',
      formatEuros(investmentSnapshots[1]!.value),
    ])
    await expectNoDuplicateKeys()
  },
}

export const TimeScaleDark: Story = { ...TimeScale, globals: DARK }

export const TimeScaleMobile: Story = {
  ...TimeScale,
  globals: MOBILE,
  parameters: { layout: 'padded' },
  render: (args) => (
    <ChartFrame title="Historique" className="w-full">
      <AreaChart {...args} height={200} />
    </ChartFrame>
  ),
}

const dailyBalance = Array.from({ length: 92 }, (_, day) => {
  const date = new Date(Date.UTC(2026, 7, 1 + day)).toISOString().slice(0, 10)
  // Synthetic: a salary on the 1st, spending through the month.
  const dayOfMonth = Number(date.slice(8, 10))
  const balance = 180_000 + 250_000 - dayOfMonth * 7_500 + day * 300
  const statement = dayOfMonth === 1 ? balance : null
  return { date, balance, statement }
})

/**
 * A daily balance with statement balances as dots (`dotSeries`): the dots
 * have no line and no fill, only their own days.
 */
export const DotSeries: Story = {
  args: {
    data: dailyBalance,
    index: 'date',
    config: {
      balance: { label: 'Solde', color: 'var(--chart-1)' },
      statement: { label: 'Solde de relevé', color: 'var(--chart-4)' },
    },
    dotSeries: ['statement'],
    stacked: false,
    indexScale: 'time',
    indexFormatter: formatDay,
    tooltipIndexFormatter: formatDay,
    indexLabel: 'Date',
    label: 'Solde du compte chaque jour et soldes de relevés',
  },
  render: (args) => (
    <ChartFrame title="Solde" description="Chaque jour, et les relevés">
      <AreaChart {...args} />
    </ChartFrame>
  ),
  play: async ({ canvasElement }) => {
    await findChartGraphic(canvasElement, /soldes de relevés/)
    await waitFor(() => {
      expect(
        canvasElement.querySelectorAll('.recharts-area-dots circle'),
      ).toHaveLength(3)
    })
  },
}

export const DotSeriesDark: Story = { ...DotSeries, globals: DARK }
