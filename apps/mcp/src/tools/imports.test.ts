// Bank CSV import tools (#103): the preview writes nothing, the commit needs
// confirm: true, committing twice or re-importing a file adds nothing, a read
// token is refused, stderr never carries labels, amounts or paths.
// Synthetic data only (fake labels, amounts and accounts).
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ImportDetailDto,
  ImportPreviewRowDto,
  ImportSummaryDto,
  TransactionDto,
  TransactionListDto,
} from '../api/types.js'
import {
  checking,
  groceries,
  livret,
  pea,
  salary,
  transaction,
} from '../test/fixtures.js'
import { connect, jsonError, type Call } from '../test/mock-api.js'

const FIXTURE = fileURLToPath(
  new URL('../test/fixtures/cic-releve.csv', import.meta.url),
)
const PREVIEW_ID = '00000000-0000-4000-8000-0000000000e1'
const OTHER_IMPORT = '00000000-0000-4000-8000-0000000000e2'
const accounts = [checking, livret, pea]
const categories = [groceries, salary]

function row(
  index: number,
  overrides: Partial<ImportPreviewRowDto> = {},
): ImportPreviewRowDto {
  return {
    index,
    lineNumber: index + 2,
    bookingDate: '2026-10-01',
    valueDate: '2026-10-01',
    amountCents: -420,
    balanceAfterCents: null,
    rawLabel: 'CB BOULANGERIE DU TEST 02/10',
    merchant: 'BOULANGERIE DU TEST',
    status: 'new',
    conflictReason: null,
    existing: null,
    categoryId: null,
    ruleId: null,
    kind: 'expense',
    needsReview: true,
    manualMatch: null,
    ...overrides,
  }
}

const freshRows = [
  row(0, {
    amountCents: 210000,
    rawLabel: 'VIR SEPA SALAIRE SOCIETE FICTIVE OCT',
    categoryId: salary.id,
    kind: 'income',
    needsReview: false,
  }),
  row(1, { amountCents: -3745, rawLabel: 'CB ÉPICERIE FICTIVE 05/10' }),
]

function pendingDetail(
  rows: ImportPreviewRowDto[] = freshRows,
  overrides: Partial<ImportDetailDto> = {},
): ImportDetailDto {
  const count = (status: ImportPreviewRowDto['status']) =>
    rows.filter((r) => r.status === status).length
  return {
    id: PREVIEW_ID,
    accountId: checking.id,
    accountName: checking.name,
    source: 'cic_csv',
    fileName: 'cic-releve.csv',
    status: 'pending',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-09',
    counts: {
      rows: rows.length,
      new: count('new'),
      duplicates: count('duplicate'),
      conflicts: count('conflict'),
      issues: 0,
      inserted: 0,
      skipped: 0,
    },
    createdAt: '2026-11-14T09:00:00.000Z',
    committedAt: null,
    alreadyImported: null,
    preview: {
      previousBalanceCents: 50000,
      continuity: {
        checked: true,
        ok: true,
        order: 'ascending',
        gaps: [],
        openingMismatch: null,
      },
      issues: [],
      rows,
      unmatchedManual: [],
    },
    ...overrides,
  }
}

function committedDetail(
  inserted: number,
  overrides: Partial<ImportDetailDto> = {},
): ImportDetailDto {
  const pending = pendingDetail()
  return {
    ...pending,
    status: 'committed',
    committedAt: '2026-11-14T09:05:00.000Z',
    counts: { ...pending.counts, inserted },
    preview: null,
    ...overrides,
  }
}

const reviewTx: TransactionDto = {
  ...transaction,
  id: '00000000-0000-4000-8000-0000000000f1',
  importId: PREVIEW_ID,
  bookingDate: '2026-10-06',
  amountCents: -3745,
  rawLabel: 'CB ÉPICERIE FICTIVE 05/10',
  categoryId: null,
  category: null,
  needsReview: true,
}
const otherReviewTx: TransactionDto = {
  ...reviewTx,
  id: '00000000-0000-4000-8000-0000000000f2',
  importId: OTHER_IMPORT,
  rawLabel: 'CB AUTRE IMPORT TEST',
}

function transactionsRoute(rows: TransactionDto[]) {
  return (): TransactionListDto => ({
    items: rows,
    total: rows.length,
    page: 1,
    limit: 100,
  })
}

const commitPath = `/api/imports/${PREVIEW_ID}/commit`
const commits = (calls: Call[]) =>
  calls.filter((c) => c.method === 'POST' && c.url.pathname === commitPath)
const uploads = (calls: Call[]) =>
  calls.filter(
    (c) => c.method === 'POST' && c.url.pathname === '/api/imports/preview',
  )

async function uploadedFile(call: Call | undefined) {
  const form = call?.body as FormData
  const file = form.get('file') as File
  return {
    accountId: form.get('accountId'),
    name: file.name,
    bytes: Buffer.from(await file.arrayBuffer()),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('preview_bank_import', () => {
  const routes = (detail: ImportDetailDto | Response = pendingDetail()) => ({
    '/api/accounts': accounts,
    '/api/categories': categories,
    'POST /api/imports/preview': () => detail,
  })

  it('uploads the file from its path as is and writes nothing else', async () => {
    const { call, calls } = await connect(routes())
    const result = await call('preview_bank_import', {
      account: 'compte courant',
      filePath: FIXTURE,
    })

    expect(result.isError).toBe(false)
    expect(uploads(calls)).toHaveLength(1)
    const sent = await uploadedFile(uploads(calls)[0])
    expect(sent.accountId).toBe(checking.id)
    expect(sent.name).toBe('cic-releve.csv')
    // The Windows-1252 bytes of the export, untouched.
    expect(sent.bytes.equals(await readFile(FIXTURE))).toBe(true)
    expect(sent.bytes.includes(Buffer.from([0xe9]))).toBe(true)
    expect(commits(calls)).toHaveLength(0)
    expect(
      calls.filter((c) => c.method !== 'GET' && c !== uploads(calls)[0]),
    ).toHaveLength(0)

    expect(result.text).toContain("rien n'a encore été importé")
    expect(result.text).toContain(`previewId) : ${PREVIEW_ID}`)
    expect(result.text).toContain('du 01/10/2026 au 09/10/2026')
    expect(result.text).toContain(
      'Lignes lues : 2 · nouvelles : 2 · déjà importées : 0 · conflits : 0',
    )
    expect(result.text).toContain('entrées +2 100,00 €, sorties -37,45 €')
    expect(result.text).toContain('1 iront dans la file de revue')
    expect(result.text).toContain('Continuité du solde : OK')
    expect(result.text).toContain('| 01/10/2026 | +2 100,00 € |')
    expect(result.text).toContain('Salaire')
    expect(result.text).toContain('à revoir (sans catégorie)')
    expect(result.text).toContain(
      `commit_bank_import avec previewId "${PREVIEW_ID}" et confirm: true`,
    )
  })

  it('sends text content as UTF-8 with a BOM, under a default name', async () => {
    const { call, calls } = await connect(routes())
    const content =
      'Date;Date de valeur;Débit;Crédit;Libellé;Solde\r\n01/10/2026;01/10/2026;-4,20;;CB BOULANGERIE DU TEST;95,80\r\n'
    const result = await call('preview_bank_import', {
      account: 'Livret A',
      content,
    })

    expect(result.isError).toBe(false)
    const sent = await uploadedFile(uploads(calls)[0])
    expect(sent.accountId).toBe(livret.id)
    expect(sent.name).toBe('releve-cic.csv')
    expect([...sent.bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(sent.bytes.subarray(3).toString('utf8')).toBe(content)
  })

  it('reports gaps, conflicts and unreadable lines', async () => {
    const detail = pendingDetail([
      ...freshRows,
      row(2, {
        status: 'conflict',
        conflictReason: 'same amount 1 day apart',
        existing: {
          id: transaction.id,
          bookingDate: '2026-10-02',
          amountCents: -420,
          rawLabel: 'BOULANGERIE TEST (tableur)',
        },
      }),
    ])
    detail.counts.issues = 1
    detail.preview!.issues = [{ lineNumber: 9, message: 'Invalid date' }]
    detail.preview!.continuity = {
      checked: true,
      ok: false,
      order: 'ascending',
      gaps: [
        {
          lineNumber: 5,
          expectedCents: 174160,
          actualCents: 170415,
          fromDate: '2026-10-03',
          toDate: '2026-10-06',
        },
      ],
      openingMismatch: null,
    }
    const { call } = await connect(routes(detail))
    const result = await call('preview_bank_import', {
      account: 'Compte courant',
      filePath: FIXTURE,
    })

    expect(result.text).toContain('Continuité du solde : PROBLÈME')
    expect(result.text).toContain(
      'ligne 5 : opérations manquantes entre le 03/10/2026 et le 06/10/2026 (solde attendu 1 741,60 €, solde du fichier 1 704,15 €)',
    )
    expect(result.text).toContain('ressemble à : 02/10/2026 · -4,20 €')
    expect(result.text).toContain('ligne 9 : Invalid date')
    expect(result.text).toContain('includeConflicts: true')
  })

  it('says when there is nothing new (re-imported file)', async () => {
    const detail = pendingDetail(
      freshRows.map((r) => ({ ...r, status: 'duplicate' as const })),
      {
        alreadyImported: {
          importId: OTHER_IMPORT,
          committedAt: '2026-11-01T23:30:00.000Z',
        },
      },
    )
    const { call } = await connect(routes(detail))
    const result = await call('preview_bank_import', {
      account: 'Compte courant',
      filePath: FIXTURE,
    })
    expect(result.text).toContain('déjà importées : 2')
    expect(result.text).toContain('Rien de nouveau')
    // Paris calendar day of the commit, not the UTC one.
    expect(result.text).toContain('déjà été importé le 02/11/2026')
  })

  it.each([
    [{ account: 'Compte courant' }, 'soit filePath'],
    [
      { account: 'Compte courant', filePath: FIXTURE, content: 'x' },
      'soit filePath',
    ],
    [{ account: 'Compte courant', filePath: 'releve.csv' }, 'non absolu'],
    [{ account: 'Compte courant', filePath: '/tmp/notes.txt' }, '.csv'],
    [
      { account: 'Compte courant', filePath: '/nonexistent/finances/x.csv' },
      'Fichier introuvable',
    ],
    [{ account: 'PEA', filePath: FIXTURE }, 'ne reçoit pas de relevé'],
    [{ account: 'Compte courant', content: '  ' }, 'vide'],
  ])('refuses %o before uploading', async (args, message) => {
    const { call, calls } = await connect(routes())
    const result = await call('preview_bank_import', args)
    expect(result.isError).toBe(true)
    expect(result.text).toContain(message)
    expect(uploads(calls)).toHaveLength(0)
  })

  it('explains that a read token cannot preview, without logging the file', async () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { call } = await connect(routes(jsonError(403)))
    const result = await call('preview_bank_import', {
      account: 'Compte courant',
      filePath: FIXTURE,
    })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('lecture seule')
    const logged = stderr.mock.calls.flat().join('\n')
    expect(logged).toBe('[finances-mcp] preview_bank_import: API error 403')
    expect(logged).not.toContain('cic-releve')
  })

  it('passes the API refusal of a file that is not a CIC export', async () => {
    const { call } = await connect(
      routes(
        jsonError(400, {
          message: 'Not a CIC CSV export: missing columns Débit, Crédit',
        }),
      ),
    )
    const result = await call('preview_bank_import', {
      account: 'Compte courant',
      content: 'a;b\r\n1;2\r\n',
    })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('Not a CIC CSV export')
  })
})

describe('commit_bank_import', () => {
  function routes(state: { detail: ImportDetailDto }, overrides = {}) {
    return {
      '/api/accounts': accounts,
      '/api/categories': categories,
      [`GET /api/imports/${PREVIEW_ID}`]: () => state.detail,
      [`POST ${commitPath}`]: (_url: URL, body: unknown) => {
        if (state.detail.status === 'committed') {
          return jsonError(409, {
            message: 'This import was already committed',
          })
        }
        const conflicts =
          (body as { conflictResolutions?: unknown[] }).conflictResolutions
            ?.length ?? 0
        state.detail = committedDetail(state.detail.counts.new + conflicts, {
          counts: {
            ...state.detail.counts,
            inserted: state.detail.counts.new + conflicts,
          },
        })
        return state.detail
      },
      'GET /api/transactions': transactionsRoute([reviewTx, otherReviewTx]),
      ...overrides,
    }
  }

  it('writes nothing without confirm', async () => {
    const state = { detail: pendingDetail() }
    const { call, calls } = await connect(routes(state))
    const result = await call('commit_bank_import', { previewId: PREVIEW_ID })
    expect(result.isError).toBe(false)
    expect(commits(calls)).toHaveLength(0)
    expect(result.text).toContain("rien n'a encore été importé")
    expect(result.text).toContain(
      'Avec confirm: true : 2 opération(s) ajoutée(s).',
    )
  })

  it('commits once with confirm and lists the rows to review with their ids', async () => {
    const state = { detail: pendingDetail() }
    const { call, calls } = await connect(routes(state))
    const result = await call('commit_bank_import', {
      previewId: PREVIEW_ID,
      confirm: true,
    })

    expect(result.isError).toBe(false)
    expect(commits(calls)).toHaveLength(1)
    expect(commits(calls)[0]?.body).toEqual({})
    expect(result.text).toContain('Import validé.')
    expect(result.text).toContain(
      'Opérations ajoutées : 2 · déjà présentes : 0',
    )
    expect(result.text).toContain('1 opération(s) de cet import à revoir')
    expect(result.text).toContain(`(id ${reviewTx.id}) · sans catégorie`)
    expect(result.text).not.toContain(otherReviewTx.id)
    expect(result.text).toContain('categorize_transactions')

    const query = calls.find((c) => c.url.pathname === '/api/transactions')?.url
      .searchParams
    expect(query?.get('accountId')).toBe(checking.id)
    expect(query?.get('from')).toBe('2026-10-01')
    expect(query?.get('to')).toBe('2026-10-09')
    expect(query?.get('needsReview')).toBe('true')
  })

  it('imports the conflicts only with includeConflicts', async () => {
    const rows = [
      ...freshRows,
      row(2, { status: 'conflict' }),
      row(3, { status: 'duplicate' }),
    ]
    const state = { detail: pendingDetail(rows) }
    const { call, calls } = await connect(routes(state))
    const result = await call('commit_bank_import', {
      previewId: PREVIEW_ID,
      confirm: true,
      includeConflicts: true,
    })
    expect(result.isError).toBe(false)
    expect(commits(calls)[0]?.body).toEqual({
      conflictResolutions: [{ rowIndex: 2, action: 'import' }],
    })
  })

  it('changes nothing when the preview is already committed', async () => {
    const state = { detail: pendingDetail() }
    const { call, calls } = await connect(routes(state))
    await call('commit_bank_import', { previewId: PREVIEW_ID, confirm: true })
    const again = await call('commit_bank_import', {
      previewId: PREVIEW_ID,
      confirm: true,
    })
    expect(again.isError).toBe(false)
    expect(commits(calls)).toHaveLength(1)
    expect(again.text).toContain('déjà été validé le 14/11/2026')
    expect(again.text).toContain("rien de plus n'a été écrit")
  })

  it('reports a commit made meanwhile instead of failing', async () => {
    const state = { detail: pendingDetail() }
    const { call, calls } = await connect(
      routes(state, {
        [`POST ${commitPath}`]: () => {
          state.detail = committedDetail(2)
          return jsonError(409, {
            message: 'This import was already committed',
          })
        },
      }),
    )
    const result = await call('commit_bank_import', {
      previewId: PREVIEW_ID,
      confirm: true,
    })
    expect(result.isError).toBe(false)
    expect(commits(calls)).toHaveLength(1)
    expect(result.text).toContain("venait d'être validé")
  })

  it('re-importing the same file inserts nothing', async () => {
    const duplicates = freshRows.map((r) => ({
      ...r,
      status: 'duplicate' as const,
    }))
    const state = { detail: pendingDetail(duplicates) }
    const { call } = await connect(
      routes(state, { 'GET /api/transactions': transactionsRoute([]) }),
    )
    const result = await call('commit_bank_import', {
      previewId: PREVIEW_ID,
      confirm: true,
    })
    expect(result.text).toContain(
      'Opérations ajoutées : 0 · déjà présentes : 2',
    )
    expect(result.text).toContain('File de revue : rien de nouveau.')
  })

  it('explains an expired preview', async () => {
    const { call, calls } = await connect({
      [`GET /api/imports/${PREVIEW_ID}`]: jsonError(404),
    })
    const result = await call('commit_bank_import', {
      previewId: PREVIEW_ID,
      confirm: true,
    })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('expiré')
    expect(commits(calls)).toHaveLength(0)
  })

  it('explains that a read token cannot commit', async () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const state = { detail: pendingDetail() }
    const { call } = await connect(
      routes(state, { [`POST ${commitPath}`]: jsonError(403) }),
    )
    const result = await call('commit_bank_import', {
      previewId: PREVIEW_ID,
      confirm: true,
    })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('lecture seule')
    expect(stderr.mock.calls.flat().join('\n')).toBe(
      '[finances-mcp] commit_bank_import: API error 403',
    )
  })
})

describe('list_imports', () => {
  const summary = (overrides: Partial<ImportSummaryDto>): ImportSummaryDto => {
    const {
      preview: _preview,
      alreadyImported: _already,
      ...base
    } = committedDetail(12)
    return { ...base, ...overrides }
  }
  const imports = [
    summary({
      id: OTHER_IMPORT,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      fileName: 'septembre.csv',
      committedAt: '2026-10-02T08:00:00.000Z',
    }),
    summary({ fileName: 'octobre.csv' }),
    {
      ...summary({}),
      id: '00000000-0000-4000-8000-0000000000e3',
      status: 'pending' as const,
      committedAt: null,
      fileName: 'novembre.csv',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-12',
    },
  ]

  it('gives the last import and the data end per cash account, and pending previews', async () => {
    const { call } = await connect({
      '/api/accounts': accounts,
      '/api/imports': imports,
    })
    const result = await call('list_imports')
    expect(result.isError).toBe(false)
    expect(result.text).toContain(
      '| Compte courant | 14/11/2026 | du 01/10/2026 au 09/10/2026 (octobre.csv, +12) | 09/10/2026 | 2 |',
    )
    expect(result.text).toContain('| Livret A | jamais | — | — | 0 |')
    expect(result.text).not.toContain('PEA')
    expect(result.text).toContain(
      'novembre.csv, du 01/11/2026 au 12/11/2026, 2 nouvelle(s)',
    )
    expect(result.text).toContain(
      'previewId 00000000-0000-4000-8000-0000000000e3',
    )
  })

  it('narrows to one account', async () => {
    const { call } = await connect({
      '/api/accounts': accounts,
      '/api/imports': imports,
    })
    const result = await call('list_imports', { account: 'livret' })
    expect(result.text).toContain('| Livret A | jamais |')
    expect(result.text).not.toContain('Compte courant')
  })
})
