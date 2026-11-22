import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectFormat } from './detect-format'
import { parseCashCsv, parseInvestmentCsv } from './parse-with-profile'
import type { CsvProfile } from './profile.types'
import { CsvFormatError } from './read-table'
import { standardProfileFor } from './standard-format'

/** Synthetic fixtures only: fake labels, amounts and ISINs (`ZZ…`). */
const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name))
const utf8 = (text: string) => Buffer.from(text, 'utf8')

function standard(bytes: Buffer): CsvProfile {
  const detected = detectFormat(bytes, [])
  if (detected?.source !== 'standard_csv') throw new Error('not standard')
  return detected.profile
}

/** The profile an owner would save for `fixtures/other-bank.csv`. */
const OTHER_BANK: CsvProfile = {
  target: 'cash',
  encoding: 'windows-1252',
  delimiter: ';',
  decimalSeparator: ',',
  dateFormat: 'dd/mm/yyyy',
  columns: {
    date: 'date operation',
    valueDate: 'date valeur',
    label: "libelle de l'operation",
    debit: 'debit',
    credit: 'credit',
  },
}

describe('standard cash format', () => {
  const bytes = fixture('standard-cash.csv')

  it('is recognised from its header, in any column order', () => {
    expect(standard(bytes).target).toBe('cash')
    expect(
      standardProfileFor(['libelle', 'montant', 'date', 'solde'])?.columns,
    ).toEqual({
      date: 'date',
      label: 'libelle',
      amount: 'montant',
      balance: 'solde',
    })
    expect(standardProfileFor(['date', 'amount'])).toBeNull()
    expect(
      standardProfileFor(['date', 'amount', 'label', 'libelle']),
    ).toBeNull()
  })

  it('reads every row, keeps identical rows and reports the unknown column', () => {
    const result = parseCashCsv(bytes, standard(bytes))
    expect(result.issues).toEqual([])
    expect(result.ignoredColumns).toEqual(['reference'])
    expect(result.rows).toEqual([
      {
        lineNumber: 2,
        bookingDate: '2026-10-01',
        valueDate: null,
        amountCents: -1250,
        balanceAfterCents: 98750,
        rawLabel: 'CARTE 01/10 BOULANGERIE FICTIVE',
      },
      expect.objectContaining({ lineNumber: 3, amountCents: -1250 }),
      expect.objectContaining({ lineNumber: 4, amountCents: 200000 }),
      expect.objectContaining({
        lineNumber: 5,
        bookingDate: '2026-10-05',
        amountCents: -4590,
        balanceAfterCents: 292910,
      }),
    ])
  })

  it('reads a comma-separated file with quoted labels and a BOM', () => {
    const bytes = utf8('﻿Date,Amount,Label\n2026-10-01,-3.20,"CAFE, FICTIF"\n')
    expect(parseCashCsv(bytes, standard(bytes)).rows).toEqual([
      expect.objectContaining({ amountCents: -320, rawLabel: 'CAFE, FICTIF' }),
    ])
  })

  it('reports each invalid line with its line number, never its content', () => {
    const bytes = utf8(
      [
        'date;amount;label',
        '2026-10-01;-1.00;OK FICTIF',
        '2026-02-30;-1.00;JOUR IMPOSSIBLE',
        '2026-10-02;douze;MONTANT ILLISIBLE',
        '2026-10-03;-1.00;',
        '2026-10-04;;SANS MONTANT',
        '2026-10-05;-1.00;TROP;DE;CHAMPS',
        '2026-10-06;-1.00;"GUILLEMET',
      ].join('\n'),
    )
    const result = parseCashCsv(bytes, standard(bytes))
    expect(result.rows.map((r) => r.lineNumber)).toEqual([2])
    expect(result.issues).toEqual([
      { lineNumber: 3, message: 'Invalid or missing date' },
      { lineNumber: 4, message: 'Invalid amount' },
      { lineNumber: 5, message: 'Missing label' },
      { lineNumber: 6, message: 'Missing amount' },
      { lineNumber: 7, message: 'Expected 3 fields, found 5' },
      { lineNumber: 8, message: 'Unterminated quoted field' },
    ])
    for (const issue of result.issues) {
      expect(issue.message).not.toMatch(/FICTIF|JOUR|douze|TROP/)
    }
  })

  it('refuses an empty file', () => {
    expect(() => detectFormat(Buffer.alloc(0), [])).not.toThrow()
    expect(() =>
      parseCashCsv(
        Buffer.alloc(0),
        standardProfileFor(['date', 'amount', 'label'])!,
      ),
    ).toThrow(CsvFormatError)
  })
})

describe('a saved cash profile', () => {
  const bytes = fixture('other-bank.csv')

  it('reads a Windows-1252 export with debit and credit columns', () => {
    const result = parseCashCsv(bytes, OTHER_BANK)
    expect(result.ignoredColumns).toEqual(['Catégorie banque'])
    expect(result.rows).toEqual([
      {
        lineNumber: 2,
        bookingDate: '2026-10-02',
        valueDate: '2026-10-02',
        amountCents: -123456,
        balanceAfterCents: null,
        rawLabel: 'CB SUPERMARCHE FICTIF',
      },
      expect.objectContaining({
        bookingDate: '2026-10-03',
        valueDate: '2026-10-04',
        amountCents: 200000,
      }),
      expect.objectContaining({ amountCents: -320 }),
    ])
    expect(result.issues).toEqual([
      { lineNumber: 5, message: 'Invalid or missing date' },
    ])
  })

  it('refuses a file lacking a mapped column, naming the column', () => {
    const other = utf8('Date;Libellé;Montant\n02/10/2026;X;1,00\n')
    expect(() => parseCashCsv(other, OTHER_BANK)).toThrow(
      /^Missing column\(s\) date operation, date valeur, libelle de l'operation, debit, credit$/,
    )
  })

  it('treats a 0 in the other column as empty, refuses both filled', () => {
    const file = utf8(
      [
        "Date opération;Date valeur;Libellé de l'opération;Débit;Crédit",
        '02/10/2026;;A;0,00;5,00',
        '02/10/2026;;B;5,00;5,00',
        '02/10/2026;;C;;',
        '02/10/2026;;D;;-5,00',
      ].join('\n'),
    )
    const result = parseCashCsv(file, { ...OTHER_BANK, encoding: 'utf-8' })
    expect(result.rows.map((r) => r.amountCents)).toEqual([500])
    expect(result.issues.map((i) => i.message)).toEqual([
      'Both debit and credit are filled',
      'Neither debit nor credit is filled',
      'Negative credit amount',
    ])
  })

  it('does not read investment movements', () => {
    expect(() => parseInvestmentCsv(bytes, OTHER_BANK)).toThrow(
      'This profile does not read investment movements',
    )
  })
})

describe('standard investment format', () => {
  const bytes = fixture('standard-investment.csv')

  it('is recognised by its kind column', () => {
    expect(standard(bytes).target).toBe('investment')
  })

  it('reads every kind with exact quantities and prices', () => {
    const result = parseInvestmentCsv(bytes, standard(bytes))
    expect(result.issues).toEqual([])
    expect(result.ignoredColumns).toEqual([])
    expect(result.rows).toEqual([
      {
        lineNumber: 2,
        date: '2026-09-01',
        kind: 'deposit',
        isin: null,
        asset: null,
        quantity: null,
        priceEur: null,
        feesCents: null,
        amountCents: 50000,
        label: 'Versement fictif',
      },
      {
        lineNumber: 3,
        date: '2026-09-02',
        kind: 'buy',
        isin: 'ZZ00MSCIWD03',
        asset: 'ETF Monde fictif',
        quantity: '3',
        priceEur: '120.5',
        feesCents: 199,
        amountCents: -36349,
        label: 'Achat fictif',
      },
      expect.objectContaining({
        kind: 'dividend',
        amountCents: 210,
        label: null,
      }),
      expect.objectContaining({
        kind: 'sell',
        isin: 'ZZ00EMMKT008',
        quantity: '1.5',
        priceEur: '30',
        amountCents: 4401,
      }),
      expect.objectContaining({ kind: 'fee', amountCents: -120 }),
    ])
  })

  it('reports unrecognised kinds and inconsistent lines', () => {
    const file = utf8(
      [
        'date;kind;isin;asset;quantity;amount',
        '2026-09-01;Achat;ZZ00MSCIWD03;;2;-200',
        '2026-09-02;swap;;;;10',
        '2026-09-03;buy;ZZ00MSCIWD04;;1;-10',
        '2026-09-04;buy;;;1;-10',
        '2026-09-05;sell;;Fonds fictif;;10',
        '2026-09-06;deposit;;;;-10',
        '2026-09-07;fee;;;;0',
        '2026-09-08;;;;;5',
      ].join('\n'),
    )
    const result = parseInvestmentCsv(file, standard(file))
    expect(result.rows).toEqual([
      expect.objectContaining({ lineNumber: 2, kind: 'buy', quantity: '2' }),
    ])
    expect(result.issues).toEqual([
      { lineNumber: 3, message: 'Unrecognised kind' },
      { lineNumber: 4, message: 'Invalid ISIN' },
      { lineNumber: 5, message: 'Missing ISIN or asset' },
      { lineNumber: 6, message: 'Missing quantity' },
      { lineNumber: 7, message: 'Amount sign does not match the kind' },
      { lineNumber: 8, message: 'Zero amount' },
      { lineNumber: 9, message: 'Missing kind' },
    ])
  })

  it('maps a source’s own kind values through the profile', () => {
    const file = utf8('date;kind;amount\n2026-09-01;COUPON;3,00\n')
    const profile = {
      ...standard(file),
      kindValues: { coupon: 'interest' as const },
    }
    expect(parseInvestmentCsv(file, profile).rows).toEqual([
      expect.objectContaining({ kind: 'interest', amountCents: 300 }),
    ])
  })

  it('is not read as bank rows', () => {
    expect(() => parseCashCsv(bytes, standard(bytes))).toThrow(
      'This profile does not read bank rows',
    )
  })
})
