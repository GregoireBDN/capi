import { describe, expect, it } from 'vitest'
import {
  divideHalfEven,
  matchRenewals,
  prepaidActive,
  prepaidMonthlyCents,
  prepaidYearlyCents,
  renewalDate,
  renewalReminderDue,
} from './prepaid'

/** Synthetic amounts and dates only. */
describe('prepaid subscriptions (#314)', () => {
  it('rounds half to even', () => {
    expect(divideHalfEven(5, 2)).toBe(2)
    expect(divideHalfEven(7, 2)).toBe(4)
    expect(divideHalfEven(10, 4)).toBe(2)
    expect(divideHalfEven(14, 4)).toBe(4)
    expect(divideHalfEven(13, 4)).toBe(3)
    expect(divideHalfEven(-5, 2)).toBe(-2)
    expect(divideHalfEven(0, 12)).toBe(0)
  })

  it('spreads the payment over 12, 24 and 36 months in exact cents', () => {
    expect(prepaidMonthlyCents(18_000, 12)).toBe(1_500)
    expect(prepaidMonthlyCents(18_000, 24)).toBe(750)
    expect(prepaidMonthlyCents(18_000, 36)).toBe(500)
    // 99,99 € / 12 = 8,3325 € → 8,33 €; / 24 = 4,16625 € → 4,17 €.
    expect(prepaidMonthlyCents(9_999, 12)).toBe(833)
    expect(prepaidMonthlyCents(9_999, 24)).toBe(417)
    // 1,02 € / 24 = 4,25 c → 4 c; 1,08 € / 24 = 4,5 c → 4 c (even); 1,32 € → 5,5 c → 6 c.
    expect(prepaidMonthlyCents(102, 24)).toBe(4)
    expect(prepaidMonthlyCents(108, 24)).toBe(4)
    expect(prepaidMonthlyCents(132, 24)).toBe(6)
    // 1,30 € / 36 = 3,61 c → 4 c.
    expect(prepaidMonthlyCents(130, 36)).toBe(4)
  })

  it('gives the yearly cost as payment × 12 ÷ term', () => {
    expect(prepaidYearlyCents(18_000, 12)).toBe(18_000)
    expect(prepaidYearlyCents(18_000, 24)).toBe(9_000)
    expect(prepaidYearlyCents(18_000, 36)).toBe(6_000)
    // 99,99 € × 12 / 36 = 33,33 €.
    expect(prepaidYearlyCents(9_999, 36)).toBe(3_333)
    // 1,05 € × 12 / 24 = 52,5 c → 52 c (even).
    expect(prepaidYearlyCents(105, 24)).toBe(52)
  })

  it('renews after the term, across month ends and leap years', () => {
    expect(renewalDate('2026-11-07', 24)).toBe('2028-11-07')
    expect(renewalDate('2026-01-31', 13)).toBe('2027-02-28')
    expect(renewalDate('2027-02-28', 12)).toBe('2028-02-28')
    expect(renewalDate('2024-02-29', 12)).toBe('2025-02-28')
    expect(renewalDate('2024-02-29', 48)).toBe('2028-02-29')
    expect(renewalDate('2025-08-31', 36)).toBe('2028-08-31')
    expect(renewalDate('2025-12-31', 2)).toBe('2026-02-28')
  })

  it('links the charge closest to each renewal date, within 30 days', () => {
    const candidates = [
      { id: 'early', date: '2025-06-03' },
      { id: 'late', date: '2025-12-31' },
      { id: 'renewal', date: '2025-12-02' },
      { id: 'second', date: '2026-11-25' },
      { id: 'far', date: '2028-06-01' },
    ]
    expect(matchRenewals('2024-11-29', 12, candidates)).toEqual([
      { id: 'renewal', date: '2025-12-02' },
      { id: 'second', date: '2026-11-25' },
    ])
    expect(
      matchRenewals('2024-11-29', 24, candidates).map((c) => c.id),
    ).toEqual(['second'])
    expect(matchRenewals('2024-11-29', 36, candidates)).toEqual([])
    // On a tie, the earlier charge.
    expect(
      matchRenewals('2025-01-10', 12, [
        { id: 'after', date: '2026-01-12' },
        { id: 'before', date: '2026-01-08' },
      ]).map((c) => c.id),
    ).toEqual(['before'])
  })

  it('stays active until the renewal window is over', () => {
    expect(prepaidActive('2026-12-02', '2026-11-06')).toBe(true)
    expect(prepaidActive('2026-12-02', '2027-01-01')).toBe(true)
    expect(prepaidActive('2026-12-02', '2027-01-02')).toBe(false)
  })

  it('reminds from 30 days before the renewal, unless kept or cancelled', () => {
    const base = {
      renewalOn: '2026-12-02',
      endedOn: null,
      renewalKeptOn: null,
    }
    expect(renewalReminderDue({ ...base, today: '2026-11-01' })).toBe(false)
    expect(renewalReminderDue({ ...base, today: '2026-11-02' })).toBe(true)
    expect(renewalReminderDue({ ...base, today: '2026-12-02' })).toBe(true)
    expect(renewalReminderDue({ ...base, today: '2026-12-03' })).toBe(false)
    expect(
      renewalReminderDue({
        ...base,
        renewalKeptOn: '2026-12-02',
        today: '2026-11-20',
      }),
    ).toBe(false)
    // A renewal kept two years ago does not silence this one.
    expect(
      renewalReminderDue({
        ...base,
        renewalKeptOn: '2024-12-02',
        today: '2026-11-20',
      }),
    ).toBe(true)
    expect(
      renewalReminderDue({
        ...base,
        endedOn: '2026-12-02',
        today: '2026-11-20',
      }),
    ).toBe(false)
  })
})
