import { describe, expect, it } from 'vitest'
import type { MonthReportDto } from './dto/month-close.dto'
import { REPORT_VERSION, upgradeReport } from './report-version'

const category = {
  categoryId: 'c1',
  name: 'Test courses',
  color: '#16a34a',
  kind: 'expense' as const,
  amountCents: -1_000,
  previousAmountCents: -800,
  targetCents: 2_000,
}

/** A synthetic stored report, in whatever shape a version had. */
function stored(overrides: Record<string, unknown> = {}) {
  return {
    month: '2026-10',
    flow: { incomeCents: 250_000, expenseCents: -1_000, netCents: 249_000 },
    netWorthCents: 1_000_000,
    savingsTargetCents: 50_000,
    categories: [
      category,
      { ...category, categoryId: 'gone', name: 'Ancienne' },
    ],
    oneOffs: [],
    notes: 'Mois test',
    ...overrides,
  }
}

const context = {
  icons: new Map([
    ['c1', 'shopping-cart' as const],
    ['other', 'utensils' as const],
  ]),
}

describe('upgradeReport', () => {
  it('writes version 2', () => {
    expect(REPORT_VERSION).toBe(2)
  })

  describe('1 → 2', () => {
    it('gives a report frozen before icons the current ones and no plan', () => {
      const report = upgradeReport(1, stored(), context)
      expect(report.categories.map((c) => c.icon)).toEqual([
        'shopping-cart',
        null,
      ])
      expect(report.plan).toBeNull()
    })

    it('keeps the icons and the plan a report was frozen with', () => {
      const plan = {
        plannedIncomeCents: 250_000,
        receivedIncomeCents: 250_000,
        budgetedExpensesCents: 2_000,
        plannedSavingsCents: 248_000,
        actualSavingsCents: 249_000,
      }
      const input = stored({
        categories: [
          { ...category, icon: 'utensils' },
          { ...category, categoryId: 'none', icon: null },
        ],
        plan,
      })
      const report = upgradeReport(1, input, context)
      expect(report.categories.map((c) => c.icon)).toEqual(['utensils', null])
      expect(report.plan).toEqual(plan)
    })

    it('never changes a figure', () => {
      const input = stored()
      const report = upgradeReport(1, input, context)
      const { categories, plan, ...rest } = report
      const { categories: storedCategories, ...storedRest } = input
      expect(rest).toEqual(storedRest)
      expect(plan).toBeNull()
      expect(categories.map(({ icon: _icon, ...c }) => c)).toEqual(
        storedCategories,
      )
    })
  })

  it('reads the current version as stored', () => {
    const current = stored({
      categories: [{ ...category, icon: null }],
      plan: null,
    }) as unknown as MonthReportDto
    expect(upgradeReport(REPORT_VERSION, current, context)).toBe(current)
  })

  it('refuses an unknown version', () => {
    expect(() => upgradeReport(0, stored(), context)).toThrow()
    expect(() => upgradeReport(REPORT_VERSION + 1, stored(), context)).toThrow()
  })
})
