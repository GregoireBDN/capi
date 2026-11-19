import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, within } from 'storybook/test'

import { CategoryIcon } from '../category-icon'
import { spendingByCategory } from './chart.fixtures'
import { ChartFrame, DARK, findChartGraphic, MOBILE } from './chart.story-utils'
import { DonutChart, type DonutChartSlice } from './donut-chart'
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

/** Long category names and shares from 0,4 % to 100 % (#320). */
const longLabels: DonutChartSlice[] = [
  ['housing', 'Loyer et charges de copropriété', 127500, 'house', '#dc2626'],
  [
    'restaurants',
    'Restaurants, cafés et livraisons à domicile',
    29500,
    'utensils',
    '#ca8a04',
  ],
  [
    'groceries',
    'Courses alimentaires et produits ménagers',
    24500,
    'shopping-cart',
    '#ea580c',
  ],
  ['transport', 'Transports en commun et VTC', 21000, 'bus', '#2563eb'],
  ['subscriptions', 'Abonnements', 19000, 'repeat', '#7c3aed'],
  ['health', 'Santé', 14500, 'pill', '#059669'],
  [
    'leisure',
    'Loisirs et sorties culturelles du week-end',
    13000,
    'ticket',
    '#db2777',
  ],
  ['gifts', 'Cadeaux', 1000, 'gift', '#0891b2'],
].map(([id, label, value, icon, color]) => ({
  id: String(id),
  label: String(label),
  value: Number(value),
  color: String(color),
  icon: <CategoryIcon icon={String(icon)} color={String(color)} size="sm" />,
}))

const singleSlice: DonutChartSlice[] = [
  {
    id: 'housing',
    label: 'Loyer et charges de copropriété',
    value: 95000,
    color: '#dc2626',
    icon: <CategoryIcon icon="house" color="#dc2626" size="sm" />,
  },
]

/** A phone of `width` px: the app's 16px gutter around a card. */
function Phone({ width, children }: { width: number; children: ReactNode }) {
  return (
    <section
      aria-label={`${width} px`}
      className="shrink-0 space-y-4 px-4"
      style={{ width }}
    >
      <p className="text-xs text-muted-foreground">{width} px</p>
      {children}
    </section>
  )
}

/**
 * Phones at 320 and 390px: only the label gives way (« … »); the amount and
 * the share, written in full with its « % », never shrink or wrap, and the
 * amounts stay aligned (#320).
 */
export const LongLabelsOnPhones: Story = {
  args: { data: longLabels, maxSlices: 8, minShare: 0 },
  parameters: { layout: 'padded' },
  render: (args) => (
    <div className="flex flex-wrap items-start gap-6">
      {[320, 390].map((width) => (
        <Phone key={width} width={width}>
          <ChartFrame title="Répartition" className="w-full">
            <DonutChart {...args} height={200} />
          </ChartFrame>
          <ChartFrame title="Répartition" className="w-full">
            <DonutChart {...args} data={singleSlice} height={200} />
          </ChartFrame>
        </Phone>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const legends = canvasElement.querySelectorAll<HTMLElement>(
      '[data-slot="chart-legend"]',
    )
    await expect(legends).toHaveLength(4)
    for (const legend of legends) {
      // Nothing sticks out of the row: the card would clip it.
      await expect(legend.scrollWidth).toBeLessThanOrEqual(legend.clientWidth)
      const right = legend.getBoundingClientRect().right
      for (const slot of ['chart-legend-value', 'chart-legend-share']) {
        for (const cell of legend.querySelectorAll<HTMLElement>(
          `[data-slot="${slot}"]`,
        )) {
          await expect(cell.scrollWidth).toBeLessThanOrEqual(cell.clientWidth)
          await expect(cell.getBoundingClientRect().right).toBeLessThanOrEqual(
            right + 0.5,
          )
          if (slot === 'chart-legend-share') {
            await expect(cell.textContent).toMatch(/^\d+(,\d)?\s%$/)
          }
        }
      }
    }
    const [narrow] = legends
    const shares = [
      ...narrow!.querySelectorAll('[data-slot="chart-legend-share"]'),
    ].map((cell) => cell.textContent?.replace(/\s/g, ' '))
    await expect(shares).toEqual([
      '51 %',
      '11,8 %',
      '9,8 %',
      '8,4 %',
      '7,6 %',
      '5,8 %',
      '5,2 %',
      '0,4 %',
    ])
    // The long names give way, with their full text as a title.
    const label = within(narrow!).getByText(/^Restaurants, cafés/)
    await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth)
    await expect(label).toHaveAttribute('title', label.textContent)
    await expect(within(legends[1]!).getByText(/^100\s%$/)).toBeVisible()
  },
}

export const LongLabelsOnPhonesDark: Story = {
  ...LongLabelsOnPhones,
  globals: DARK,
  play: undefined,
}

export const Empty: Story = {
  args: { data: [], emptyMessage: 'Aucune dépense ce mois-ci' },
}
