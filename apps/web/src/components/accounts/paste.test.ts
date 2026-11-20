import { describe, expect, it } from 'vitest'
import { centsToInput, parseAmountToCents } from './amount'
import { parseFrenchDate, todayInParis } from './dates'
import { formatAge } from './labels'
import { parseSnapshotHistory } from './paste'

describe('parseAmountToCents', () => {
  it.each([
    ['12 345,67', 1_234_567],
    ['12 345,67 €', 1_234_567],
    ['12 345,6', 1_234_560],
    ['1.234,56', 123_456],
    ['1.234.567', 123_456_700],
    ['1.234', 123_400],
    ['1234.56', 123_456],
    ['12.5', 1_250],
    ['300', 30_000],
    ['+300', 30_000],
    ['-1 234,56', -123_456],
    ['−50', -5_000],
    ['0,07', 7],
    ['-0', 0],
  ])('reads %s', (text, cents) => {
    expect(parseAmountToCents(text)).toBe(cents)
  })

  it.each(['', 'abc', '1,234.56', '12,345', '1 2,3,4', '--5', '1e3', '12.'])(
    'refuses %j',
    (text) => {
      expect(parseAmountToCents(text)).toBeNull()
    },
  )

  it('never loses a cent to floating point', () => {
    expect(parseAmountToCents('0,29')).toBe(29)
    expect(parseAmountToCents('1 000 000,57')).toBe(100_000_057)
  })

  it('formats cents back for editing', () => {
    expect(centsToInput(40_000)).toBe('400')
    expect(centsToInput(-12_345)).toBe('-123,45')
    expect(centsToInput(7)).toBe('0,07')
  })
})

describe('dates', () => {
  it('reads French dates that exist', () => {
    expect(parseFrenchDate('31/03/2026')).toBe('2026-03-31')
    expect(parseFrenchDate('1/7/2024')).toBe('2024-07-01')
    expect(parseFrenchDate('29/02/2024')).toBe('2024-02-29')
    expect(parseFrenchDate('29/02/2026')).toBeNull()
    expect(parseFrenchDate('2026-03-31')).toBeNull()
    expect(parseFrenchDate('31/13/2026')).toBeNull()
  })

  it('reads today in Europe/Paris', () => {
    expect(todayInParis(new Date('2026-11-05T23:30:00Z'))).toBe('2026-11-06')
  })

  it('says how old a value is', () => {
    expect(formatAge(0)).toBe('aujourd’hui')
    expect(formatAge(1)).toBe('hier')
    expect(formatAge(92)).toBe('il y a 92 jours')
  })
})

describe('parseSnapshotHistory', () => {
  const TODAY = '2026-11-06'

  it('reads date;valeur;versements lines, oldest first', () => {
    const result = parseSnapshotHistory(
      [
        'Date;Valeur;Versements',
        '30/06/2026;12 890,10;10 500',
        '',
        '31/03/2026\t12 345,67\t10 000',
        '30/09/2026;13 001',
      ].join('\n'),
      TODAY,
    )
    expect(result.skippedHeader).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.rows).toEqual([
      {
        line: 4,
        date: '2026-03-31',
        valueCents: 1_234_567,
        contributionsCents: 1_000_000,
      },
      {
        line: 2,
        date: '2026-06-30',
        valueCents: 1_289_010,
        contributionsCents: 1_050_000,
      },
      {
        line: 5,
        date: '2026-09-30',
        valueCents: 1_300_100,
        contributionsCents: null,
      },
    ])
  })

  it('reports each wrong line with its reason', () => {
    const result = parseSnapshotHistory(
      [
        '31/12/2025;1 000;900',
        '31/02/2026;1 000',
        '31/12/2026;1 000',
        '30/06/2026;mille',
        '30/07/2026;-5',
        '30/08/2026;10;dix',
        '31/12/2025;1 100',
        'juste du texte 2026',
        '30/09/2026;1;2;3',
        '30/10/2026;1 000;-200',
      ].join('\r\n'),
      TODAY,
    )
    expect(result.skippedHeader).toBe(false)
    expect(result.rows.map((row) => row.line)).toEqual([1, 10])
    expect(result.rows[1].contributionsCents).toBe(-20_000)
    expect(result.errors.map((e) => [e.line, e.message])).toEqual([
      [2, 'Date invalide « 31/02/2026 » (jj/mm/aaaa)'],
      [3, 'Date dans le futur'],
      [4, 'Valeur invalide « mille »'],
      [5, 'La valeur ne peut pas être négative'],
      [6, 'Montant investi invalide « dix »'],
      [7, 'Date déjà présente ligne 1'],
      [8, 'Attendu : date;valeur;investi (investi facultatif)'],
      [9, 'Attendu : date;valeur;investi (investi facultatif)'],
    ])
  })

  it('accepts today', () => {
    const result = parseSnapshotHistory('06/11/2026;1', TODAY)
    expect(result.rows).toHaveLength(1)
  })
})
