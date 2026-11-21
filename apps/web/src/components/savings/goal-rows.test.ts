import { describe, expect, it } from 'vitest'
import type { SavingsGoalDto } from '#/api/types.gen'
import { deadlineHelp } from './GoalEditor'
import { goalStatus, goalWhen, goalsMonthlyNeed } from './GoalsSection'
import { monthStatus } from './MonthCard'

/** Synthetic goal: 2 500 € saved of 10 000 €, due in March 2027. */
function goal(overrides: Partial<SavingsGoalDto> = {}): SavingsGoalDto {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    name: 'Objectif test',
    targetCents: 1_000_000,
    targetDate: '2027-03-31',
    source: 'manual',
    manualAmountCents: 250_000,
    accountIds: [],
    color: null,
    archived: false,
    currentCents: 250_000,
    progressRatio: 0.25,
    remainingCents: 750_000,
    reached: false,
    monthsLeft: 5,
    targetDatePassed: false,
    requiredMonthlyCents: 150_000,
    projection: {
      averageMonthlyCents: 110_000,
      reachable: true,
      monthsNeeded: 7,
      projectedDate: '2027-05-31',
      onTrack: false,
    },
    ...overrides,
  }
}

const projection = goal().projection

describe('goalStatus', () => {
  it('says how the goal stands in a word or two', () => {
    expect(goalStatus(goal())).toEqual({ label: 'En retard', tone: 'bad' })
    expect(
      goalStatus(goal({ projection: { ...projection, onTrack: true } })),
    ).toEqual({ label: 'Dans les temps', tone: 'good' })
    expect(
      goalStatus(
        goal({
          targetDate: null,
          projection: { ...projection, onTrack: null },
        }),
      ),
    ).toEqual({ label: 'Sans date', tone: 'neutral' })
    expect(
      goalStatus(
        goal({
          projection: { ...projection, reachable: false, projectedDate: null },
        }),
      ),
    ).toEqual({ label: 'Hors de portée', tone: 'bad' })
    expect(goalStatus(goal({ targetDatePassed: true })).label).toBe(
      'Échéance passée',
    )
    expect(goalStatus(goal({ reached: true })).label).toBe('Atteint')
    expect(goalStatus(goal({ archived: true, reached: true })).label).toBe(
      'Archivé',
    )
  })
})

describe('goalWhen', () => {
  it('gives the month reached at this pace, in the tone of its deadline', () => {
    expect(goalWhen(goal())).toEqual({
      label: 'mai 2027',
      tone: 'bad',
      late: true,
    })
    expect(
      goalWhen(goal({ projection: { ...projection, onTrack: true } })),
    ).toEqual({ label: 'mai 2027', tone: 'good', late: false })
    expect(
      goalWhen(
        goal({
          targetDate: null,
          projection: { ...projection, onTrack: null },
        }),
      ),
    ).toEqual({ label: 'mai 2027', tone: 'neutral', late: false })
  })

  it('says why there is no month, and nothing once reached', () => {
    expect(
      goalWhen(
        goal({
          projection: { ...projection, reachable: false, projectedDate: null },
        }),
      ),
    ).toEqual({ label: 'Hors de portée', tone: 'bad', late: true })
    expect(goalWhen(goal({ targetDatePassed: true }))?.label).toBe(
      'Échéance passée',
    )
    expect(goalWhen(goal({ reached: true }))).toBeNull()
    expect(goalWhen(goal({ archived: true }))).toBeNull()
  })
})

describe('goalsMonthlyNeed', () => {
  it('adds what the active goals need per month', () => {
    expect(
      goalsMonthlyNeed([
        goal(),
        goal({ requiredMonthlyCents: 35_000 }),
        goal({ reached: true }),
        goal({ archived: true }),
        goal({ requiredMonthlyCents: null }),
      ]),
    ).toBe(185_000)
    expect(goalsMonthlyNeed([goal({ requiredMonthlyCents: null })])).toBeNull()
    expect(goalsMonthlyNeed([])).toBeNull()
  })
})

describe('deadlineHelp', () => {
  it('states the monthly effort while the saved deadline is kept', () => {
    expect(deadlineHelp(goal(), '2027-03-31').replace(/\s/g, ' ')).toBe(
      'Soit 1 500,00 € par mois pendant 5 mois.',
    )
    expect(deadlineHelp(goal(), '2027-06-30')).toBe(
      'Facultative : sert à calculer l’effort mensuel.',
    )
    expect(deadlineHelp(undefined, '')).toBe(
      'Facultative : sert à calculer l’effort mensuel.',
    )
    expect(deadlineHelp(goal({ targetDatePassed: true }), '2027-03-31')).toBe(
      'Échéance passée.',
    )
  })
})

describe('monthStatus', () => {
  const full = {
    status: 'complete' as const,
    month: '2026-10',
    dataUntil: '2026-10-31',
  }
  it('judges a full month against its target, nothing without one', () => {
    expect(monthStatus(full, 98_000, 86_000, '2026-11')).toEqual({
      label: 'Cible atteinte',
      tone: 'good',
    })
    expect(monthStatus(full, 86_000, 86_000, '2026-11')?.tone).toBe('good')
    expect(monthStatus(full, 40_000, 86_000, '2026-11')).toEqual({
      label: 'Sous la cible',
      tone: 'bad',
    })
    expect(monthStatus(full, 40_000, null, '2026-11')).toBeNull()
  })

  it('gives no verdict while the data stops before the month end', () => {
    const running = {
      status: 'partial' as const,
      month: '2026-11',
      dataUntil: '2026-11-02',
    }
    expect(monthStatus(running, 0, 86_000, '2026-11')).toEqual({
      label: 'En cours',
      tone: 'neutral',
    })
    expect(
      monthStatus(
        { ...running, month: '2026-10', dataUntil: '2026-10-20' },
        0,
        86_000,
        '2026-11',
      )?.label.replace(/\s/g, ' '),
    ).toBe('Jusqu’au 20 oct.')
  })
})
