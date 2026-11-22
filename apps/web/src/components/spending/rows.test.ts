import { describe, expect, it } from 'vitest'
import type {
  CategorySpendingDto,
  SpendingByCategoryDto,
} from '#/api/types.gen'
import {
  comparedWithText,
  comparisonCaption,
  isWithoutSpending,
  rowComparison,
  targetRatio,
} from './rows'

/** Synthetic data only. */
function item(
  overrides: Partial<CategorySpendingDto> = {},
): CategorySpendingDto {
  return {
    categoryId: 'c0000000-0000-4000-8000-000000000001',
    slug: 'groceries',
    name: 'Courses',
    color: null,
    icon: null,
    spentCents: 12_000,
    share: 0.5,
    transactionCount: 3,
    previousSpentCents: 10_000,
    deltaCents: 2_000,
    averageCents: 15_000,
    notYetThisMonth: false,
    targetCents: null,
    expectedCents: 0,
    accountId: null,
    accountType: null,
    inCents: null,
    outCents: null,
    ...overrides,
  }
}

const complete: Pick<
  SpendingByCategoryDto,
  'period' | 'previousMonth' | 'month' | 'averageMonths'
> = {
  month: '2026-10',
  previousMonth: '2026-09',
  averageMonths: 6,
  period: {
    month: '2026-10',
    dataUntil: '2026-11-03',
    status: 'complete',
    throughDay: null,
    previousMonth: '2026-09',
    previousUntil: '2026-09-30',
    defaultMonth: '2026-11',
  },
}

const partial: typeof complete = {
  month: '2026-11',
  previousMonth: '2026-10',
  averageMonths: 3,
  period: {
    month: '2026-11',
    dataUntil: '2026-11-03',
    status: 'partial',
    throughDay: 3,
    previousMonth: '2026-10',
    previousUntil: '2026-10-03',
    defaultMonth: '2026-11',
  },
}

describe('rowComparison', () => {
  it('compares with the previous month or with the average', () => {
    expect(rowComparison(item(), 'previous')).toEqual({
      type: 'delta',
      cents: 2_000,
    })
    expect(rowComparison(item(), 'average')).toEqual({
      type: 'delta',
      cents: -3_000,
    })
  })

  it('shows nothing against an average without history', () => {
    expect(rowComparison(item({ averageCents: null }), 'average')).toEqual({
      type: 'none',
    })
  })

  it('never shows an unpaid cost as a saving', () => {
    const notYet = item({
      spentCents: 0,
      transactionCount: 0,
      deltaCents: -10_000,
      notYetThisMonth: true,
    })
    expect(rowComparison(notYet, 'previous')).toEqual({ type: 'not-yet' })
    expect(rowComparison(notYet, 'average')).toEqual({ type: 'not-yet' })
    // Expected later this month: "attendu" says it, no comparison.
    expect(
      rowComparison({ ...notYet, expectedCents: 80_000 }, 'previous'),
    ).toEqual({
      type: 'none',
    })
  })

  it('keeps the comparison of a category partly paid', () => {
    expect(rowComparison(item({ expectedCents: 1_399 }), 'previous')).toEqual({
      type: 'delta',
      cents: 2_000,
    })
  })
})

describe('isWithoutSpending', () => {
  it('folds the categories with nothing spent nor expected this month', () => {
    expect(isWithoutSpending(item())).toBe(false)
    expect(
      isWithoutSpending(item({ spentCents: 0, transactionCount: 0 })),
    ).toBe(true)
    expect(
      isWithoutSpending(
        item({ spentCents: 0, transactionCount: 0, expectedCents: 80_000 }),
      ),
    ).toBe(false)
    // A refund that nets the month to zero is still activity.
    expect(
      isWithoutSpending(item({ spentCents: 0, transactionCount: 2 })),
    ).toBe(false)
  })
})

describe('targetRatio', () => {
  it('is spent over the target, null without a target', () => {
    expect(targetRatio(item())).toBeNull()
    expect(targetRatio(item({ targetCents: 40_000 }))).toBeCloseTo(0.3)
    expect(targetRatio(item({ targetCents: 10_000 }))).toBeCloseTo(1.2)
    // Refunds above the spending never draw a negative bar.
    expect(targetRatio(item({ spentCents: -500, targetCents: 10_000 }))).toBe(0)
  })
})

describe('comparisonCaption / comparedWithText', () => {
  it('names the previous month, or its same first days', () => {
    expect(comparisonCaption(complete, 'previous')).toBe('Écart avec septembre')
    expect(comparedWithText(complete, 'previous')).toBe(
      'par rapport à septembre',
    )
    expect(comparisonCaption(partial, 'previous')).toBe(
      'Écart avec le 1–3 oct.',
    )
    expect(comparedWithText(partial, 'previous')).toBe(
      'par rapport au 1–3 oct.',
    )
  })

  it('names the average window', () => {
    expect(comparisonCaption(complete, 'average')).toBe(
      'Écart avec la moyenne sur 6 mois',
    )
    expect(comparisonCaption(partial, 'average')).toBe(
      'Écart avec la moyenne sur 3 mois (mêmes jours)',
    )
    expect(comparedWithText(partial, 'average')).toBe(
      'par rapport à la moyenne',
    )
  })
})
