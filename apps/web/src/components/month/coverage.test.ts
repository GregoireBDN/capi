import { describe, expect, it } from 'vitest'
import { nearestMonthWithData } from './coverage'

describe('nearestMonthWithData', () => {
  const months = ['2026-03', '2026-08', '2026-09']

  it('offers the latest month with data before the empty one', () => {
    expect(nearestMonthWithData(months, '2026-11')).toBe('2026-09')
    expect(nearestMonthWithData(months, '2026-06')).toBe('2026-03')
  })

  it('offers the earliest one after it when there is nothing before', () => {
    expect(nearestMonthWithData(months, '2025-12')).toBe('2026-03')
  })

  it('offers nothing without data', () => {
    expect(nearestMonthWithData([], '2026-11')).toBeNull()
  })
})
