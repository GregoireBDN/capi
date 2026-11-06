import { describe, expect, it } from 'vitest'
import { formatCalendarDate, formatCents, formatUnsignedZero } from './money'

/** Intl uses (narrow) no-break spaces in fr-FR; compare with plain spaces. */
const spaces = (text: string) => text.replace(/\s/g, ' ')

describe('money', () => {
  it('formats integer cents as euros only at display', () => {
    expect(spaces(formatCents(123456))).toBe('1 234,56 €')
    expect(spaces(formatCents(-1250))).toBe('-12,50 €')
    expect(spaces(formatCents(5))).toBe('0,05 €')
    expect(spaces(formatCents(0))).toBe('0,00 €')
  })

  it('never prints a signed zero', () => {
    expect(spaces(formatCents(-0))).toBe('0,00 €')
    expect(spaces(formatCents(-0.4))).toBe('0,00 €')
    expect(spaces(formatCents(-1))).toBe('-0,01 €')
  })

  it('drops the sign of anything that rounds to zero', () => {
    const whole = new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    })
    expect(spaces(formatUnsignedZero(whole, -0.4))).toBe('0 €')
    expect(spaces(formatUnsignedZero(whole, -0.6))).toBe('-1 €')
    expect(spaces(formatUnsignedZero(whole, Number.NaN))).toBe('NaN €')
  })

  it('formats calendar dates without a time zone shift', () => {
    expect(spaces(formatCalendarDate('2026-01-01'))).toBe('1 janv. 2026')
    expect(spaces(formatCalendarDate('2026-12-31'))).toBe('31 déc. 2026')
  })
})
