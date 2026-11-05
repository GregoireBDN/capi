import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import {
  netWorth2026,
  netWorthConfig,
  netWorthSplitConfig,
  savings2026,
  savingsConfig,
} from './chart.fixtures'
import {
  ChartFrame,
  DARK,
  expectKeyboardTooltip,
  findChartGraphic,
  MOBILE,
} from './chart.story-utils'
import { formatEuros, formatMonthLong, formatMonthShort } from './format'
import { LineChart } from './line-chart'

const meta = {
  title: 'Charts/LineChart',
  component: LineChart,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Time series such as net worth by month: 2px lines, a crosshair tooltip listing every series, optional `referenceLines` and `zeroBaseline`. Amounts are **integer cents**.',
      },
    },
  },
  args: {
    data: netWorth2026,
    index: 'month',
    config: netWorthConfig,
    indexFormatter: formatMonthShort,
    tooltipIndexFormatter: formatMonthLong,
    label: 'Patrimoine net en fin de mois, 2026',
  },
  render: (args) => (
    <ChartFrame title="Patrimoine net" description="Fin de mois, 2026">
      <LineChart {...args} />
    </ChartFrame>
  ),
} satisfies Meta<typeof LineChart>

export default meta
type Story = StoryObj<typeof meta>

/** One series: no legend box, the title names it. */
export const NetWorth: Story = {
  play: async ({ canvasElement }) => {
    const graphic = await findChartGraphic(canvasElement, /Patrimoine net/)
    await expectKeyboardTooltip(canvasElement, graphic, [
      'février 2026',
      formatEuros(netWorth2026[1]!.netWorth),
    ])
  },
}

export const TwoSeries: Story = {
  args: {
    config: netWorthSplitConfig,
    label: 'Patrimoine net et placements en fin de mois, 2026',
  },
}

export const WithTarget: Story = {
  args: {
    referenceLines: [{ value: 5000000, label: 'Objectif 50 k€' }],
    label: 'Patrimoine net en 2026 face à un objectif de 50 000 €',
  },
}

/** Negative values cross the zero baseline. */
export const NegativeValues: Story = {
  args: {
    data: savings2026,
    config: savingsConfig,
    label: 'Épargne mensuelle en 2026',
  },
}

export const Dark: Story = {
  globals: DARK,
  args: {
    config: netWorthSplitConfig,
    label: 'Patrimoine net et placements en fin de mois, 2026',
  },
}

export const Mobile: Story = {
  globals: MOBILE,
  parameters: { layout: 'padded' },
  render: (args) => (
    <ChartFrame title="Patrimoine net" className="w-full">
      <LineChart {...args} height={200} />
    </ChartFrame>
  ),
}

export const Empty: Story = {
  args: { data: [], emptyMessage: 'Aucun relevé de solde pour le moment' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Aucun relevé de solde pour le moment'),
    ).toBeVisible()
  },
}
