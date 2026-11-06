import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'

import {
  cashflowConfig,
  FORECAST_TODAY,
  forecastConfig,
  forecastNovember,
  netWorth2026,
  netWorthConfig,
  netWorthSplitConfig,
  savings2026,
  savingsConfig,
  zeroCashflow2026,
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
          'Time series such as net worth by month: 2px lines, a crosshair tooltip listing every series, optional `referenceLines` (horizontal), `indexReferenceLines` (vertical, e.g. today) and `zeroBaseline`. `indexScale="time"` spaces `YYYY-MM-DD` rows by date. Amounts are **integer cents**.',
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

/** All-zero series: clean `0 €` / `1 €` axis, no duplicate-key warning. */
export const AllZero: Story = {
  args: {
    data: zeroCashflow2026,
    config: cashflowConfig,
    label: 'Flux mensuels sans opération',
  },
  beforeEach: captureReactWarnings,
  play: async ({ canvasElement }) => {
    await findChartGraphic(canvasElement, /Flux mensuels sans opération/)
    await expectNoDuplicateKeys()
  },
}

const forecastArgs = {
  data: forecastNovember,
  index: 'date',
  config: forecastConfig,
  indexFormatter: formatDay,
  tooltipIndexFormatter: formatDay,
  indexLabel: 'Jour',
  referenceLines: [{ value: 50_000, label: 'Seuil' }],
  indexReferenceLines: [{ value: FORECAST_TODAY, label: 'Aujourd’hui' }],
  label: 'Solde prévu par jour, du 6 au 30 novembre 2026',
} as const

/** A vertical "today" marker, labelled above the plot, plus a threshold. */
export const TodayMarker: Story = {
  args: forecastArgs,
  render: (args) => (
    <ChartFrame title="Projection jour par jour" description="Novembre 2026">
      <LineChart {...args} />
    </ChartFrame>
  ),
  beforeEach: captureReactWarnings,
  play: async ({ canvasElement }) => {
    await findChartGraphic(canvasElement, /Solde prévu par jour/)
    await waitFor(() =>
      expect(canvasElement.querySelector('svg')?.textContent).toContain(
        'Aujourd’hui',
      ),
    )
    await expectNoDuplicateKeys()
  },
}

export const TodayMarkerDark: Story = {
  ...TodayMarker,
  globals: DARK,
}

export const TodayMarkerMobile: Story = {
  ...TodayMarker,
  globals: MOBILE,
  parameters: { layout: 'padded' },
  render: (args) => (
    <ChartFrame title="Projection jour par jour" className="w-full">
      <LineChart {...args} height={200} />
    </ChartFrame>
  ),
}
