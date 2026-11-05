import { describe, expect, it } from 'vitest'
import {
  currentMonth,
  formatDay,
  formatMonth,
  isMonth,
  shiftMonth,
} from './calendar'

describe('calendar', () => {
  it('reads the current month in Europe/Paris', () => {
    // 23:30 UTC on Oct 31 is already November in Paris (UTC+1).
    expect(currentMonth(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11')
    // 22:30 UTC on Mar 31 is 00:30 in Paris (summer time, UTC+2).
    expect(currentMonth(new Date('2026-03-31T22:30:00Z'))).toBe('2026-04')
    expect(currentMonth(new Date('2026-03-31T21:30:00Z'))).toBe('2026-03')
    expect(currentMonth(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01')
  })

  it('moves across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2025-12', 1)).toBe('2026-01')
    expect(shiftMonth('2026-05', 0)).toBe('2026-05')
    expect(shiftMonth('2026-05', -17)).toBe('2024-12')
  })

  it('validates months', () => {
    expect(isMonth('2026-11')).toBe(true)
    expect(isMonth('2026-13')).toBe(false)
    expect(isMonth('2026-1')).toBe(false)
  })

  it('labels months and days in French, without shifting them', () => {
    expect(formatMonth('2026-11')).toBe('Novembre 2026')
    expect(formatMonth('2027-01')).toBe('Janvier 2027')
    expect(formatDay('2026-11-03')).toBe('Mardi 3 novembre 2026')
    expect(formatDay('2026-03-01')).toBe('Dimanche 1 mars 2026')
  })
})
