import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import { spendingByCategory } from './chart.fixtures'
import { ChartFrame, DARK, findChartGraphic, MOBILE } from './chart.story-utils'
import { DonutChart } from './donut-chart'
import { formatWholeEuros } from './format'

const meta = {
  title: 'Charts/DonutChart',
  component: DonutChart,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Part-to-whole breakdown (spending by category) with the total in the centre. Slices beyond `maxSlices` or under `minShare` fold into "Autres". Pass each slice a stable `color` (e.g. its category colour) so it keeps its colour across months. Amounts are **integer cents**.',
      },
    },
  },
  args: {
    data: spendingByCategory,
    label: 'Dépenses de mars 2026 par catégorie',
  },
  render: (args) => (
    <ChartFrame
      title="Dépenses par catégorie"
      description="Mars 2026"
      className="w-[min(calc(100vw-2rem),24rem)]"
    >
      <DonutChart {...args} />
    </ChartFrame>
  ),
} satisfies Meta<typeof DonutChart>

export default meta
type Story = StoryObj<typeof meta>

/** Nine categories: the four smallest fold into "Autres". */
export const ByCategory: Story = {
  play: async ({ canvasElement }) => {
    await findChartGraphic(canvasElement, /Dépenses de mars 2026/)
    const canvas = within(canvasElement)
    const legend = canvas.getByRole('list', { name: 'Légende' })
    await expect(within(legend).getByText('Autres')).toBeInTheDocument()
    await expect(within(legend).queryByText('Divers')).toBeNull()
    await expect(
      canvas.getByText(formatWholeEuros(178400).replace(/\s/g, ' ')),
    ).toBeVisible()
  },
}

export const AllSlices: Story = {
  args: { maxSlices: 8, minShare: 0 },
}

export const Dark: Story = { globals: DARK }

export const Mobile: Story = {
  globals: MOBILE,
  parameters: { layout: 'padded' },
  render: (args) => (
    <ChartFrame title="Dépenses par catégorie" className="w-full">
      <DonutChart {...args} height={200} />
    </ChartFrame>
  ),
}

export const Empty: Story = {
  args: { data: [], emptyMessage: 'Aucune dépense ce mois-ci' },
}
