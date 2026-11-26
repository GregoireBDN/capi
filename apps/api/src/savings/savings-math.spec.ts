import { describe, expect, it } from 'vitest'
import {
  averageOver,
  type MonthFigures,
  monthsLeft,
} from './savings-math'

const TODAY = '2026-11-06'

function figures(
  month: string,
  overrides: Partial<MonthFigures> = {},
): [string, MonthFigures] {
  return [
    month,
    {
      month,
      incomeCents: 0,
      expenseCents: 0,
      oneOffIncomeCents: 0,
      oneOffExpenseCents: 0,
      movedToSavingsCents: 0,
      movedToInvestmentsCents: 0,
      ...overrides,
    },
  ]
}

describe('monthsLeft', () => {
  it('counts the month ends from today to the target date', () => {
    expect(monthsLeft(TODAY, '2026-11-30')).toBe(1)
    expect(monthsLeft(TODAY, '2026-12-31')).toBe(2)
    expect(monthsLeft(TODAY, '2026-12-15')).toBe(1)
    expect(monthsLeft(TODAY, '2027-03-31')).toBe(5)
    expect(monthsLeft(TODAY, '2027-11-05')).toBe(12)
  })

  it('is at least 1 for a date later this month and 0 once passed', () => {
    expect(monthsLeft(TODAY, '2026-11-06')).toBe(1)
    expect(monthsLeft(TODAY, '2026-11-20')).toBe(1)
    expect(monthsLeft(TODAY, '2026-11-05')).toBe(0)
  })

  it('handles leap-year month ends', () => {
    expect(monthsLeft('2028-01-10', '2028-02-29')).toBe(2)
    expect(monthsLeft('2028-01-10', '2028-02-28')).toBe(1)
  })
})

describe('averageOver', () => {
  const data = new Map([
    figures('2026-08', {
      incomeCents: 300_000,
      expenseCents: -100_000,
      movedToSavingsCents: 50_000,
    }),
    figures('2026-09', {
      incomeCents: 300_000,
      expenseCents: -350_000,
      oneOffExpenseCents: -150_000,
    }),
    figures('2026-10', { incomeCents: 300_000, expenseCents: -100_000 }),
    // The current month never counts.
    figures('2026-11', { incomeCents: 9_000_000 }),
  ])

  it('averages the full months before the current one', () => {
    expect(averageOver(data, '2026-11', 3, '2026-01')).toEqual({
      months: 3,
      monthCount: 3,
      from: '2026-08',
      to: '2026-10',
      incomeCents: 300_000,
      expenseCents: -183_333,
      netCents: 116_667,
      netExcludingOneOffsCents: 166_667,
      movedCents: 16_667,
      savingsRate: 350_000 / 900_000,
    })
  })

  it('skips the months before the first data and counts empty months after it', () => {
    const six = averageOver(data, '2026-11', 6, '2026-08')
    expect(six.monthCount).toBe(3)
    expect(six.from).toBe('2026-08')
    expect(six.netCents).toBe(116_667)

    const fromJuly = averageOver(data, '2026-11', 6, '2026-07')
    expect(fromJuly.monthCount).toBe(4)
    expect(fromJuly.netCents).toBe(87_500)
  })

  it('returns nulls without any month to average', () => {
    expect(averageOver(data, '2026-11', 3, null)).toMatchObject({
      monthCount: 0,
      netCents: null,
      savingsRate: null,
    })
    expect(averageOver(data, '2026-11', 3, '2026-11').monthCount).toBe(0)
  })
})
