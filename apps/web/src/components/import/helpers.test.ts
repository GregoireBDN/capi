import { describe, expect, it } from 'vitest'
import { ApiRequestError } from './api'
import {
  buildCommitPayload,
  countForReview,
  EMPTY_CHOICES,
} from './commit-payload'
import { commitErrorMessage, uploadErrorMessage } from './errors'
import {
  conflictReasonFr,
  fileValuesOf,
  formatDate,
  issueSentence,
  formatPeriod,
  parseIssueFr,
  undoDescription,
} from './format'
import { previewRows } from './test-fixtures'

describe('format', () => {
  it('formats calendar dates without a time zone shift', () => {
    expect(formatDate('2026-01-01')).toBe('01/01/2026')
    expect(formatDate('2026-12-31')).toBe('31/12/2026')
  })

  it('describes a period', () => {
    expect(formatPeriod('2026-03-01', '2026-03-31')).toBe(
      'du 01/03/2026 au 31/03/2026',
    )
    expect(formatPeriod('2026-03-01', '2026-03-01')).toBe('le 01/03/2026')
    expect(formatPeriod(null, null)).toBe('—')
  })

  it('translates conflict reasons and parse issues', () => {
    expect(
      conflictReasonFr(
        'Same amount, 2 days apart, same merchant, same balance',
      ),
    ).toBe('Même montant, 2 jours d’écart, même marchand, même solde')
    expect(conflictReasonFr('Something new')).toBeNull()
    expect(parseIssueFr('Invalid balance; Missing label')).toBe(
      'Solde invalide, libellé manquant',
    )
    expect(parseIssueFr('Expected 6 fields, found 4')).toBe(
      '4 colonnes au lieu de 6',
    )
    expect(parseIssueFr('Unknown problem')).toBe('ligne illisible')
  })
})

describe('issueSentence', () => {
  const cells = (entries: [string, string, string | null][]) =>
    entries.map(([column, value, field]) => ({
      column,
      value,
      field: field as never,
    }))
  const text = (parts: ReturnType<typeof issueSentence>) =>
    parts.map((p) => (typeof p === 'string' ? p : p.value)).join('')

  it('names the faulty date, or says it is missing', () => {
    expect(
      text(
        issueSentence({
          message: 'Invalid or missing date',
          cells: cells([['Date', '31/11/2026', 'date']]),
        }),
      ),
    ).toBe('La date 31/11/2026 n’existe pas.')
    expect(
      text(
        issueSentence({
          message: 'Invalid or missing date',
          cells: cells([['Date', ' ', 'date']]),
        }),
      ),
    ).toBe('La date est manquante.')
  })

  it('marks the file values apart from the text', () => {
    expect(
      issueSentence({
        message: 'Both debit and credit are filled',
        cells: cells([
          ['Débit', '-5,00', 'debit'],
          ['Crédit', '5,00', 'credit'],
        ]),
      }),
    ).toEqual([
      'Débit ',
      { value: '-5,00' },
      ' et crédit ',
      { value: '5,00' },
      ' sont remplis tous les deux : lequel garder ?',
    ])
  })

  it('joins several problems and falls back on unknown ones', () => {
    const both = cells([
      ['Solde', 'abc', 'balance'],
      ['Libellé', '', 'label'],
    ])
    expect(
      text(
        issueSentence({
          message: 'Invalid balance; Missing label',
          cells: both,
        }),
      ),
    ).toBe('Le solde abc n’est pas un montant. Le libellé est vide.')
    expect(
      text(
        issueSentence({
          message: 'Invalid debit amount',
          cells: cells([['Débit', '1x', 'debit']]),
        }),
      ),
    ).toBe('Le montant 1x n’est pas lisible.')
    expect(
      text(
        issueSentence({
          message: 'Neither debit nor credit is filled',
          cells: [],
        }),
      ),
    ).toBe('Ni débit ni crédit : indiquez le montant.')
    expect(
      text(
        issueSentence({ message: 'Unterminated quoted field', cells: null }),
      ),
    ).toBe('Guillemet non fermé.')
    expect(text(issueSentence({ message: 'Something new', cells: [] }))).toBe(
      'ligne illisible.',
    )
  })

  it('gives the file value of each form field, the blamed ones apart', () => {
    const values = fileValuesOf({
      message: 'Both debit and credit are filled',
      cells: cells([
        ['Date', '19/11/2026', 'date'],
        ['Date de valeur', '19/11/2026', 'valueDate'],
        ['Débit', '-5,00', 'debit'],
        ['Crédit', '5,00', 'credit'],
        ['Libellé', 'CB FAKE', 'label'],
        ['Solde', '', 'balance'],
        ['Note', 'x', null],
      ]),
    })
    expect(values?.values).toEqual({
      date: '19/11/2026',
      amount: '-5,00 / 5,00',
      label: 'CB FAKE',
    })
    expect([...(values?.bad ?? [])]).toEqual(['amount'])
    expect(
      fileValuesOf({ message: 'Unterminated quoted field', cells: null }),
    ).toBeNull()
  })
})

describe('uploadErrorMessage', () => {
  const err = (status: number | null, message?: string) =>
    new ApiRequestError(status, message ?? null)

  it('maps a non-CIC file', () => {
    expect(
      uploadErrorMessage(
        err(400, 'Not a CIC CSV export: missing column(s) Solde'),
      ),
    ).toMatch(/n’est pas un export CSV CIC/)
    expect(
      uploadErrorMessage(err(400, 'Not a CIC CSV export: the file is empty')),
    ).toBe('Le fichier est vide.')
  })

  it('maps a wrong account type and an archived account', () => {
    expect(
      uploadErrorMessage(
        err(
          400,
          'Bank exports can only be imported into a checking or savings account',
        ),
      ),
    ).toMatch(/compte courant ou un livret/)
    expect(
      uploadErrorMessage(err(400, 'Cannot import into an archived account')),
    ).toMatch(/archivé/)
  })

  it('maps too large files, network errors and server errors', () => {
    expect(uploadErrorMessage(err(413))).toMatch(/5 Mo/)
    expect(uploadErrorMessage(err(null))).toMatch(
      /Impossible de joindre le serveur/,
    )
    expect(uploadErrorMessage(new TypeError('Failed to fetch'))).toMatch(
      /Impossible de joindre le serveur/,
    )
    expect(uploadErrorMessage(err(502, 'API unreachable'))).toMatch(
      /Impossible de joindre le serveur/,
    )
    expect(uploadErrorMessage(err(500))).toMatch(/erreur/)
  })

  it('maps commit conflicts', () => {
    expect(
      commitErrorMessage(err(409, 'This import was already committed')),
    ).toBe('Cet import a déjà été validé.')
    expect(
      commitErrorMessage(
        err(409, 'This preview is outdated: upload the file again'),
      ),
    ).toMatch(/périmé/)
  })
})

describe('buildCommitPayload', () => {
  it('skips every conflict by default and sends no override', () => {
    expect(buildCommitPayload(previewRows, EMPTY_CHOICES)).toEqual({
      conflictResolutions: [{ rowIndex: 2, action: 'skip' }],
      categoryOverrides: [],
    })
  })

  it('sends overrides only for imported rows whose category changed', () => {
    const payload = buildCommitPayload(previewRows, {
      conflicts: { 4: 'skip' },
      categories: {
        2: 'cat-food', // unchanged: proposed category
        3: 'cat-pay', // new row: sent
        4: 'cat-fun', // skipped conflict: not sent
        5: 'cat-fun', // duplicate: never sent
      },
    })
    expect(payload.categoryOverrides).toEqual([
      { rowIndex: 1, categoryId: 'cat-pay' },
    ])
  })

  it('sends the override of a conflict imported anyway', () => {
    const payload = buildCommitPayload(previewRows, {
      conflicts: { 4: 'import' },
      categories: { 4: 'cat-fun' },
    })
    expect(payload).toEqual({
      conflictResolutions: [{ rowIndex: 2, action: 'import' }],
      categoryOverrides: [{ rowIndex: 2, categoryId: 'cat-fun' }],
    })
  })

  it('counts imported rows left for review', () => {
    expect(countForReview(previewRows, EMPTY_CHOICES)).toBe(1)
    expect(
      countForReview(previewRows, {
        conflicts: { 4: 'import' },
        categories: { 3: 'cat-pay' },
      }),
    ).toBe(1)
  })
})

describe('undoDescription', () => {
  const base = {
    fileName: 'export.csv',
    accountName: 'Compte courant',
    inserted: 42,
    edited: 0,
    absorbed: 0,
  }

  it('is the plain sentence when nothing was edited or absorbed', () => {
    expect(undoDescription(base)).toBe(
      '42 opérations ajoutées par « export.csv » sur Compte courant seront supprimées. Cette action est irréversible.',
    )
    expect(undoDescription({ ...base, inserted: 1 })).toBe(
      '1 opération ajoutée par « export.csv » sur Compte courant sera supprimée. Cette action est irréversible.',
    )
  })

  it('counts the rows edited by hand and the manual entries put back', () => {
    expect(undoDescription({ ...base, edited: 12, absorbed: 3 })).toBe(
      '42 opérations ajoutées par « export.csv » sur Compte courant seront supprimées, dont 12 modifiées à la main et 3 rapprochées de vos saisies : ces 3 saisies seront remises comme saisies manuelles. Réimporter le fichier ne rendra pas les modifications.',
    )
    expect(undoDescription({ ...base, edited: 1 })).toBe(
      '42 opérations ajoutées par « export.csv » sur Compte courant seront supprimées, dont 1 modifiée à la main. Réimporter le fichier ne rendra pas les modifications.',
    )
    expect(undoDescription({ ...base, absorbed: 1 })).toBe(
      '42 opérations ajoutées par « export.csv » sur Compte courant seront supprimées, dont 1 rapprochée d’une saisie : cette saisie sera remise comme saisie manuelle.',
    )
  })
})
