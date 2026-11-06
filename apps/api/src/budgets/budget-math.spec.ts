import { describe, expect, it } from 'vitest'
import {
  type BudgetRow,
  budgetStatus,
  percentUsed,
  roundToEuro,
  targetsInEffect,
} from './budget-math'

describe('budgetStatus', () => {
  it.each([
    [0, 10_000, 'ok'],
    [7_999, 10_000, 'ok'],
    [8_000, 10_000, 'warning'],
    [10_000, 10_000, 'warning'],
    [10_001, 10_000, 'over'],
    // More refunds than spending.
    [-500, 10_000, 'ok'],
  ] as const)('%i spent of %i is %s', (spent, target, status) => {
    expect(budgetStatus(spent, target)).toBe(status)
  })
})

describe('percentUsed', () => {
  it('rounds to one decimal', () => {
    expect(percentUsed(1, 3)).toBe(33.3)
    expect(percentUsed(2, 3)).toBe(66.7)
    expect(percentUsed(25_000, 10_000)).toBe(250)
    expect(percentUsed(100, 0)).toBe(0)
  })
})

describe('roundToEuro', () => {
  it('rounds cents to the nearest euro', () => {
    expect(roundToEuro(31_149)).toBe(31_100)
    expect(roundToEuro(31_150)).toBe(31_200)
    expect(roundToEuro(49)).toBe(0)
  })
})

describe('targetsInEffect', () => {
  const row = (
    effectiveFrom: string,
    monthlyTargetCents: number | null,
    categoryId = 'groceries',
  ): BudgetRow => ({
    id: `${categoryId}-${effectiveFrom}`,
    categoryId,
    effectiveFrom,
    monthlyTargetCents,
    note: null,
  })
  const rows = [
    row('2026-07-01', 45_000),
    row('2026-03-01', 30_000),
    row('2026-10-01', null),
    row('2026-05-01', 80_000, 'rent'),
  ]

  it('takes the latest row on or before the month', () => {
    const target = (month: string) =>
      targetsInEffect(rows, month).get('groceries')?.monthlyTargetCents
    expect(target('2026-02')).toBeUndefined()
    expect(target('2026-03')).toBe(30_000)
    expect(target('2026-06')).toBe(30_000)
    expect(target('2026-07')).toBe(45_000)
    expect(target('2026-09')).toBe(45_000)
  })

  it('leaves out ended budgets', () => {
    expect([...targetsInEffect(rows, '2026-10').keys()]).toEqual(['rent'])
  })
})
