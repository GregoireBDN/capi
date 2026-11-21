import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import type {
  AccountDto,
  CategoryDto,
  ImportDetailDto,
  ImportPreviewRowDto,
  ImportSummaryDto,
} from '#/api'

/** Synthetic data only: fake labels, amounts and ids. */

export function ok<T>(data: T) {
  return { data, response: { ok: true, status: 200 } }
}

export function fail(status: number, message?: string) {
  return {
    data: undefined,
    error: message === undefined ? {} : { statusCode: status, message },
    response: { ok: false, status },
  }
}

/** What the generated client returns when `fetch` itself throws. */
export function networkFailure() {
  return { error: new TypeError('Failed to fetch'), response: undefined }
}

export function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    ),
  }
}

export const account: AccountDto = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Compte test',
  type: 'checking',
  institution: 'CIC',
  position: 0,
  archivedAt: null,
  balanceCents: 123456,
  balanceDate: '2026-03-31',
  cryptoSource: null,
  cryptoProvider: null,
  cryptoSyncedAt: null,
  investedBaseCents: null,
  investedBaseOn: null,
  openedOn: null,
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
}

export const categories: CategoryDto[] = [
  {
    id: 'cat-food',
    slug: 'groceries',
    name: 'Courses',
    kind: 'expense',
    color: null,
    icon: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  },
  {
    id: 'cat-fun',
    slug: 'leisure',
    name: 'Loisirs',
    kind: 'expense',
    color: null,
    icon: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  },
  {
    id: 'cat-pay',
    slug: 'salary',
    name: 'Salaire',
    kind: 'income',
    color: null,
    icon: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  },
]

function row(overrides: Partial<ImportPreviewRowDto>): ImportPreviewRowDto {
  return {
    index: 0,
    lineNumber: 2,
    bookingDate: '2026-03-02',
    valueDate: '2026-03-02',
    amountCents: -1250,
    balanceAfterCents: null,
    rawLabel: 'PAIEMENT CB FAKE SHOP',
    merchant: 'Fake Shop',
    status: 'new',
    conflictReason: null,
    existing: null,
    categoryId: 'cat-food',
    ruleId: 'rule-1',
    kind: 'expense',
    needsReview: false,
    manualMatch: null,
    ...overrides,
  }
}

export const previewRows: ImportPreviewRowDto[] = [
  row({
    index: 0,
    lineNumber: 2,
    rawLabel: 'CB FAKE BAKERY',
    merchant: 'Fake Bakery',
  }),
  row({
    index: 1,
    lineNumber: 3,
    rawLabel: 'VIR FAKE EMPLOYER',
    merchant: null,
    amountCents: 250000,
    categoryId: null,
    ruleId: null,
    kind: 'income',
    needsReview: true,
  }),
  row({
    index: 2,
    lineNumber: 4,
    rawLabel: 'CB FAKE CINEMA',
    merchant: 'Fake Cinema',
    status: 'conflict',
    conflictReason: 'Same amount, 1 day apart, similar label',
    existing: {
      id: 'tx-old',
      bookingDate: '2026-03-03',
      amountCents: -1250,
      rawLabel: 'FAKE CINEMA SHEET',
    },
    categoryId: null,
    ruleId: null,
    needsReview: true,
  }),
  row({
    index: 3,
    lineNumber: 5,
    rawLabel: 'CB FAKE GARAGE',
    merchant: 'Fake Garage',
    status: 'duplicate',
    existing: {
      id: 'tx-dup',
      bookingDate: '2026-03-02',
      amountCents: -1250,
      rawLabel: 'CB FAKE GARAGE',
    },
  }),
]

export const pendingDetail: ImportDetailDto = {
  id: '00000000-0000-4000-8000-0000000000aa',
  accountId: account.id,
  accountName: account.name,
  source: 'cic_csv',
  fileName: 'export-test.csv',
  status: 'pending',
  periodStart: '2026-03-02',
  periodEnd: '2026-03-05',
  counts: {
    rows: 4,
    new: 2,
    duplicates: 1,
    conflicts: 1,
    issues: 1,
    inserted: 0,
    skipped: 0,
  },
  createdAt: '2026-04-01T08:00:00.000Z',
  committedAt: null,
  alreadyImported: null,
  undo: null,
  preview: {
    unmatchedManual: [],
    previousBalanceCents: null,
    continuity: {
      checked: true,
      ok: false,
      order: 'descending',
      gaps: [
        {
          lineNumber: 4,
          expectedCents: 10000,
          actualCents: 7500,
          fromDate: '2026-03-03',
          toDate: '2026-03-04',
        },
      ],
      openingMismatch: null,
    },
    issues: [{ lineNumber: 7, message: 'Invalid or missing date' }],
    rows: previewRows,
  },
}

export const committedSummary: ImportSummaryDto = {
  id: '00000000-0000-4000-8000-0000000000bb',
  accountId: account.id,
  accountName: account.name,
  source: 'cic_csv',
  fileName: 'old-export.csv',
  status: 'committed',
  periodStart: '2026-02-01',
  periodEnd: '2026-02-28',
  counts: {
    rows: 12,
    new: 12,
    duplicates: 0,
    conflicts: 0,
    issues: 0,
    inserted: 12,
    skipped: 0,
  },
  createdAt: '2026-03-01T09:00:00.000Z',
  committedAt: '2026-03-01T09:01:00.000Z',
}

/** `committedSummary` as `GET /imports/:id` returns it, nothing edited. */
export const committedDetail: ImportDetailDto = {
  ...committedSummary,
  alreadyImported: null,
  preview: null,
  undo: { editedCount: 0, absorbedManualCount: 0 },
}
