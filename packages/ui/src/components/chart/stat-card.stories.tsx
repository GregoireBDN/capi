import type { Meta, StoryObj } from '@storybook/react-vite'
import { PiggyBankIcon, ShoppingCartIcon, WalletIcon } from 'lucide-react'
import { expect, within } from 'storybook/test'

import { cashflow2026, netWorth2026 } from './chart.fixtures'
import { DARK, MOBILE } from './chart.story-utils'
import { StatCard } from './stat-card'

const meta = {
  title: 'Charts/StatCard',
  component: StatCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'KPI tile: label, value (integer cents by default), delta vs the previous period and an optional sparkline. A tile at least 260px wide (one per row on a phone) puts the sparkline beside the figures; a narrower one stacks it below. `increaseIsGood={false}` turns a rise into an unfavourable delta (expenses). The delta carries an arrow, a sign and a screen-reader phrase, never colour alone.',
      },
    },
  },
  args: {
    label: 'Patrimoine net',
    value: netWorth2026[11]!.netWorth,
    previousValue: netWorth2026[10]!.netWorth,
    trend: netWorth2026.map((row) => row.netWorth),
    icon: <WalletIcon />,
  },
  render: (args) => (
    <div className="w-64">
      <StatCard {...args} />
    </div>
  ),
} satisfies Meta<typeof StatCard>

export default meta
type Story = StoryObj<typeof meta>

export const NetWorth: Story = {}

/** Expenses went up: shown as unfavourable. */
export const ExpensesUp: Story = {
  args: {
    label: 'Dépenses du mois',
    value: cashflow2026[11]!.expenses,
    previousValue: cashflow2026[10]!.expenses,
    increaseIsGood: false,
    trend: cashflow2026.map((row) => row.expenses),
    icon: <ShoppingCartIcon />,
  },
  play: async ({ canvasElement }) => {
    const delta = canvasElement.querySelector('[data-slot="stat-card-delta"]')
    await expect(delta).toHaveAttribute('data-tone', 'bad')
    await expect(delta?.textContent).toContain('En hausse, défavorable')
  },
}

/** Savings went down month over month and are negative: a signed amount reads better than a percentage. */
export const NegativeSavings: Story = {
  args: {
    label: 'Épargne du mois',
    value: cashflow2026[7]!.savings,
    previousValue: cashflow2026[6]!.savings,
    deltaDisplay: 'value',
    comparisonLabel: 'vs juillet',
    trend: cashflow2026.map((row) => row.savings),
    icon: <PiggyBankIcon />,
  },
}

export const WithoutComparison: Story = {
  args: { previousValue: undefined, trend: undefined },
}

/** No comparison, with the reason in place of the delta line. */
export const WithNote: Story = {
  args: {
    label: '% épargné',
    value: 0,
    valueFormatter: () => '—',
    previousValue: undefined,
    trend: undefined,
    icon: undefined,
    note: 'Pas encore de revenus ce mois-ci',
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Pas encore de revenus ce mois-ci'),
    ).toBeInTheDocument()
    await expect(
      canvasElement.querySelector('[data-slot="stat-card-delta"]'),
    ).toBeNull()
  },
}

export const Stable: Story = {
  args: {
    label: 'Abonnements',
    value: 6390,
    previousValue: 6390,
    trend: undefined,
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/Stable/)).toBeInTheDocument()
  },
}

/**
 * KPI tiles as on the dashboard on a phone: one per row, each wider than
 * tall, figures on the left and the sparkline on the right.
 */
export const KpiRow: Story = {
  globals: MOBILE,
  parameters: { layout: 'padded' },
  play: async ({ canvasElement }) => {
    for (const tile of canvasElement.querySelectorAll(
      '[data-slot="stat-card"]',
    )) {
      const box = tile.getBoundingClientRect()
      await expect(box.width).toBeGreaterThan(box.height)
      const sparkline = tile.querySelector('[data-slot="sparkline"]')!
      const value = tile.querySelector('[data-slot="stat-card-body"] > div')!
      await expect(sparkline.getBoundingClientRect().left).toBeGreaterThan(
        value.getBoundingClientRect().left,
      )
    }
  },
  render: () => (
    <div className="grid grid-cols-1 gap-3">
      <StatCard
        label="Revenus"
        value={cashflow2026[11]!.income}
        previousValue={cashflow2026[10]!.income}
        trend={cashflow2026.map((row) => row.income)}
      />
      <StatCard
        label="Dépenses"
        value={cashflow2026[11]!.expenses}
        previousValue={cashflow2026[10]!.expenses}
        increaseIsGood={false}
        trend={cashflow2026.map((row) => row.expenses)}
      />
      <StatCard
        label="Épargne"
        value={cashflow2026[11]!.savings}
        previousValue={cashflow2026[10]!.savings}
        deltaDisplay="value"
        trend={cashflow2026.map((row) => row.savings)}
      />
      <StatCard
        label="Patrimoine net"
        value={netWorth2026[11]!.netWorth}
        previousValue={netWorth2026[10]!.netWorth}
        trend={netWorth2026.map((row) => row.netWorth)}
      />
    </div>
  ),
}

export const KpiRowDark: Story = { ...KpiRow, globals: { ...MOBILE, ...DARK } }

/**
 * Six-digit deltas in two tiles abreast on a 320px phone (288px of content),
 * with the web app's 22px root font: the delta shrinks with the tile, arrow
 * included, and never breaks or overflows the tile's padding.
 */
export const LargeDeltaNarrow: Story = {
  parameters: { layout: 'padded' },
  beforeEach: () => {
    const root = document.documentElement
    const previous = root.style.fontSize
    root.style.fontSize = '22px'
    return () => {
      root.style.fontSize = previous
    }
  },
  render: () => (
    <div className="grid grid-cols-2 gap-2" style={{ width: 288 }}>
      <StatCard
        label="Épargne"
        value={116_200}
        previousValue={-12_234_578}
        deltaDisplay="value"
      />
      <StatCard
        label="Dépenses"
        value={12_480_000}
        previousValue={128_759}
        increaseIsGood={false}
        deltaDisplay="value"
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const deltas = canvasElement.querySelectorAll<HTMLElement>(
      '[data-slot="stat-card-delta"]',
    )
    await expect(deltas).toHaveLength(2)
    for (const delta of deltas) {
      const line = delta.parentElement!
      const right =
        line.getBoundingClientRect().right -
        parseFloat(getComputedStyle(line).paddingRight)
      await expect(delta.getBoundingClientRect().right).toBeLessThanOrEqual(
        right + 1,
      )
    }
  },
}

/**
 * Long amounts beside a sparkline, four tiles abreast as on a 1680px screen
 * (and one tile on a phone), with the web app's 22px root font: the value
 * shrinks to the room left by the sparkline and never wraps, the euro sign
 * included (#211).
 */
export const LongAmountBesideSparkline: Story = {
  parameters: { layout: 'padded' },
  beforeEach: () => {
    const root = document.documentElement
    const previous = root.style.fontSize
    root.style.fontSize = '22px'
    return () => {
      root.style.fontSize = previous
    }
  },
  render: () => (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2" style={{ width: 1240 }}>
        {[118_367, -1_234_567_89, 12_345_678_90, -99_999_99].map((value) => (
          <StatCard
            key={value}
            label="Dépensé"
            value={value}
            trend={cashflow2026.map((row) => row.expenses)}
          />
        ))}
      </div>
      <div style={{ width: 288 }}>
        <StatCard
          label="Patrimoine net"
          value={-1_234_567_89}
          previousValue={-1_200_000_00}
          trend={netWorth2026.map((row) => row.netWorth)}
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const values = canvasElement.querySelectorAll<HTMLElement>(
      '[data-slot="stat-card-value"]',
    )
    await expect(values).toHaveLength(5)
    for (const value of values) {
      const lineHeight = parseFloat(getComputedStyle(value).lineHeight)
      const column = value.parentElement!
      const right =
        column.getBoundingClientRect().right -
        parseFloat(getComputedStyle(column).paddingRight)
      await expect(value.getBoundingClientRect().height).toBeLessThan(
        lineHeight * 1.5,
      )
      await expect(value.scrollWidth).toBeLessThanOrEqual(value.clientWidth + 1)
      await expect(value.getBoundingClientRect().right).toBeLessThanOrEqual(
        right + 1,
      )
    }
  },
}
