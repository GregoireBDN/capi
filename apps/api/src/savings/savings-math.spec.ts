import { describe, expect, it } from 'vitest'
import {
  averageOver,
  goalPlan,
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

describe('goalPlan', () => {
  const base = {
    targetCents: 200_000,
    today: TODAY,
    averageMonthlyCents: 40_000,
  }

  it('computes progress, the monthly amount needed and the reach date', () => {
    expect(
      goalPlan({ ...base, currentCents: 50_000, targetDate: '2027-03-31' }),
    ).toEqual({
      currentCents: 50_000,
      progressRatio: 0.25,
      remainingCents: 150_000,
      reached: false,
      monthsLeft: 5,
      targetDatePassed: false,
      requiredMonthlyCents: 30_000,
      projection: {
        averageMonthlyCents: 40_000,
        reachable: true,
        monthsNeeded: 4,
        projectedDate: '2027-02-28',
        onTrack: true,
      },
    })
  })

  it('rounds the monthly amount up and flags a late projection', () => {
    const plan = goalPlan({
      ...base,
      currentCents: 0,
      targetDate: '2027-01-31',
    })
    expect(plan.monthsLeft).toBe(3)
    expect(plan.requiredMonthlyCents).toBe(66_667)
    expect(plan.projection.projectedDate).toBe('2027-03-31')
    expect(plan.projection.onTrack).toBe(false)
  })

  it('has no monthly amount once the target date has passed', () => {
    const plan = goalPlan({
      ...base,
      currentCents: 0,
      targetDate: '2026-10-31',
    })
    expect(plan.targetDatePassed).toBe(true)
    expect(plan.monthsLeft).toBe(0)
    expect(plan.requiredMonthlyCents).toBeNull()
    expect(plan.projection.reachable).toBe(true)
    expect(plan.projection.onTrack).toBe(false)
  })

  it('is not reachable when the average is zero, negative or unknown', () => {
    for (const averageMonthlyCents of [0, -10_000, null]) {
      const plan = goalPlan({
        ...base,
        averageMonthlyCents,
        currentCents: 0,
        targetDate: '2027-12-31',
      })
      expect(plan.projection).toEqual({
        averageMonthlyCents,
        reachable: false,
        monthsNeeded: null,
        projectedDate: null,
        onTrack: false,
      })
      expect(plan.requiredMonthlyCents).toBe(Math.ceil(200_000 / 14))
    }
  })

  it('has no date-based figures without a target date', () => {
    const plan = goalPlan({ ...base, currentCents: 0, targetDate: null })
    expect(plan.monthsLeft).toBeNull()
    expect(plan.requiredMonthlyCents).toBeNull()
    expect(plan.projection.onTrack).toBeNull()
    expect(plan.projection.projectedDate).toBe('2027-03-31')
  })

  it('is reached once the current amount covers the target', () => {
    const plan = goalPlan({
      ...base,
      averageMonthlyCents: -5_000,
      currentCents: 250_000,
      targetDate: '2026-10-31',
    })
    expect(plan).toMatchObject({
      progressRatio: 1.25,
      remainingCents: 0,
      reached: true,
      requiredMonthlyCents: 0,
      projection: { reachable: true, monthsNeeded: 0, onTrack: true },
    })
  })
})
