import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import { BarChart } from './bar-chart'
import {
  cashflow2026,
  cashflowConfig,
  savings2026,
  savingsConfig,
  signedCashflow2026,
  signedCashflowConfig,
} from './chart.fixtures'
import {
  ChartFrame,
  DARK,
  expectKeyboardTooltip,
  findChartGraphic,
  MOBILE,
} from './chart.story-utils'
import { formatEuros, formatMonthLong, formatMonthShort } from './format'

const meta = {
  title: 'Charts/BarChart',
  component: BarChart,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Vertical columns, grouped or `stacked`, with a zero baseline and negative values. All amounts are **integer cents**; `valueFormatter` (tooltip, table) defaults to `1 234,56 €` and `axisFormatter` to compact ticks (`1,2 k€`). The graphic has `role="img"` and an `aria-label` summary, a visually hidden data table, and keyboard-reachable tooltips (focus the chart, then use the arrow keys).',
      },
    },
  },
  args: {
    data: cashflow2026,
    index: 'month',
    config: cashflowConfig,
    indexFormatter: formatMonthShort,
    tooltipIndexFormatter: formatMonthLong,
    label: 'Revenus, dépenses et épargne par mois en 2026',
  },
  render: (args) => (
    <ChartFrame title="Flux mensuels" description="Janvier – décembre 2026">
      <BarChart {...args} />
    </ChartFrame>
  ),
} satisfies Meta<typeof BarChart>

export default meta
type Story = StoryObj<typeof meta>

/** Income vs expenses vs savings, grouped. Savings dip below zero in August. */
export const Grouped: Story = {
  play: async ({ canvasElement }) => {
    const graphic = await findChartGraphic(
      canvasElement,
      /Revenus, dépenses et épargne/,
    )
    await expect(graphic).toHaveAttribute('aria-label')
    await expectKeyboardTooltip(canvasElement, graphic, [
      'février 2026',
      formatEuros(cashflow2026[1]!.income),
    ])
  },
}

/** Expenses stored as negative cents, stacked against income on a signed axis. */
export const StackedSigned: Story = {
  args: {
    data: signedCashflow2026,
    config: signedCashflowConfig,
    stacked: true,
    label: 'Revenus et dépenses signés par mois en 2026',
  },
}

/** A single series with negative months: no legend (the title names it), zero baseline. */
export const NegativeValues: Story = {
  args: {
    data: savings2026,
    config: savingsConfig,
    label: 'Épargne mensuelle en 2026, négative en août',
    referenceLines: [{ value: 50000, label: 'Objectif' }],
  },
}

/** The data table twin made visible (relief for low-contrast hues). */
export const VisibleDataTable: Story = {
  args: { dataTable: 'details' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Voir les données')).toBeVisible()
    await expect(
      canvas.getByRole('columnheader', { name: 'Revenus' }),
    ).toBeInTheDocument()
  },
}

export const Dark: Story = {
  globals: DARK,
}

export const Mobile: Story = {
  globals: MOBILE,
  parameters: { layout: 'padded' },
  render: (args) => (
    <ChartFrame title="Flux mensuels" className="w-full">
      <BarChart {...args} height={220} />
    </ChartFrame>
  ),
}

export const MobileDarkStacked: Story = {
  ...Mobile,
  globals: { ...MOBILE, ...DARK },
  args: {
    data: signedCashflow2026,
    config: signedCashflowConfig,
    stacked: true,
    label: 'Revenus et dépenses signés par mois en 2026',
  },
}

export const Empty: Story = {
  args: { data: [] },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Aucune donnée pour cette période'),
    ).toBeVisible()
  },
}
