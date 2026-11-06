import { describe, expect, it } from 'vitest'
import { currentParisMonth, monthRange, shiftMonth } from './months'

describe('budget months', () => {
  it('reads the current month in Europe/Paris, not UTC', () => {
    // 23:30 UTC on 31 October is already 1 November in Paris (UTC+1).
    expect(currentParisMonth(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11')
    // 22:30 UTC on 30 June is 00:30 on 1 July in Paris (UTC+2, summer time).
    expect(currentParisMonth(new Date('2026-06-30T22:30:00Z'))).toBe('2026-07')
    expect(currentParisMonth(new Date('2026-06-30T21:30:00Z'))).toBe('2026-06')
  })

  it('shifts months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2025-12', 1)).toBe('2026-01')
    expect(shiftMonth('2026-03', -14)).toBe('2025-01')
  })

  it('lists the months ending with the last one, oldest first', () => {
    expect(monthRange('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
  })
})
