import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { budgets2026 } from './chart.fixtures'
import { DARK, MOBILE } from './chart.story-utils'
import { formatPercent } from './format'
import { ProgressMeter } from './progress-meter'

const meta = {
  title: 'Charts/ProgressMeter',
  component: ProgressMeter,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Budget actual vs target (integer cents). States: on track, warning (from `warningThreshold`, default 90 %) and over target, where the overspent part is drawn past a gap marking the target. The state is repeated in words with an icon, and exposed as `role="meter"` with a full `aria-valuetext`.',
      },
    },
  },
  args: { label: 'Courses', value: 32000, target: 40000 },
  render: (args) => (
    <div className="w-80">
      <ProgressMeter {...args} />
    </div>
  ),
} satisfies Meta<typeof ProgressMeter>

export default meta
type Story = StoryObj<typeof meta>

export const OnTrack: Story = {
  play: async ({ canvas }) => {
    const meter = canvas.getByRole('meter', { name: 'Courses' })
    await expect(meter).toHaveAttribute('aria-valuetext')
    await expect(meter.getAttribute('aria-valuetext')).toContain(
      formatPercent(0.8),
    )
  },
}

export const Warning: Story = {
  args: { label: 'Restaurants', value: 13700, target: 15000 },
}

export const OverTarget: Story = {
  args: { label: 'Loisirs', value: 16450, target: 12000 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Dépassement de/)).toBeVisible()
  },
}

export const NoBudget: Story = {
  args: { label: 'Cadeaux', value: 2100, target: 0 },
}

/** A budget list, as on the budget page. */
export const BudgetList: Story = {
  render: () => (
    <div className="grid w-[min(calc(100vw-2rem),24rem)] gap-5 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      {budgets2026.map((budget) => (
        <ProgressMeter key={budget.label} {...budget} />
      ))}
    </div>
  ),
}

export const BudgetListDark: Story = { ...BudgetList, globals: DARK }

export const BudgetListMobile: Story = {
  ...BudgetList,
  globals: MOBILE,
  parameters: { layout: 'padded' },
}
