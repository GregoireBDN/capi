import { describe, expect, it } from 'vitest'
import type { TodoInput } from './glance'
import {
  budgetPace,
  buildTodos,
  daysBetween,
  daysInMonth,
  isStale,
  STALE_AFTER_DAYS,
} from './glance'

/** Synthetic data only. */
const quiet: TodoInput = {
  today: '2026-11-21',
  dataUntil: '2026-11-19',
  hasBankAccount: true,
  previous: {
    month: '2026-10',
    closed: true,
    missing: 0,
    nextMonthBudgeted: true,
  },
  reviewCount: 0,
  repayments: [],
  renewals: [],
  suggestedSubscriptions: 0,
  staleValues: 0,
}

describe('daysBetween / isStale', () => {
  it('counts calendar days, across months and years', () => {
    expect(daysBetween('2026-11-11', '2026-11-21')).toBe(10)
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2026-11-21', '2026-11-21')).toBe(0)
  })

  it('calls data stale past seven days, not on the seventh', () => {
    expect(STALE_AFTER_DAYS).toBe(7)
    expect(isStale('2026-11-14', '2026-11-21')).toBe(false)
    expect(isStale('2026-11-13', '2026-11-21')).toBe(true)
    expect(isStale(null, '2026-11-21')).toBe(false)
  })
})

describe('buildTodos', () => {
  it('has nothing to do when everything is up to date', () => {
    expect(buildTodos(quiet)).toEqual([])
  })

  it('puts the import first, then the close, then the rest in order', () => {
    const todos = buildTodos({
      ...quiet,
      dataUntil: '2026-11-11',
      previous: {
        month: '2026-10',
        closed: false,
        missing: 2,
        nextMonthBudgeted: false,
      },
      reviewCount: 7,
      repayments: [
        { contactName: 'Camille', amountCents: 2_400 },
        { contactName: 'Sam', amountCents: 1_000 },
      ],
      renewals: [
        { id: 'b', name: 'Antivirus test', renewalDate: '2026-12-02' },
        { id: 'a', name: 'Serveur test', renewalDate: '2026-11-28' },
      ],
      suggestedSubscriptions: 5,
      staleValues: 1,
    })
    expect(todos.map((todo) => todo.kind)).toEqual([
      'import',
      'close',
      'review',
      'repayment',
      'renewal',
      'renewal',
      'subscriptions',
      'values',
    ])
    expect(todos[0]).toEqual({
      kind: 'import',
      dataUntil: '2026-11-11',
      ageDays: 10,
    })
    expect(todos[1]).toEqual({ kind: 'close', month: '2026-10', missing: 2 })
    expect(todos[3]).toEqual({
      kind: 'repayment',
      count: 2,
      contactName: 'Camille',
      amountCents: 2_400,
    })
    // The nearest renewal first.
    expect(todos[4]).toMatchObject({ kind: 'renewal', id: 'a' })
  })

  it('asks for the budget only once last month is closed', () => {
    const open = buildTodos({
      ...quiet,
      previous: { ...quiet.previous!, closed: false, nextMonthBudgeted: false },
    })
    expect(open.map((todo) => todo.kind)).toEqual(['close'])
    const closed = buildTodos({
      ...quiet,
      previous: { ...quiet.previous!, nextMonthBudgeted: false },
    })
    expect(closed).toEqual([{ kind: 'budget', month: '2026-11' }])
  })

  it('asks for a first import, never without a bank account', () => {
    expect(buildTodos({ ...quiet, dataUntil: null })).toEqual([
      { kind: 'import', dataUntil: null, ageDays: null },
    ])
    expect(
      buildTodos({ ...quiet, dataUntil: '2026-09-01', hasBankAccount: false }),
    ).toEqual([])
  })

  it('skips the close without a previous month to close', () => {
    expect(buildTodos({ ...quiet, previous: null })).toEqual([])
  })
})

describe('budgetPace', () => {
  it('reads the month against an even pace at the day given', () => {
    // 2 225 € over 30 days, day 21: the pace is 1 557,50 €.
    expect(
      budgetPace({
        targetCents: 222_500,
        spentCents: 118_000,
        day: 21,
        daysInMonth: 30,
      }),
    ).toEqual({
      leftCents: 104_500,
      paceCents: 155_750,
      aheadCents: -37_750,
      over: false,
      state: 'under',
    })
  })

  it('is on pace within 10 €, ahead above it, over past the target', () => {
    const at = (spentCents: number, day = 15) =>
      budgetPace({ targetCents: 60_000, spentCents, day, daysInMonth: 30 })
        .state
    expect(at(30_500)).toBe('on')
    expect(at(29_200)).toBe('on')
    expect(at(28_900)).toBe('under')
    expect(at(31_100)).toBe('ahead')
    expect(at(60_100, 28)).toBe('over')
  })

  it('has no pace before the first day of data', () => {
    expect(
      budgetPace({
        targetCents: 60_000,
        spentCents: 0,
        day: 0,
        daysInMonth: 31,
      }).paceCents,
    ).toBe(0)
  })
})

describe('daysInMonth', () => {
  it('knows the length of each month, leap years included', () => {
    expect(daysInMonth('2026-11')).toBe(30)
    expect(daysInMonth('2026-12')).toBe(31)
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29)
  })
})
