import { describe, expect, it } from 'vitest'
import {
  creditRunsIn,
  expectedByNow,
  expectedDateIn,
  type IncomeCredit,
  incomeLineStatus,
} from './income'

/** Synthetic recurring credits only. */
function credit(overrides: Partial<IncomeCredit> = {}): IncomeCredit {
  return {
    categoryId: 'salary',
    name: 'Test employeur',
    cadence: 'monthly',
    typicalAmountCents: 200_000,
    lastSeenDate: '2026-10-27',
    nextExpectedDate: '2026-11-27',
    endedOn: null,
    ...overrides,
  }
}

describe('expectedDateIn', () => {
  it('keeps the day of a monthly credit, month ends at month end', () => {
    expect(expectedDateIn(credit(), '2027-02')).toBe('2027-02-27')
    const monthEnd = credit({ nextExpectedDate: '2026-11-30' })
    expect(expectedDateIn(monthEnd, '2027-02')).toBe('2027-02-28')
    expect(expectedDateIn(monthEnd, '2026-12')).toBe('2026-12-31')
  })

  it('is due one month in three for a quarterly credit', () => {
    const quarterly = credit({
      cadence: 'quarterly',
      nextExpectedDate: '2027-01-05',
    })
    expect(expectedDateIn(quarterly, '2026-10')).toBe('2026-10-05')
    expect(expectedDateIn(quarterly, '2026-11')).toBeNull()
    expect(expectedDateIn(quarterly, '2027-04')).toBe('2027-04-05')
  })

  it('has no date for a weekly credit nor on or after its end', () => {
    expect(expectedDateIn(credit({ cadence: 'weekly' }), '2026-11')).toBeNull()
    expect(
      expectedDateIn(credit({ endedOn: '2026-12-27' }), '2026-12'),
    ).toBeNull()
    expect(expectedDateIn(credit({ endedOn: '2026-12-28' }), '2026-12')).toBe(
      '2026-12-27',
    )
  })
})

describe('creditRunsIn', () => {
  it('leaves out stale and cancelled series', () => {
    expect(creditRunsIn(credit(), '2026-12')).toBe(true)
    expect(
      creditRunsIn(credit({ lastSeenDate: '2026-08-27' }), '2026-12'),
    ).toBe(false)
    expect(creditRunsIn(credit({ endedOn: '2026-12-01' }), '2026-12')).toBe(
      false,
    )
  })
})

describe('expectedByNow', () => {
  it('expects nothing before the day, the plan once every day is past', () => {
    expect(expectedByNow([credit()], '2026-11', 210_000, '2026-11-09')).toEqual(
      { expectedByNowCents: 0, expectedOn: '2026-11-27' },
    )
    expect(expectedByNow([credit()], '2026-11', 210_000, '2026-11-27')).toEqual(
      { expectedByNowCents: 210_000, expectedOn: null },
    )
  })

  it('counts the credits already due in between, capped at the plan', () => {
    const early = credit({
      name: 'Test acompte',
      typicalAmountCents: 80_000,
      nextExpectedDate: '2026-11-05',
    })
    expect(
      expectedByNow([early, credit()], '2026-11', 250_000, '2026-11-09'),
    ).toEqual({ expectedByNowCents: 80_000, expectedOn: '2026-11-27' })
    expect(
      expectedByNow([early, credit()], '2026-11', 50_000, '2026-11-09'),
    ).toEqual({ expectedByNowCents: 50_000, expectedOn: '2026-11-27' })
  })

  it('knows nothing without a dated credit', () => {
    expect(expectedByNow([], '2026-11', 10_000, '2026-11-09')).toEqual({
      expectedByNowCents: null,
      expectedOn: null,
    })
  })
})

describe('incomeLineStatus', () => {
  it('reads a complete month against the plan', () => {
    expect(incomeLineStatus('complete', 100, 100, null)).toBe('received')
    expect(incomeLineStatus('complete', 100, 60, null)).toBe('short')
    expect(incomeLineStatus('complete', 100, 0, null)).toBe('missing')
  })

  it('reads a partial month against what was due by then', () => {
    expect(incomeLineStatus('partial', 100, 0, 0)).toBe('pending')
    expect(incomeLineStatus('partial', 100, 0, 100)).toBe('missing')
    expect(incomeLineStatus('partial', 100, 40, 100)).toBe('short')
    expect(incomeLineStatus('partial', 100, 40, null)).toBe('so_far')
    expect(incomeLineStatus('partial', 100, 120, null)).toBe('received')
  })

  it('has nothing to say about an empty month', () => {
    expect(incomeLineStatus('empty', 100, null, null)).toBe('pending')
  })
})
