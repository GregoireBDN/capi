import { describe, expect, it } from 'vitest'
import { defaultMonth, monthPeriod, sameDaysEnd } from './period'

describe('month periods', () => {
  const today = '2026-11-03'

  it('is partial up to the last day with data', () => {
    expect(monthPeriod('2026-11', '2026-11-03', today)).toEqual({
      month: '2026-11',
      dataUntil: '2026-11-03',
      status: 'partial',
      throughDay: 3,
      previousMonth: '2026-10',
      previousUntil: '2026-10-03',
      defaultMonth: '2026-11',
    })
  })

  it('is empty when the data stops before the month', () => {
    const period = monthPeriod('2026-11', '2026-10-31', today)
    expect(period.status).toBe('empty')
    expect(period.throughDay).toBeNull()
    expect(period.previousUntil).toBeNull()
    expect(period.defaultMonth).toBe('2026-10')
    expect(monthPeriod('2026-11', null, today).status).toBe('empty')
  })

  it('is complete when the data reaches the month end', () => {
    const period = monthPeriod('2026-10', '2026-10-31', today)
    expect(period.status).toBe('complete')
    expect(period.throughDay).toBeNull()
    expect(period.previousUntil).toBe('2026-09-30')
    expect(monthPeriod('2026-09', '2026-11-03', today).status).toBe('complete')
  })

  it('compares with the same days of a shorter month', () => {
    // 30 March vs February: the whole of February (28 days in 2026).
    expect(monthPeriod('2026-03', '2026-03-30', '2026-03-30')).toMatchObject({
      status: 'partial',
      throughDay: 30,
      previousUntil: '2026-02-28',
    })
    expect(sameDaysEnd('2024-02', 30)).toBe('2024-02-29')
    expect(sameDaysEnd('2026-10', 3)).toBe('2026-10-03')
    expect(sameDaysEnd('2026-10', null)).toBe('2026-10-31')
  })

  it('defaults to the current month when it has data, else the last month with data', () => {
    expect(defaultMonth('2026-11-02', '2026-11-01')).toBe('2026-11')
    expect(defaultMonth('2026-11-02', '2026-10-28')).toBe('2026-10')
    expect(defaultMonth('2026-11-02', '2026-08-15')).toBe('2026-08')
    expect(defaultMonth('2026-11-02', null)).toBe('2026-11')
  })
})
