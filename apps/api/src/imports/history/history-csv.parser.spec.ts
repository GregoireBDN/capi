import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readCsv } from './csv'
import {
  decodeUtf8,
  HistoryCsvFormatError,
  parseEuroAmountToCents,
  parseHistoryBalancesCsv,
  parseHistoryDate,
  parseHistoryTransactionsCsv,
  parseMonthEnd,
  parseOneOffMark,
  toSheetSlug,
} from './history-csv.parser'

/** Synthetic data only: fake labels and amounts in the real formats. */

const FIXTURES = join(__dirname, 'fixtures')
const fixture = (name: string) => decodeUtf8(readFileSync(join(FIXTURES, name)))

const HEADER =
  'Date,Mois,Compte,Libellé,Montant (€),Catégorie,Groupe,Relevé,Ponctuel'

describe('readCsv', () => {
  it('handles quotes, escaped quotes, separators and newlines in fields', () => {
    const { records, unterminatedLines } = readCsv(
      'a,"b,c","say ""hi""","multi\r\nline"\r\nd,e,f,g\n',
    )
    expect(unterminatedLines).toEqual([])
    expect(records).toEqual([
      { lineNumber: 1, fields: ['a', 'b,c', 'say "hi"', 'multi\nline'] },
      { lineNumber: 3, fields: ['d', 'e', 'f', 'g'] },
    ])
  })

  it('strips a BOM and reads a last line without newline', () => {
    expect(readCsv('﻿a,b\nc,d').records).toEqual([
      { lineNumber: 1, fields: ['a', 'b'] },
      { lineNumber: 2, fields: ['c', 'd'] },
    ])
  })

  it('reports an unterminated quote and resumes on the next line', () => {
    const { records, unterminatedLines } = readCsv('a,b\n"oops,c\nd,e\n')
    expect(unterminatedLines).toEqual([2])
    expect(records.map((r) => r.lineNumber)).toEqual([1, 3])
  })
})

describe('cell parsers', () => {
  it.each([
    ['-1,00 €', -100],
    ['120,00 €', 12_000],
    ['1 234,56 €', 123_456],
    ['1 234,56 €', 123_456],
    ['-1 234,56 €', -123_456],
    ['−3,50 €', -350],
    ['0,00 €', 0],
    ['12', 1200],
    ['€ 4,2', 420],
  ])('parses the amount %j', (input, cents) => {
    expect(parseEuroAmountToCents(input)).toBe(cents)
  })

  it.each(['', 'abc €', '1.234,56 €', '12,345 €', '1 23,00 €', '--1,00 €'])(
    'rejects the amount %j without echoing it',
    (input) => {
      expect(() => parseEuroAmountToCents(input)).toThrow(/^Invalid amount$/)
    },
  )

  it('parses French and ISO dates and rejects impossible ones', () => {
    expect(parseHistoryDate('30/06/2023')).toBe('2023-06-30')
    expect(parseHistoryDate('2023-06-30')).toBe('2023-06-30')
    expect(() => parseHistoryDate('31/02/2023')).toThrow('Invalid date')
    expect(() => parseHistoryDate('2023-02-31')).toThrow('Invalid date')
    expect(() => parseHistoryDate('2023-06')).toThrow('Invalid date')
  })

  it('turns a month into its last day', () => {
    expect(parseMonthEnd('07/2023')).toBe('2023-07-31')
    expect(parseMonthEnd('2024-02')).toBe('2024-02-29')
    expect(parseMonthEnd('02/2023')).toBe('2023-02-28')
    expect(parseMonthEnd('15/11/2023')).toBe('2023-11-30')
    expect(() => parseMonthEnd('13/2023')).toThrow()
  })

  it.each([
    ['', false],
    ['non', false],
    ['FALSE', false],
    ['0', false],
    ['x', true],
    ['X', true],
    ['oui', true],
    ['TRUE', true],
    ['1', true],
  ])('reads the Ponctuel mark %j as %s', (input, expected) => {
    expect(parseOneOffMark(input)).toBe(expected)
  })

  it('normalizes category cells to snake_case slugs', () => {
    expect(toSheetSlug('restaurants_cafes')).toBe('restaurants_cafes')
    expect(toSheetSlug(' Restaurants Cafés ')).toBe('restaurants_cafes')
    expect(toSheetSlug('Santé')).toBe('sante')
  })
})

describe('parseHistoryTransactionsCsv', () => {
  it('parses the synthetic export', () => {
    const { rows, issues } = parseHistoryTransactionsCsv(
      fixture('history-transactions.csv'),
    )

    expect(rows).toHaveLength(17)
    expect(issues).toEqual([
      { lineNumber: 17, message: 'Invalid or missing date' },
      { lineNumber: 18, message: 'Invalid or missing amount' },
    ])
    expect(rows[0]).toEqual({
      lineNumber: 2,
      bookingDate: '2023-07-01',
      amountCents: 185_000,
      rawLabel: 'VIR SEPA SALAIRE SOCIETE FICTIVE',
      accountCode: 'CC',
      categorySlug: 'salaire',
      group: 'income',
      unknownGroup: null,
      isOneOff: false,
    })
    const quoted = rows.find((r) => r.lineNumber === 9)!
    expect(quoted.rawLabel).toBe(
      'PAIEMENT PSC 2007 TESTVILLE - LIBRAIRIE "LE LIVRE", RAYON B',
    )
    expect(quoted.isOneOff).toBe(true)
    const big = rows.find((r) => r.lineNumber === 16)!
    expect(big.amountCents).toBe(-123_456)
    expect(big.isOneOff).toBe(true)
    expect(rows.find((r) => r.lineNumber === 15)!.categorySlug).toBeNull()
    expect(rows.find((r) => r.lineNumber === 12)!.group).toBe('transfer')
    expect(rows.find((r) => r.lineNumber === 13)!.accountCode).toBe('LA')
  })

  it('matches columns by name, in any order and case', () => {
    const { rows, issues } = parseHistoryTransactionsCsv(
      'MONTANT,libelle,compte,date\n"-3,00 €",CAFE EXEMPLE,cc,01/02/2024\n',
    )
    expect(issues).toEqual([])
    expect(rows[0]).toMatchObject({
      bookingDate: '2024-02-01',
      amountCents: -300,
      rawLabel: 'CAFE EXEMPLE',
      accountCode: 'CC',
      categorySlug: null,
      group: null,
      isOneOff: false,
    })
  })

  it('keeps unknown Groupe values aside', () => {
    const { rows } = parseHistoryTransactionsCsv(
      `${HEADER}\n01/02/2024,2024-02,CC,CAFE,"-3,00 €",courses,Bizarre,,\n`,
    )
    expect(rows[0].group).toBeNull()
    expect(rows[0].unknownGroup).toBe('Bizarre')
  })

  it('reports bad rows with their line and never their content', () => {
    const { rows, issues } = parseHistoryTransactionsCsv(
      [
        HEADER,
        ',2024-02,CC,SECRET LABEL,"-3,00 €",courses,Dépense,,',
        '01/02/2024,2024-02,,,"-3,00 €",courses,Dépense,,',
        '01/02/2024,2024-02,CC,SHIFTED,-3,00 €,courses,Dépense,,',
        '01/02/2024,2024-02,CC,GOOD,"-3,00 €",courses,Dépense,,',
        '01/02/2024,2024-02,CC,"UNCLOSED,-3,courses,Dépense,,',
      ].join('\n'),
    )
    expect(rows.map((r) => r.lineNumber)).toEqual([5])
    expect(issues).toEqual([
      { lineNumber: 2, message: 'Invalid or missing date' },
      { lineNumber: 3, message: 'Missing account; Missing label' },
      { lineNumber: 4, message: 'Expected 9 fields, found 10' },
      { lineNumber: 6, message: 'Unterminated quoted field' },
    ])
    expect(JSON.stringify(issues)).not.toMatch(/SECRET|3,00/)
  })

  it('throws on a file that is not the transactions export', () => {
    expect(() => parseHistoryTransactionsCsv('')).toThrow(HistoryCsvFormatError)
    expect(() => parseHistoryTransactionsCsv('Date,Libellé\n')).toThrow(
      'missing column(s) Compte, Montant (€)',
    )
    expect(() =>
      parseHistoryTransactionsCsv('Date,Date,Compte,Libellé,Montant\n'),
    ).toThrow('duplicated column Date')
  })
})

describe('parseHistoryBalancesCsv', () => {
  it('parses the synthetic export', () => {
    const { columns, rows, issues } = parseHistoryBalancesCsv(
      fixture('history-balances.csv'),
    )
    expect(columns).toEqual(['Compte courant', 'Livret A', 'Livret Jeune'])
    expect(issues).toEqual([
      { lineNumber: 4, message: 'Invalid amount in column Livret A' },
      { lineNumber: 5, message: 'Invalid or missing month' },
    ])
    expect(rows).toEqual([
      {
        lineNumber: 2,
        date: '2023-07-31',
        values: [
          { column: 'Compte courant', valueCents: 2800 },
          { column: 'Livret A', valueCents: 10_000 },
        ],
      },
      {
        lineNumber: 3,
        date: '2023-08-31',
        values: [
          { column: 'Compte courant', valueCents: 101_240 },
          { column: 'Livret A', valueCents: 10_000 },
          { column: 'Livret Jeune', valueCents: 0 },
        ],
      },
      {
        lineNumber: 4,
        date: '2023-09-30',
        values: [
          { column: 'Compte courant', valueCents: -1200 },
          { column: 'Livret Jeune', valueCents: 0 },
        ],
      },
    ])
  })

  it('throws without a month or balance column', () => {
    expect(() => parseHistoryBalancesCsv('Compte courant (€)\n')).toThrow(
      'missing column Fin de mois',
    )
    expect(() =>
      parseHistoryBalancesCsv('Fin de mois,Total CIC (€)\n'),
    ).toThrow('no balance column')
  })
})

describe('decodeUtf8', () => {
  it('rejects invalid UTF-8 (e.g. a Windows-1252 file)', () => {
    expect(() =>
      decodeUtf8(Buffer.from([0x4c, 0x69, 0x62, 0x65, 0x6c, 0xe9])),
    ).toThrow('not valid UTF-8')
  })
})
