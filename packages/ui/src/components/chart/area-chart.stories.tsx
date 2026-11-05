import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  netWorth2026,
  netWorthConfig,
  savingsAccounts2026,
  savingsAccountsConfig,
} from './chart.fixtures'
import { ChartFrame, DARK, findChartGraphic, MOBILE } from './chart.story-utils'
import { formatMonthLong, formatMonthShort } from './format'
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
          'Time series with a light wash under each line, overlapping or `stacked` (part-to-whole over time). The value axis always includes zero. Amounts are **integer cents**.',
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
