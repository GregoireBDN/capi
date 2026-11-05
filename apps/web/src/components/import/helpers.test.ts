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
  formatDate,
  formatPeriod,
  parseIssueFr,
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
      conflicts: { 2: 'skip' },
      categories: {
        0: 'cat-food', // unchanged: proposed category
        1: 'cat-pay', // new row: sent
        2: 'cat-fun', // skipped conflict: not sent
        3: 'cat-fun', // duplicate: never sent
      },
    })
    expect(payload.categoryOverrides).toEqual([
      { rowIndex: 1, categoryId: 'cat-pay' },
    ])
  })

  it('sends the override of a conflict imported anyway', () => {
    const payload = buildCommitPayload(previewRows, {
      conflicts: { 2: 'import' },
      categories: { 2: 'cat-fun' },
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
        conflicts: { 2: 'import' },
        categories: { 1: 'cat-pay' },
      }),
    ).toBe(1)
  })
})
