import { describe, expect, it } from 'vitest'

import {
  calendarToTime,
  formatCompactEuros,
  formatEuros,
  formatPercent,
  formatSignedEuros,
  formatWholeEuros,
  timeToCalendar,
} from './format'

/** Intl uses (narrow) no-break spaces in fr-FR; compare with plain spaces. */
const plain = (text: string) => text.replace(/\s/g, ' ')

describe('chart formatters', () => {
  it('never print a signed zero', () => {
    expect(plain(formatEuros(-0))).toBe('0,00 €')
    expect(plain(formatWholeEuros(-0))).toBe('0 €')
    expect(plain(formatWholeEuros(-40))).toBe('0 €')
    expect(plain(formatCompactEuros(-0))).toBe('0 €')
    expect(plain(formatCompactEuros(-4))).toBe('0 €')
    expect(plain(formatPercent(-0.00001))).toBe('0 %')
    expect(plain(formatSignedEuros(-0))).toBe('0,00 €')
    expect(plain(formatSignedEuros(-0.4))).toBe('0,00 €')
  })

  it('keep the sign of negatives that do not round to zero', () => {
    expect(plain(formatEuros(-1))).toBe('-0,01 €')
    expect(plain(formatWholeEuros(-60))).toBe('-1 €')
    expect(plain(formatCompactEuros(-123456))).toBe('-1,2 k €')
  })

  it('round-trip calendar dates through UTC timestamps', () => {
    expect(calendarToTime('2026-03-29')).toBe(Date.UTC(2026, 2, 29))
    expect(calendarToTime('2026-03')).toBe(Date.UTC(2026, 2, 1))
    expect(calendarToTime('29/03/2026')).toBeUndefined()
    expect(timeToCalendar(Date.UTC(2026, 9, 25))).toBe('2026-10-25')
  })
})
