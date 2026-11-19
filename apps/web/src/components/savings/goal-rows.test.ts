import { describe, expect, it } from 'vitest'
import type { SavingsGoalDto } from '#/api/types.gen'
import { deadlineHelp } from './GoalEditor'
import { goalStatus, goalWhen } from './GoalsSection'

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
  it('gives the deadline, else the projected month, as a short month', () => {
    expect(goalWhen(goal())).toBe('mars 2027')
    expect(goalWhen(goal({ targetDate: null }))).toBe('prévu mai 2027')
    expect(
      goalWhen(
        goal({
          targetDate: null,
          projection: { ...projection, projectedDate: null },
        }),
      ),
    ).toBeNull()
    expect(goalWhen(goal({ reached: true }))).toBeNull()
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
