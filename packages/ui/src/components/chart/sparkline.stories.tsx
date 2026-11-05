import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { netWorth2026, savings2026 } from './chart.fixtures'
import { DARK, MOBILE } from './chart.story-utils'
import { Sparkline } from './sparkline'

const meta = {
  title: 'Charts/Sparkline',
  component: Sparkline,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Tiny inline trend with no axes: the line in a de-emphasised hue, the current period as an accent dot. Plain SVG, so it renders on the server with no layout shift. Always give it a `label` describing the trend.',
      },
    },
  },
  args: {
    data: netWorth2026.map((row) => row.netWorth),
    label: 'Patrimoine net sur 12 mois, en hausse',
  },
  render: (args) => (
    <div className="w-40">
      <Sparkline {...args} />
    </div>
  ),
} satisfies Meta<typeof Sparkline>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('img', {
        name: 'Patrimoine net sur 12 mois, en hausse',
      }),
    ).toBeVisible()
  },
}

export const WithArea: Story = { args: { area: true } }

/** Values crossing zero are drawn relative to their own range. */
export const NegativeValues: Story = {
  args: {
    data: savings2026.map((row) => row.savings),
    label: 'Épargne mensuelle sur 12 mois, négative en août',
    accentColor: 'var(--chart-savings)',
  },
}

export const Flat: Story = {
  args: { data: [1000, 1000, 1000, 1000], label: 'Abonnements stables' },
}

export const Dark: Story = { globals: DARK, args: { area: true } }

export const Mobile: Story = { globals: MOBILE }
