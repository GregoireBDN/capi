import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fireEvent, waitFor } from 'storybook/test'

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

/**
 * A selectable chart: a click or tap picks the nearest month, marked by a
 * hairline and a dot, and the page states its value in text above the plot
 * (here a plain line; the net worth page adds deltas and a breakdown).
 */
export const Selectable: Story = {
  render: function Render(args) {
    const [selected, setSelected] = useState<string>(
      netWorth2026[netWorth2026.length - 1]!.month,
    )
    const row = netWorth2026.find((item) => item.month === selected)
    return (
      <ChartFrame title="Patrimoine net" description="Touchez un mois">
        <p data-testid="selected" className="text-sm tabular-nums">
          {formatMonthLong(selected)} : {row ? formatEuros(row.netWorth) : '—'}
        </p>
        <LineChart
          {...args}
          selectedIndex={selected}
          onSelectIndex={setSelected}
        />
      </ChartFrame>
    )
  },
  beforeEach: captureReactWarnings,
  play: async ({ canvasElement, canvas }) => {
    const graphic = await findChartGraphic(canvasElement, /Patrimoine net/)
    await waitFor(() =>
      expect(
        canvasElement.querySelectorAll('.recharts-reference-dot'),
      ).toHaveLength(1),
    )
    await expect(canvas.getByTestId('selected')).toHaveTextContent(
      'décembre 2026',
    )
    // A click at the left edge of the plot picks the first month.
    await expect(graphic).toBeVisible()
    const plot = canvasElement
      .querySelector('.recharts-cartesian-grid')!
      .getBoundingClientRect()
    const point = {
      clientX: plot.left + 2,
      clientY: plot.top + plot.height / 2,
    }
    const wrapper = canvasElement.querySelector('.recharts-wrapper')!
    // The click picks the row the pointer is over (the tooltip's row).
    await fireEvent.mouseMove(wrapper, point)
    await waitFor(() =>
      expect(
        canvasElement.querySelector('[data-slot="chart-tooltip"]')?.textContent,
      ).toContain('janvier 2026'),
    )
    await fireEvent.click(wrapper, point)
    await waitFor(() =>
      expect(canvas.getByTestId('selected')).toHaveTextContent('janvier 2026'),
    )
    await expectNoDuplicateKeys()
  },
}

export const SelectableMobile: Story = {
  ...Selectable,
  globals: MOBILE,
  parameters: { layout: 'padded' },
}
