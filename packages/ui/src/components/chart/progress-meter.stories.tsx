import type { Meta, StoryObj } from '@storybook/react-vite'
import { PencilIcon } from 'lucide-react'
import { expect } from 'storybook/test'

import { Button } from '../button'
import { budgets2026, savingsGoals } from './chart.fixtures'
import { DARK, expectContrast, MOBILE } from './chart.story-utils'
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
          'Actual vs target (integer cents). `goal="limit"` (default, budgets): on track, warning (from `warningThreshold`, default 90 %) and over target, where the overspent part is drawn past a gap marking the target. `goal="reach"` (savings): in progress, then reached in green, with the extra part past the same gap; never a warning, and a negative amount is shown as is with an empty bar. The state is repeated in words with an icon, and exposed as `role="meter"` with a full `aria-valuetext`. The header wraps on a phone and takes an optional `action`.',
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

/**
 * Envelope followed during the month: the marker shows where spending would
 * be at an even pace (day 13 of 30 here), so spending ahead of it stands out.
 */
export const PaceMarker: Story = {
  args: {
    label: 'Sorties',
    value: 9000,
    target: 15000,
    marker: { value: 6500, label: 'rythme du mois : 65,00 €' },
  },
  play: async ({ canvas }) => {
    const meter = canvas.getByRole('meter', { name: 'Sorties' })
    await expect(meter.getAttribute('aria-valuetext')).toContain(
      'rythme du mois',
    )
  },
}

export const NoBudget: Story = {
  args: { label: 'Cadeaux', value: 2100, target: 0 },
}

/** Savings goal under way: no warning close to the target. */
export const ReachInProgress: Story = {
  args: { goal: 'reach', label: 'Vacances', value: 142000, target: 150000 },
  play: async ({ canvasElement, canvas }) => {
    const meter = canvas.getByRole('meter', { name: 'Vacances' })
    await expect(meter.getAttribute('aria-valuetext')).toContain('reste')
    await expect(
      canvasElement.querySelector('[data-slot="progress-meter"]'),
    ).toHaveAttribute('data-state', 'under')
  },
}

/** Past the target is good news: green, the extra part beyond the gap. */
export const ReachExceeded: Story = {
  args: { goal: 'reach', label: 'Vacances', value: 180000, target: 150000 },
  play: async ({ canvasElement, canvas }) => {
    const status = canvas.getByText(/Objectif atteint/)
    await expect(status).toBeVisible()
    await expect(
      canvas
        .getByRole('meter', { name: 'Vacances' })
        .getAttribute('aria-valuetext'),
    ).toContain('objectif atteint')
    await expect(
      canvasElement.querySelector('[data-slot="progress-meter-overflow"]'),
    ).not.toBeNull()
    await expectContrast(
      getComputedStyle(status).color,
      getComputedStyle(canvasElement.querySelector('.bg-card')!)
        .backgroundColor,
    )
  },
  render: (args) => (
    <div className="w-80 rounded-xl bg-card p-4">
      <ProgressMeter {...args} />
    </div>
  ),
}

export const ReachExceededDark: Story = { ...ReachExceeded, globals: DARK }

/** A month in the red: the amount is shown as is, the bar stays empty. */
export const ReachNegative: Story = {
  args: {
    goal: 'reach',
    label: 'Novembre 2026 (en cours)',
    value: -12000,
    target: 50000,
  },
}

/** Savings goals, as on the savings page: wrapping names, an edit action. */
export const SavingsGoals: Story = {
  render: () => (
    <ul className="grid w-[min(calc(100vw-2rem),24rem)] gap-5 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      {savingsGoals.map((goal) => (
        <li key={goal.label}>
          <ProgressMeter
            goal="reach"
            {...goal}
            action={
              <Button
                ghost
                size="sm"
                className="-mt-1 shrink-0"
                aria-label={`Modifier l’objectif ${goal.label}`}
              >
                <PencilIcon aria-hidden />
              </Button>
            }
          />
        </li>
      ))}
    </ul>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: /Modifier l’objectif Vacances/ }),
    ).toBeVisible()
    await expect(canvas.getAllByRole('meter')).toHaveLength(savingsGoals.length)
  },
}

export const SavingsGoalsDark: Story = { ...SavingsGoals, globals: DARK }

export const SavingsGoalsMobile: Story = {
  ...SavingsGoals,
  globals: MOBILE,
  parameters: { layout: 'padded' },
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
