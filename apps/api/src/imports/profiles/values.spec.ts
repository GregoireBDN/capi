import { describe, expect, it } from 'vitest'
import {
  parseAmountToCents,
  parseDateWithFormat,
  parseExactDecimal,
} from './values'

describe('parseAmountToCents', () => {
  it.each([
    ['-12.50', -1250],
    ['-12,50', -1250],
    ['12', 1200],
    ['+3.5', 350],
    ['−7.10', -710],
    ['-1 234,56', -123456],
    ['0.00', 0],
    ['-0', 0],
  ])('reads the standard amount %s', (text, cents) => {
    expect(parseAmountToCents(text, null)).toBe(cents)
  })

  it.each(['12.345', '1.234,56', '1,234.56', 'abc', '', '12.', '1 23,00'])(
    'refuses %s in the standard format',
    (text) => {
      expect(() => parseAmountToCents(text, null)).toThrow('Invalid amount')
    },
  )

  it.each([
    ['1 234,56', ',', 123456],
    ['1.234,56 €', ',', 123456],
    ["1'234,5", ',', 123450],
    ['-1,234.56', '.', -123456],
    ['EUR 12.5', '.', 1250],
    ['1234', ',', 123400],
  ] as const)('reads %s with %s as decimal mark', (text, separator, cents) => {
    expect(parseAmountToCents(text, separator)).toBe(cents)
  })

  it.each([
    ['12.5', ','],
    ['12,5', '.'],
    ['1,23,4', ','],
    ['12,345', ','],
    ['1.23.4,00', ','],
  ] as const)('refuses %s with %s as decimal mark', (text, separator) => {
    expect(() => parseAmountToCents(text, separator)).toThrow()
  })

  it('never echoes the cell', () => {
    expect(() => parseAmountToCents('secret 12', null)).toThrow(
      /^Invalid amount$/,
    )
  })
})

describe('parseExactDecimal', () => {
  it.each([
    ['0,50', null, '0.5'],
    ['1.500', null, '1.5'],
    ['0.000123450', '.', '0.00012345'],
    ['12,25', ',', '12.25'],
  ] as const)('reads %s exactly', (text, separator, expected) => {
    expect(parseExactDecimal(text, separator)).toBe(expected)
  })

  it.each([
    ['1.234,5', ','],
    ['1,5', '.'],
    ['-1', null],
    ['1e3', null],
  ] as const)('refuses %s', (text, separator) => {
    expect(() => parseExactDecimal(text, separator)).toThrow()
  })
})

describe('parseDateWithFormat', () => {
  it.each([
    ['2026-03-01', 'yyyy-mm-dd', '2026-03-01'],
    ['2026-03-01 23:30:00', 'yyyy-mm-dd', '2026-03-01'],
    ['2026-03-01T23:30:00Z', 'yyyy-mm-dd', '2026-03-01'],
    ['1/3/2026', 'dd/mm/yyyy', '2026-03-01'],
    ['01-03-2026', 'dd-mm-yyyy', '2026-03-01'],
    ['01.03.2026', 'dd.mm.yyyy', '2026-03-01'],
    ['01/03/26', 'dd/mm/yy', '2026-03-01'],
    ['03/01/2026', 'mm/dd/yyyy', '2026-03-01'],
    ['29/02/2028', 'dd/mm/yyyy', '2028-02-29'],
  ] as const)('reads %s as %s', (text, format, expected) => {
    expect(parseDateWithFormat(text, format)).toBe(expected)
  })

  it('reads both standard layouts without a format', () => {
    expect(parseDateWithFormat('2026-10-05', null)).toBe('2026-10-05')
    expect(parseDateWithFormat('05/10/2026', null)).toBe('2026-10-05')
  })

  it.each([
    ['31/02/2026', 'dd/mm/yyyy'],
    ['29/02/2026', 'dd/mm/yyyy'],
    ['2026-13-01', 'yyyy-mm-dd'],
    ['01/03/2026', 'yyyy-mm-dd'],
    ['2026-03-01', 'dd/mm/yyyy'],
  ] as const)('refuses %s as %s', (text, format) => {
    expect(() => parseDateWithFormat(text, format)).toThrow('Invalid date')
  })
})
