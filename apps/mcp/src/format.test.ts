import { describe, expect, it } from 'vitest'
import {
  addMonths,
  centsToText,
  parseEuros,
  addDays,
  euros,
  frenchDate,
  frenchMonth,
  parisToday,
  percent,
  periodNote,
  shortMonth,
  signedEuros,
  table,
} from './format.js'
import { period } from './test/fixtures.js'

describe('format', () => {
  it('formats cents as French euros with plain spaces', () => {
    expect(euros(123456)).toBe('1 234,56 €')
    expect(euros(-4520)).toBe('-45,20 €')
    expect(euros(0)).toBe('0,00 €')
    expect(euros(100000000)).toBe('1 000 000,00 €')
    expect(signedEuros(500)).toBe('+5,00 €')
    expect(signedEuros(-500)).toBe('-5,00 €')
  })

  it('formats ratios as percentages', () => {
    expect(percent(0.183)).toBe('18,3 %')
    expect(percent(null)).toBe('n/c')
  })

  it('formats calendar dates and months without a time zone shift', () => {
    expect(frenchDate('2026-01-01')).toBe('01/01/2026')
    expect(frenchDate('2026-11-14T23:30:00.000Z')).toBe('14/11/2026')
    expect(frenchDate(null)).toBe('n/c')
    expect(frenchMonth('2026-08')).toBe('août 2026')
    expect(frenchMonth('2026-02-28')).toBe('février 2026')
    expect(shortMonth('2026-12')).toBe('déc. 2026')
  })

  it('computes today in Europe/Paris and calendar day offsets', () => {
    expect(parisToday(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01')
    expect(parisToday(new Date('2026-07-01T21:59:00Z'))).toBe('2026-07-01')
    expect(addDays('2026-10-25', 7)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('describes how complete a month is', () => {
    expect(periodNote(period())).toContain('Mois partiel')
    expect(periodNote(period())).toContain('10 premiers jours')
    expect(periodNote(period({ status: 'complete', throughDay: null }))).toBe(
      "Mois complet (données jusqu'au 10/11/2026).",
    )
    expect(periodNote(period({ status: 'empty', dataUntil: null }))).toContain(
      'Aucune donnée',
    )
  })

  it('builds Markdown tables and escapes pipes', () => {
    expect(table(['a', 'b'], [['x|y', '1']])).toBe(
      '| a | b |\n| --- | --- |\n| x/y | 1 |',
    )
  })

  it.each([
    ['12,50', 1250, null],
    ['12.5', 1250, null],
    ['1 234,56 €', 123456, null],
    ['1\u202f234', 123400, null],
    ['+20', 2000, '+'],
    ['-0,05', 5, '-'],
    ['42 EUR', 4200, null],
  ])('parses %s into cents without floats', (text, cents, sign) => {
    expect(parseEuros(text)).toEqual({ cents, sign })
  })

  it.each(['', 'abc', '12,505', '1.234,56', '1,234.56', '--5', '12,'])(
    'rejects %j',
    (text) => {
      expect(parseEuros(text)).toBeNull()
    },
  )

  it('writes cents back as text a tool accepts', () => {
    expect(centsToText(4250)).toBe('42,50')
    expect(centsToText(5)).toBe('0,05')
    expect(centsToText(-123400)).toBe('-1234,00')
    expect(parseEuros(centsToText(98765))?.cents).toBe(98765)
  })

  it('moves calendar months across years', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-11', -13)).toBe('2025-10')
  })
})
