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
