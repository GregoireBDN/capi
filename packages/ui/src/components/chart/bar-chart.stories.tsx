import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'

import { BarChart } from './bar-chart'
import {
  cashflow2026,
  cashflowConfig,
  savings2026,
  savingsConfig,
  signedCashflow2026,
  signedCashflowConfig,
  zeroCashflow2026,
} from './chart.fixtures'
import {
  boxesOverlap,
  captureReactWarnings,
  ChartFrame,
  DARK,
  expectContrast,
  expectReadableIndexTicks,
  expectKeyboardTooltip,
  expectNoDuplicateKeys,
  findChartGraphic,
  MOBILE,
} from './chart.story-utils'
import { formatEuros, formatMonthLong, formatMonthShort } from './format'

/** Monthly savings where December beats a 1 000 € target (the last bar crosses the line). */
const savingsAboveTarget = savings2026.map((row) =>
  row.month === '2026-12' ? { ...row, savings: 110000 } : row,
)

/**
 * Checks the reference-line tag: drawn on `side`, its text readable on its
 * own background (>= 4.5:1), and, when `clear`, covering no bar.
 */
async function expectReferenceLabel(
  canvasElement: HTMLElement,
  text: string,
  side: 'start' | 'end',
  clear: boolean,
) {
  await waitFor(() =>
    expect(
      canvasElement.querySelector('[data-slot="chart-reference-label"]'),
    ).not.toBeNull(),
  )
  const tag = canvasElement.querySelector<SVGGElement>(
    '[data-slot="chart-reference-label"]',
  )!
  await expect(tag).toHaveAttribute('data-side', side)
  await expect(tag.textContent).toBe(text)
  const label = tag.querySelector('text')!
  const background = tag.querySelector('rect')!
  await expectContrast(
    getComputedStyle(label).fill,
    getComputedStyle(background).fill,
  )
  if (clear) {
    // Let the bars finish growing before measuring them.
    await new Promise((resolve) => setTimeout(resolve, 800))
    const box = background.getBoundingClientRect()
    for (const bar of canvasElement.querySelectorAll(
      '.recharts-bar-rectangle path',
    )) {
      await expect(boxesOverlap(box, bar.getBoundingClientRect())).toBe(false)
    }
  }
}

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

/**
 * The target tag moves to the start of the line when the last months cross
 * it, so it never sits on a bar it would hide (or be hidden by).
 */
export const TargetAboveLastBar: Story = {
  args: {
    data: savingsAboveTarget,
    config: savingsConfig,
    label: 'Épargne mensuelle en 2026, cible de 1 000 € dépassée en décembre',
    referenceLines: [{ value: 100000, label: 'Cible' }],
  },
  play: async ({ canvasElement }) => {
    await findChartGraphic(canvasElement, /cible de 1 000 €/)
    await expectReferenceLabel(canvasElement, 'Cible', 'start', true)
  },
}

export const TargetAboveLastBarDark: Story = {
  ...TargetAboveLastBar,
  globals: DARK,
}

/**
 * Both ends cross the line: the tag stays at the end, on its own surface,
 * still readable over the bar.
 */
export const TargetCrossedAtBothEnds: Story = {
  args: {
    ...TargetAboveLastBar.args,
    label: 'Épargne mensuelle en 2026, cible de 500 €',
    referenceLines: [{ value: 50000, label: 'Cible' }],
  },
  play: async ({ canvasElement }) => {
    await findChartGraphic(canvasElement, /cible de 500 €/)
    await expectReferenceLabel(canvasElement, 'Cible', 'end', false)
  },
}

/**
 * 12 months in a 343 px card (a 375 px phone): every 2nd or 3rd month is
 * labelled, first and last kept, and no two labels touch. The tag stays
 * clear of the bars.
 */
export const NarrowMonthAxis: Story = {
  args: TargetAboveLastBar.args,
  parameters: { layout: 'padded' },
  render: (args) => (
    <ChartFrame title="Épargne par mois" className="w-[343px]">
      <BarChart {...args} />
    </ChartFrame>
  ),
  play: async ({ canvasElement }) => {
    await findChartGraphic(canvasElement, /cible de 1 000 €/)
    await expectReadableIndexTicks(canvasElement, ['janv.', 'déc.'])
    await expectReferenceLabel(canvasElement, 'Cible', 'start', true)
  },
}

export const NarrowMonthAxisDark: Story = {
  ...NarrowMonthAxis,
  globals: DARK,
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

/** Savings with the one-off part of February and August: not drawn. */
const savingsWithOneOffs = savings2026.map((row) => ({
  ...row,
  oneOff:
    row.month === '2026-02' ? -64900 : row.month === '2026-08' ? 150000 : 0,
}))

/**
 * `details`: values of each row that are not drawn (here the one-off part of
 * each month's savings), listed under the series in the tooltip when not zero
 * and as a column of the data table.
 */
export const WithDetails: Story = {
  args: {
    data: savingsWithOneOffs,
    config: savingsConfig,
    label: 'Épargne mensuelle en 2026, dont ponctuel',
    details: { oneOff: 'Dont ponctuel' },
    dataTable: 'details',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const graphic = await findChartGraphic(canvasElement, /dont ponctuel/)
    await expectKeyboardTooltip(canvasElement, graphic, [
      'février 2026',
      'Dont ponctuel',
      formatEuros(-64900),
    ])
    await expect(
      canvas.getByRole('columnheader', { name: 'Dont ponctuel', hidden: true }),
    ).toBeInTheDocument()
    // Not a series: no bar, no legend entry.
    await expect(canvasElement.querySelectorAll('.recharts-bar')).toHaveLength(
      1,
    )
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
  play: async ({ canvasElement }) => {
    await findChartGraphic(canvasElement, /Revenus/)
    await expectReadableIndexTicks(canvasElement, ['janv.', 'déc.'])
  },
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

/**
 * All-zero months (fresh install): the value axis shows `0 €` and `1 €`, and
 * Recharts gets unique ticks, so React logs no duplicate-key warning.
 */
export const AllZero: Story = {
  args: { data: zeroCashflow2026, label: 'Flux mensuels sans opération' },
  beforeEach: captureReactWarnings,
  play: async ({ canvasElement }) => {
    await findChartGraphic(canvasElement, /Flux mensuels sans opération/)
    await expectNoDuplicateKeys()
  },
}
