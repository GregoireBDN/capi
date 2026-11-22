import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { headerKey } from '#/imports/crypto/parsers/common'
import { detectFormat, isBuiltInHeader } from './detect-format'
import { inspectCsv } from './inspect'
import type { StoredCsvProfile } from './profile.types'
import { decodeCsv, detectDelimiter } from './read-table'

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name))
const cicFixture = readFileSync(
  join(__dirname, '..', 'parsers', 'fixtures', 'cic-valid.csv'),
)

const otherBankProfile: StoredCsvProfile = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Banque fictive',
  target: 'cash',
  encoding: 'windows-1252',
  delimiter: ';',
  decimalSeparator: ',',
  dateFormat: 'dd/mm/yyyy',
  headers: [
    'Date opération',
    'Date valeur',
    "Libellé de l'opération",
    'Débit',
    'Crédit',
    'Catégorie banque',
  ].map(headerKey),
  columns: {
    date: 'date operation',
    label: "libelle de l'operation",
    debit: 'debit',
    credit: 'credit',
  },
}

describe('detectFormat', () => {
  it('recognises the CIC export', () => {
    expect(detectFormat(cicFixture, [])).toEqual({ source: 'cic_csv' })
  })

  it('recognises both standard formats', () => {
    expect(detectFormat(fixture('standard-cash.csv'), [])).toMatchObject({
      source: 'standard_csv',
      profile: { target: 'cash' },
    })
    expect(detectFormat(fixture('standard-investment.csv'), [])).toMatchObject({
      source: 'standard_csv',
      profile: { target: 'investment' },
    })
  })

  it('recognises a saved profile from the exact header, and nothing else', () => {
    const bytes = fixture('other-bank.csv')
    expect(detectFormat(bytes, [])).toBeNull()
    expect(detectFormat(bytes, [otherBankProfile])).toEqual({
      source: 'csv_profile',
      profile: otherBankProfile,
    })
    // One column more or less is another source.
    const shorter = Buffer.from(
      "Date opération;Date valeur;Libellé de l'opération;Débit;Crédit\n",
      'utf8',
    )
    expect(detectFormat(shorter, [otherBankProfile])).toBeNull()
    // A trailing separator does not count.
    const trailing = Buffer.from(
      "Date opération;Date valeur;Libellé de l'opération;Débit;Crédit;Catégorie banque;\n",
      'latin1',
    )
    expect(detectFormat(trailing, [otherBankProfile])?.source).toBe(
      'csv_profile',
    )
  })

  it('tells which headers need no profile', () => {
    expect(isBuiltInHeader(['Date', 'Montant', 'Libellé'])).toBe(true)
    expect(
      isBuiltInHeader(['Date', 'Date de valeur', 'Débit', 'Crédit', 'Libellé']),
    ).toBe(true)
    expect(isBuiltInHeader(otherBankProfile.headers)).toBe(false)
  })
})

describe('reading a table', () => {
  it('detects the delimiter outside quotes, `;` on a tie', () => {
    expect(detectDelimiter('a;b;c')).toBe(';')
    expect(detectDelimiter('a,b,c')).toBe(',')
    expect(detectDelimiter('a\tb\tc')).toBe('\t')
    expect(detectDelimiter('"a;b",c,d')).toBe(',')
    expect(detectDelimiter('single')).toBe(';')
  })

  it('decodes UTF-8 when valid, Windows-1252 otherwise', () => {
    expect(decodeCsv(Buffer.from('Débit', 'utf8'), null)).toEqual({
      text: 'Débit',
      encoding: 'utf-8',
    })
    expect(decodeCsv(Buffer.from('Débit', 'latin1'), null)).toEqual({
      text: 'Débit',
      encoding: 'windows-1252',
    })
    expect(() => decodeCsv(Buffer.from('Débit', 'latin1'), 'utf-8')).toThrow(
      'The file is not valid UTF-8',
    )
  })
})

describe('inspectCsv', () => {
  it('guesses the mapping of an unknown export', () => {
    const inspection = inspectCsv(fixture('other-bank.csv'))
    expect(inspection).toMatchObject({
      encoding: 'windows-1252',
      delimiter: ';',
      headers: [
        'Date opération',
        'Date valeur',
        "Libellé de l'opération",
        'Débit',
        'Crédit',
        'Catégorie banque',
      ],
      lineCount: 4,
      suggestion: {
        decimalSeparator: ',',
        // The layout reading the most dates (31/02 reads as none).
        dateFormat: 'dd/mm/yyyy',
        columns: {
          date: 'Date opération',
          valueDate: 'Date valeur',
          label: "Libellé de l'opération",
          debit: 'Débit',
          credit: 'Crédit',
        },
      },
    })
    expect(inspection.sample[0]).toEqual([
      '02/10/2026',
      '02/10/2026',
      'CB SUPERMARCHE FICTIF',
      '1 234,56',
      '',
      'Courses',
    ])
  })

  it('guesses a date layout and a decimal point', () => {
    const inspection = inspectCsv(
      Buffer.from(
        'Booking date,Description,Amount (EUR)\n10/31/2026,Fictif,-1.50\n11/02/2026,Fictif,2.00\n',
        'utf8',
      ),
    )
    expect(inspection.suggestion).toEqual({
      decimalSeparator: '.',
      dateFormat: 'mm/dd/yyyy',
      columns: {
        date: 'Booking date',
        amount: 'Amount (EUR)',
        label: 'Description',
      },
    })
  })
})
