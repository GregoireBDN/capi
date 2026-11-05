import { describe, expect, it } from 'vitest'
import { formatCalendarDate, formatCents } from './money'

/** Intl uses (narrow) no-break spaces in fr-FR; compare with plain spaces. */
const spaces = (text: string) => text.replace(/\s/g, ' ')

describe('money', () => {
  it('formats integer cents as euros only at display', () => {
    expect(spaces(formatCents(123456))).toBe('1 234,56 €')
    expect(spaces(formatCents(-1250))).toBe('-12,50 €')
    expect(spaces(formatCents(5))).toBe('0,05 €')
    expect(spaces(formatCents(0))).toBe('0,00 €')
  })

  it('formats calendar dates without a time zone shift', () => {
    expect(spaces(formatCalendarDate('2026-01-01'))).toBe('1 janv. 2026')
    expect(spaces(formatCalendarDate('2026-12-31'))).toBe('31 déc. 2026')
  })
})
