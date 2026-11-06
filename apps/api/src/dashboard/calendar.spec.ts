import { describe, expect, it } from 'vitest'
import { currentMonth, monthEnd, monthsUntil, shiftMonth } from './calendar'

describe('dashboard calendar', () => {
  it('reads the current month in Europe/Paris, not UTC', () => {
    // 23:30 UTC on Oct 31 is already November 1st in Paris (UTC+1).
    expect(currentMonth(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11')
    // Summer time (UTC+2): 22:30 UTC on Jun 30 is July 1st in Paris.
    expect(currentMonth(new Date('2026-06-30T22:30:00Z'))).toBe('2026-07')
    expect(currentMonth(new Date('2026-06-30T21:30:00Z'))).toBe('2026-06')
  })

  it('shifts months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2025-12', 1)).toBe('2026-01')
    expect(shiftMonth('2026-11', -23)).toBe('2024-12')
  })

  it('tells the last day of a month, leap years included', () => {
    expect(monthEnd('2024-02')).toBe('2024-02-29')
    expect(monthEnd('2026-02')).toBe('2026-02-28')
    expect(monthEnd('2026-12')).toBe('2026-12-31')
    expect(monthEnd('2026-04')).toBe('2026-04-30')
  })

  it('lists the months ending with a month, oldest first', () => {
    expect(monthsUntil('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
    expect(monthsUntil('2026-02', 1)).toEqual(['2026-02'])
  })
})
