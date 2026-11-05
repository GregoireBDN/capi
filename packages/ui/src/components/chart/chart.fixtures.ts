/**
 * Synthetic finance data for the chart stories. Every amount is made up and
 * expressed in integer cents; periods are calendar months of 2026.
 */

import type { ChartConfig } from './chart-container'
import type { DonutChartSlice } from './donut-chart'

export const MONTHS_2026 = [
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
  '2026-11',
  '2026-12',
] as const

const INCOME = [
  312000, 309500, 318000, 312000, 335000, 312000, 389000, 312000, 314500,
  312000, 316000, 402000,
]
const EXPENSES = [
  241000, 228500, 262000, 247500, 251000, 274000, 298500, 356000, 239000,
  244500, 268000, 371500,
]

/** Income, expenses and savings per month (all positive, savings may be negative). */
export const cashflow2026 = MONTHS_2026.map((month, i) => ({
  month,
  income: INCOME[i]!,
  expenses: EXPENSES[i]!,
  savings: INCOME[i]! - EXPENSES[i]!,
}))

/** Same months with expenses stored as negative amounts (signed view). */
export const signedCashflow2026 = MONTHS_2026.map((month, i) => ({
  month,
  income: INCOME[i]!,
  expenses: -EXPENSES[i]!,
}))

/** Monthly savings only: August is negative. */
export const savings2026 = cashflow2026.map(({ month, savings }) => ({
  month,
  savings,
}))

/** End-of-month net worth and invested part. */
export const netWorth2026 = MONTHS_2026.map((month, i) => ({
  month,
  netWorth:
    4215000 + i * 61000 + (i % 3 === 0 ? -35000 : 18000) - (i > 6 ? 90000 : 0),
  investments: 2120000 + i * 42000 + (i % 4 === 1 ? -52000 : 9000),
}))

/** Balances of savings and investment accounts, for stacked areas. */
export const savingsAccounts2026 = MONTHS_2026.map((month, i) => ({
  month,
  livretA: 1200000 + i * 15000,
  pea: 860000 + i * 24000 + (i % 3 === 2 ? -30000 : 0),
  lifeInsurance: 640000 + i * 8000,
}))

export const cashflowConfig = {
  income: { label: 'Revenus', color: 'var(--chart-income)' },
  expenses: { label: 'Dépenses', color: 'var(--chart-expense)' },
  savings: { label: 'Épargne', color: 'var(--chart-savings)' },
} satisfies ChartConfig

export const signedCashflowConfig = {
  income: { label: 'Revenus', color: 'var(--chart-income)' },
  expenses: { label: 'Dépenses', color: 'var(--chart-expense)' },
} satisfies ChartConfig

export const savingsConfig = {
  savings: { label: 'Épargne', color: 'var(--chart-savings)' },
} satisfies ChartConfig

export const netWorthConfig = {
  netWorth: { label: 'Patrimoine net', color: 'var(--chart-savings)' },
} satisfies ChartConfig

export const netWorthSplitConfig = {
  netWorth: { label: 'Patrimoine net', color: 'var(--chart-1)' },
  investments: { label: 'Placements', color: 'var(--chart-2)' },
} satisfies ChartConfig

export const savingsAccountsConfig = {
  livretA: { label: 'Livret A' },
  pea: { label: 'PEA' },
  lifeInsurance: { label: 'Assurance vie' },
} satisfies ChartConfig

/** Spending by category for one month (slices in a stable, alphabetical order). */
export const spendingByCategory: DonutChartSlice[] = [
  { id: 'subscriptions', label: 'Abonnements', value: 3900 },
  { id: 'gifts', label: 'Cadeaux', value: 2100 },
  { id: 'groceries', label: 'Courses', value: 42000 },
  { id: 'misc', label: 'Divers', value: 900 },
  { id: 'housing', label: 'Logement', value: 85000 },
  { id: 'leisure', label: 'Loisirs', value: 12500 },
  { id: 'restaurants', label: 'Restaurants', value: 9800 },
  { id: 'health', label: 'Santé', value: 4200 },
  { id: 'transport', label: 'Transport', value: 18000 },
]

/** Budget lines: actual spend vs monthly target. */
export const budgets2026 = [
  { label: 'Courses', value: 32000, target: 40000 },
  { label: 'Restaurants', value: 13700, target: 15000 },
  { label: 'Loisirs', value: 16450, target: 12000 },
  { label: 'Transport', value: 4500, target: 18000 },
] as const
