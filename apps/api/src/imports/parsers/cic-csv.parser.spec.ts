import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CicCsvFormatError,
  parseCicCsv,
  parseFrenchAmountToCents,
  parseFrenchDate,
} from './cic-csv.parser'
import { WINDOWS_1252_HIGH_CODE_POINTS } from './windows-1252'

// All fixtures and inline data below are synthetic: invented labels, amounts,
// balances and references.

const NBSP = String.fromCharCode(0x00a0)
const NARROW_NBSP = String.fromCharCode(0x202f)
const HEADER = 'Date;Date de valeur;Débit;Crédit;Libellé;Solde'

/** Encodes a string as Windows-1252, as CIC does. */
function cp1252(text: string): Buffer {
  const reverse = new Map<number, number>(
    WINDOWS_1252_HIGH_CODE_POINTS.map((cp, i) => [cp, 0x80 + i]),
  )
  return Buffer.from(
    [...text].map((ch) => {
      const cp = ch.codePointAt(0)!
      const byte = reverse.get(cp) ?? (cp <= 0xff ? cp : undefined)
      if (byte === undefined) throw new Error(`Not encodable in cp1252: ${ch}`)
      return byte
    }),
  )
}

function csv(lines: string[], eol = '\r\n'): Buffer {
  return cp1252(lines.join(eol) + eol)
}

function fixture(name: string): Buffer {
  return readFileSync(join(__dirname, 'fixtures', name))
}

describe('parseFrenchAmountToCents', () => {
  it.each([
    ['-1 234,56', -123456],
    ['1 234,56', 123456],
    [`-1${NBSP}234,56`, -123456],
    [`1${NARROW_NBSP}234${NARROW_NBSP}567,89`, 123456789],
    ['1 000 000,01', 100000001],
    ['12', 1200],
    ['12,5', 1250],
    ['12,05', 1205],
    ['-12,00', -1200],
    ['+3,00', 300],
    ['0,01', 1],
    ['  -12,00  ', -1200],
    [`${String.fromCharCode(0x2212)}5,00`, -500],
    ['1234,56', 123456],
    ['0,10', 10],
    ['19,99', 1999],
    ['-0,29', -29],
  ])('parses %j as %d cents', (input, expected) => {
    expect(parseFrenchAmountToCents(input)).toBe(expected)
  })

  it('returns 0, not -0, for a negative zero', () => {
    expect(Object.is(parseFrenchAmountToCents('-0,00'), 0)).toBe(true)
  })

  it.each([
    '',
    '   ',
    'abc',
    '-',
    '12.50',
    '1.234,56',
    '12,345',
    '12,',
    ',50',
    '1 23,00',
    '12 345 6,00',
    '--1,00',
    '1,2,3',
    '1e3',
    'Infinity',
    'NaN',
    '12 €',
    '0x10',
    '12-',
    '99999999999999999999,00',
  ])('rejects %j', (input) => {
    expect(() => parseFrenchAmountToCents(input)).toThrow()
  })

  it('does not echo the input in its error message', () => {
    expect(() => parseFrenchAmountToCents('4 321,0x')).toThrow(
      /^Invalid amount$/,
    )
  })
})

describe('parseFrenchDate', () => {
  it.each([
    ['05/10/2026', '2026-10-05'],
    ['01/01/2026', '2026-01-01'],
    ['31/12/2026', '2026-12-31'],
    ['29/02/2028', '2028-02-29'],
    ['29/02/2000', '2000-02-29'],
    ['5/1/2026', '2026-01-05'],
    [' 06/10/2026 ', '2026-10-06'],
  ])('parses %j as %j', (input, expected) => {
    expect(parseFrenchDate(input)).toBe(expected)
  })

  it.each([
    '31/02/2026',
    '29/02/2026',
    '29/02/1900',
    '31/04/2026',
    '00/10/2026',
    '10/00/2026',
    '10/13/2026',
    '32/01/2026',
    '2026-10-05',
    '05/10/26',
    '05-10-2026',
    '',
    'aa/bb/cccc',
    '05/10/2026 12:00',
  ])('rejects %j', (input) => {
    expect(() => parseFrenchDate(input)).toThrow()
  })
})

describe('parseCicCsv — well-formed fixture', () => {
  const buffer = fixture('cic-valid.csv')
  const { rows, issues } = parseCicCsv(buffer)

  it('is a genuine Windows-1252 file with CRLF line endings', () => {
    // "Débit" is 44 E9 62 69 74 in cp1252 (it would be 44 C3 A9 ... in UTF-8).
    expect(buffer.includes(Buffer.from([0x44, 0xe9, 0x62, 0x69, 0x74]))).toBe(
      true,
    )
    expect(buffer.includes(0xc3)).toBe(false)
    expect(buffer.includes(Buffer.from('\r\n'))).toBe(true)
  })

  it('parses every row without issues, in file order', () => {
    expect(issues).toEqual([])
    expect(rows).toHaveLength(12)
    expect(rows.map((r) => r.lineNumber)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ])
  })

  it('returns typed rows', () => {
    expect(rows[0]).toEqual({
      lineNumber: 2,
      bookingDate: '2026-10-01',
      valueDate: '2026-10-01',
      amountCents: 245000,
      balanceAfterCents: 264199,
      rawLabel: 'VIR SEPA SALAIRE SOCIETE FICTIVE OCT',
    })
    expect(rows[4]).toEqual({
      lineNumber: 6,
      bookingDate: '2026-10-05',
      valueDate: '2026-10-05',
      amountCents: -1200,
      balanceAfterCents: 155174,
      rawLabel: 'PRLV SEPA ACME ASSURANCE 1234567890',
    })
  })

  it('signs debits negative and credits positive', () => {
    expect(rows.map((r) => r.amountCents)).toEqual([
      245000, -105000, -435, -2390, -1200, 36900, -200, -6000, 1550, -150000,
      -40000, 10000,
    ])
  })

  it('handles regular and non-breaking spaces as thousands separators', () => {
    expect(rows[0].amountCents).toBe(245000) // 2<NBSP>450,00
    expect(rows[1].amountCents).toBe(-105000) // -1 050,00
    expect(rows[9].amountCents).toBe(-150000) // -1<NBSP>500,00
    expect(rows[0].balanceAfterCents).toBe(264199) // 2<NBSP>641,99
  })

  it('keeps a value date that differs from the booking date', () => {
    expect(rows[2]).toMatchObject({
      bookingDate: '2026-10-03',
      valueDate: '2026-10-02',
    })
    expect(rows[6]).toMatchObject({
      bookingDate: '2026-10-06',
      valueDate: '2026-10-01',
    })
  })

  it('parses running balances, including a negative one', () => {
    expect(rows.map((r) => r.balanceAfterCents)).toEqual([
      264199, 159199, 158764, 156374, 155174, 192074, 191874, 185874, 187424,
      37424, -2576, 7424,
    ])
  })

  it('has continuous running balances (previous balance + amount = balance)', () => {
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].balanceAfterCents! + rows[i].amountCents).toBe(
        rows[i].balanceAfterCents,
      )
    }
  })

  it('decodes accented and typographic characters in labels', () => {
    const labels = rows.map((r) => r.rawLabel)
    expect(labels).toContain('CB L’ÉPICERIE DU MOULIN 02/10')
    expect(labels).toContain('REMB. PRÊT ENTRE AMIS / LÉA ŒUVRE')
    expect(labels).toContain('VIR PERMANENT LIVRET A ÉPARGNE')
    expect(labels).toContain('CB HÔTEL IMAGINAIRE 08/10')
  })

  it('trims labels and collapses internal whitespace, keeping * / -', () => {
    expect(rows[3].rawLabel).toBe(
      'PAIEMENT CB CAFÉ DE LA GARE 01/10 *VILLE-EXEMPLE',
    )
  })

  it('supports a quoted label containing ; and escaped quotes', () => {
    expect(rows[7]).toMatchObject({
      lineNumber: 9,
      amountCents: -6000,
      balanceAfterCents: 185874,
      rawLabel: 'RETRAIT DAB 06/10 ; AGENCE "CENTRE"',
    })
  })
})

describe('parseCicCsv — malformed rows', () => {
  const { rows, issues } = parseCicCsv(fixture('cic-malformed.csv'))

  it('keeps the valid rows', () => {
    expect(rows.map((r) => [r.lineNumber, r.rawLabel])).toEqual([
      [2, 'CB VALIDE UN'],
      [14, 'CB VALIDE DEUX'],
    ])
  })

  it('reports every bad row with its line number', () => {
    expect(issues).toEqual([
      { lineNumber: 3, message: 'Invalid or missing date; Invalid value date' },
      { lineNumber: 4, message: 'Both debit and credit are filled' },
      { lineNumber: 5, message: 'Neither debit nor credit is filled' },
      { lineNumber: 6, message: 'Invalid debit amount' },
      { lineNumber: 7, message: 'Expected 6 fields, found 7' },
      { lineNumber: 8, message: 'Expected 6 fields, found 3' },
      { lineNumber: 9, message: 'Unterminated quoted field' },
      { lineNumber: 10, message: 'Invalid balance' },
      { lineNumber: 11, message: 'Negative credit amount' },
      { lineNumber: 12, message: 'Invalid value date' },
      { lineNumber: 13, message: 'Missing label' },
    ])
  })

  it('never puts amounts or labels in issue messages', () => {
    for (const { message } of issues) {
      expect(message).not.toMatch(/\d+,\d/)
      expect(message).not.toMatch(/CB |abc|EXTRA/)
    }
  })
})

describe('parseCicCsv — layout tolerance', () => {
  const body = [
    '05/10/2026;05/10/2026;-12,00;;PRLV SEPA ACME ASSURANCE 1234567890;179,99',
    '05/10/2026;05/10/2026;;369,00;VIR CAF EXAMPLE 12345678X01;548,99',
    '06/10/2026;01/10/2026;-2,00;;F COTIS CARTE EXAMPLE;546,99',
  ]
  const expected = parseCicCsv(csv([HEADER, ...body])).rows

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
    ['CR', '\r'],
  ])('accepts %s line endings', (_name, eol) => {
    const result = parseCicCsv(csv([HEADER, ...body], eol))
    expect(result).toEqual({ rows: expected, issues: [] })
    expect(result.rows).toHaveLength(3)
  })

  it('accepts a file without a final line break', () => {
    expect(parseCicCsv(cp1252([HEADER, ...body].join('\n'))).rows).toEqual(
      expected,
    )
  })

  it('ignores trailing spaces and blank lines, keeping physical line numbers', () => {
    const input = csv([
      `${HEADER}  `,
      `${body[0]}  `,
      '',
      '   ',
      ';;;;;',
      `${body[1]} `,
      `${body[2]}\t`,
      '',
      '',
    ])
    const { rows, issues } = parseCicCsv(input)
    expect(issues).toEqual([])
    expect(rows.map((r) => r.lineNumber)).toEqual([2, 6, 7])
    expect(rows.map(({ lineNumber: _, ...r }) => r)).toEqual(
      expected.map(({ lineNumber: _, ...r }) => r),
    )
  })

  it('accepts a header-only file', () => {
    expect(parseCicCsv(csv([HEADER]))).toEqual({ rows: [], issues: [] })
  })

  it('keeps file order when rows are not chronological', () => {
    const { rows } = parseCicCsv(
      csv([
        HEADER,
        '20/10/2026;20/10/2026;-1,00;;CB B;99,00',
        '02/10/2026;02/10/2026;-1,00;;CB A;98,00',
      ]),
    )
    expect(rows.map((r) => r.bookingDate)).toEqual(['2026-10-20', '2026-10-02'])
  })

  it('treats a debit written without minus sign as money out', () => {
    const { rows } = parseCicCsv(
      csv([HEADER, '05/10/2026;05/10/2026;12,00;;CB EXEMPLE;100,00']),
    )
    expect(rows[0].amountCents).toBe(-1200)
  })

  it('accepts quoted fields anywhere and leaves unquoted quotes alone', () => {
    const { rows, issues } = parseCicCsv(
      csv([
        HEADER,
        '"05/10/2026";"05/10/2026";"-1 234,56";"";"CB ""LE"" BISTROT; SALLE 2";"1 000,00"',
        '05/10/2026;05/10/2026;-1,00;;CB CHEZ "TOTO";999,00',
      ]),
    )
    expect(issues).toEqual([])
    expect(rows[0]).toMatchObject({
      amountCents: -123456,
      balanceAfterCents: 100000,
      rawLabel: 'CB "LE" BISTROT; SALLE 2',
    })
    expect(rows[1].rawLabel).toBe('CB CHEZ "TOTO"')
  })
})

describe('parseCicCsv — header matching', () => {
  const row = '05/10/2026;04/10/2026;-12,00;;CB EXEMPLE;100,00'

  it.each([
    'DATE;DATE DE VALEUR;DEBIT;CREDIT;LIBELLE;SOLDE',
    'date;date de valeur;débit;crédit;libellé;solde',
    ' Date ; Date  de   valeur;Débit ;Crédit;Libellé;Solde   ',
  ])('matches header %j', (header) => {
    const { rows, issues } = parseCicCsv(csv([header, row]))
    expect(issues).toEqual([])
    expect(rows[0]).toMatchObject({
      bookingDate: '2026-10-05',
      valueDate: '2026-10-04',
      amountCents: -1200,
      balanceAfterCents: 10000,
      rawLabel: 'CB EXEMPLE',
    })
  })

  it('matches columns by name, not by position', () => {
    const { rows } = parseCicCsv(
      csv([
        'Libellé;Solde;Crédit;Débit;Date de valeur;Date',
        'CB EXEMPLE;100,00;;-12,00;04/10/2026;05/10/2026',
      ]),
    )
    expect(rows[0]).toMatchObject({
      bookingDate: '2026-10-05',
      valueDate: '2026-10-04',
      amountCents: -1200,
      balanceAfterCents: 10000,
      rawLabel: 'CB EXEMPLE',
    })
  })

  it('ignores unknown extra columns', () => {
    const { rows, issues } = parseCicCsv(
      csv([`${HEADER};Catégorie`, `${row};Divers`]),
    )
    expect(issues).toEqual([])
    expect(rows[0].rawLabel).toBe('CB EXEMPLE')
  })

  it('returns null value date and balance when those columns are absent', () => {
    const { rows } = parseCicCsv(
      csv(['Date;Débit;Crédit;Libellé', '05/10/2026;-12,00;;CB EXEMPLE']),
    )
    expect(rows[0]).toMatchObject({ valueDate: null, balanceAfterCents: null })
  })

  it('returns null for empty value date or balance cells', () => {
    const { rows, issues } = parseCicCsv(
      csv([HEADER, '05/10/2026;;-12,00;;CB EXEMPLE;']),
    )
    expect(issues).toEqual([])
    expect(rows[0]).toMatchObject({ valueDate: null, balanceAfterCents: null })
  })
})

describe('parseCicCsv — files that are not CIC exports', () => {
  it.each([
    ['an empty file', Buffer.alloc(0)],
    ['a whitespace-only file', cp1252('\r\n  \r\n')],
    ['a comma-separated file', cp1252('Date,Débit,Crédit,Libellé\n')],
    ['an unrelated CSV', cp1252('name;email\nAlice;alice@example.test\n')],
    ['binary data', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a])],
  ])('rejects %s', (_name, input) => {
    expect(() => parseCicCsv(input)).toThrow(CicCsvFormatError)
  })

  it('names the missing columns', () => {
    expect(() =>
      parseCicCsv(csv(['Date;Date de valeur;Montant;Libellé;Solde'])),
    ).toThrow('Not a CIC CSV export: missing column(s) Débit, Crédit')
  })

  it('rejects duplicated columns', () => {
    expect(() => parseCicCsv(csv(['Date;Débit;Crédit;Libellé;Debit']))).toThrow(
      'Not a CIC CSV export: duplicated column Débit',
    )
  })

  it('rejects a UTF-8 file without BOM rather than misdecoding it', () => {
    const input = Buffer.from(`${HEADER}\n05/10/2026;;-1,00;;CB É;1,00\n`)
    expect(() => parseCicCsv(input)).toThrow(CicCsvFormatError)
  })
})

describe('parseCicCsv — UTF-8 with BOM', () => {
  const bom = Buffer.from([0xef, 0xbb, 0xbf])

  it('accepts a UTF-8 file starting with a BOM', () => {
    const text = [
      HEADER,
      `05/10/2026;05/10/2026;-1${NARROW_NBSP}234,56;;CB CAFÉ L’ÉTOILE €;8${NBSP}765,44`,
      '',
    ].join('\r\n')
    const { rows, issues } = parseCicCsv(
      Buffer.concat([bom, Buffer.from(text, 'utf-8')]),
    )
    expect(issues).toEqual([])
    expect(rows).toEqual([
      {
        lineNumber: 2,
        bookingDate: '2026-10-05',
        valueDate: '2026-10-05',
        amountCents: -123456,
        balanceAfterCents: 876544,
        rawLabel: 'CB CAFÉ L’ÉTOILE €',
      },
    ])
  })

  it('rejects a file with a UTF-8 BOM followed by invalid UTF-8', () => {
    const input = Buffer.concat([bom, cp1252(`${HEADER}\n`)])
    expect(() => parseCicCsv(input)).toThrow(CicCsvFormatError)
  })
})
