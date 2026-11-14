import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CryptoImportDto } from '#/api/types.gen'
import {
  exchangeImportErrorMessage,
  lineList,
  periodText,
} from './exchange-import'
import { ExchangeImportSheet } from './ExchangeImportSheet'
import { ApiRequestError } from '#/lib/queries'

const api = vi.hoisted(() => ({
  accountCryptoImportsControllerPreview: vi.fn(),
  cryptoImportsControllerCommit: vi.fn(),
  cryptoImportsControllerRemove: vi.fn(),
  cryptoControllerSearch: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)

vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast }))

/** Testing Library collapses the narrow no-break spaces `Intl` emits. */
const text = (value: string | null) => (value ?? '').replace(/\s/g, ' ')

/** Synthetic data only. */
const ACCOUNT_ID = 'a0000000-0000-4000-8000-000000000003'
const IMPORT_ID = 'i0000000-0000-4000-8000-000000000001'

function preview(overrides: Partial<CryptoImportDto> = {}): CryptoImportDto {
  return {
    id: IMPORT_ID,
    accountId: ACCOUNT_ID,
    format: 'coinbase_csv',
    fileName: 'coinbase-2025.csv',
    status: 'pending',
    createdAt: '2026-11-14T10:00:00.000Z',
    committedAt: null,
    periodStart: '2025-03-01T10:00:00.000Z',
    periodEnd: '2025-03-08T09:00:00.000Z',
    counts: { rows: 3, new: 2, duplicates: 1, issues: 1, inserted: 0 },
    issues: [{ lineNumber: 7, message: 'Date illisible' }],
    unknownOperations: [{ operation: 'Mystery Airdrop', count: 1 }],
    unmappedTickers: ['XYZ'],
    holdings: [
      {
        tickers: ['BTC'],
        assetId: 'bitcoin',
        symbol: 'BTC',
        name: 'Bitcoin',
        quantity: '0.000301',
        investedCents: 1531,
        status: 'ok',
      },
      {
        tickers: ['ETH'],
        assetId: 'ethereum',
        symbol: 'ETH',
        name: 'Ethereum',
        quantity: '-1',
        investedCents: null,
        status: 'negative',
      },
      {
        tickers: ['XYZ'],
        assetId: null,
        symbol: 'XYZ',
        name: null,
        quantity: '5',
        investedCents: null,
        status: 'unmapped',
      },
    ],
    rows: [
      {
        index: 0,
        lineNumber: 4,
        occurredAt: '2025-03-01T10:05:00.000Z',
        wallet: null,
        operation: 'Buy',
        kind: 'buy',
        known: true,
        asset: 'BTC',
        quantity: '0.001',
        eurCents: 5099,
        status: 'duplicate',
      },
      {
        index: 1,
        lineNumber: 5,
        occurredAt: '2025-03-08T09:00:00.000Z',
        wallet: null,
        operation: 'Mystery Airdrop',
        kind: 'other',
        known: false,
        asset: 'XYZ',
        quantity: '5',
        eurCents: 0,
        status: 'new',
      },
    ],
    ...overrides,
  }
}

function ok<T>(data: T, status = 200) {
  return Promise.resolve({ data, response: new Response(null, { status }) })
}

function fail(status: number, message: string) {
  return Promise.resolve({
    error: { message },
    response: new Response(null, { status }),
  })
}

function renderSheet() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const onOpenChange = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <ExchangeImportSheet
        open
        onOpenChange={onOpenChange}
        accountId={ACCOUNT_ID}
      />
    </QueryClientProvider>,
  )
  return { onOpenChange }
}

const csv = (name = 'coinbase-2025.csv') =>
  new File(['ID,Timestamp\n'], name, { type: 'text/csv' })

describe('ExchangeImportSheet', () => {
  beforeEach(() => {
    api.accountCryptoImportsControllerPreview.mockImplementation(() =>
      ok(preview(), 201),
    )
    api.cryptoImportsControllerCommit.mockImplementation(() =>
      ok(
        preview({
          status: 'committed',
          rows: [],
          counts: { rows: 3, new: 2, duplicates: 1, issues: 1, inserted: 2 },
        }),
      ),
    )
    api.cryptoImportsControllerRemove.mockImplementation(() =>
      ok({ deletedMovements: 0 }),
    )
    api.cryptoControllerSearch.mockImplementation(() =>
      ok([{ id: 'xyz-token', symbol: 'xyz', name: 'XYZ Token', rank: 50 }]),
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('previews an export, maps a ticker and imports it', async () => {
    const user = userEvent.setup()
    const { onOpenChange } = renderSheet()

    await user.upload(screen.getByLabelText('Fichier CSV'), csv())
    expect(api.accountCryptoImportsControllerPreview).toHaveBeenCalledWith(
      expect.objectContaining({ path: { id: ACCOUNT_ID } }),
    )

    expect(await screen.findByText('coinbase-2025.csv')).toBeInTheDocument()
    expect(screen.getByText('2 nouvelles lignes')).toBeInTheDocument()
    expect(screen.getByText('1 déjà importée')).toBeInTheDocument()
    expect(screen.getByText('Mystery Airdrop (1)')).toBeInTheDocument()
    expect(screen.getByText(/Ligne 7/)).toBeInTheDocument()
    expect(screen.getByText(/Le solde de ETH serait/)).toBeInTheDocument()

    const holdings = screen.getByRole('list', {
      name: 'Avoirs après l’import',
    })
    expect(text(within(holdings).getByText(/^Investi 15/).textContent)).toBe(
      'Investi 15,31 €',
    )
    expect(
      within(holdings).getByText('Historique incomplet'),
    ).toBeInTheDocument()
    expect(within(holdings).getByText('Sans cours')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Associer un actif' }))
    await user.type(screen.getByPlaceholderText('Bitcoin, ETH…'), 'xyz')
    await user.click(await screen.findByRole('button', { name: /XYZ Token/ }))
    expect(screen.getByText('→ XYZ Token (XYZ)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Importer 2 lignes' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(api.cryptoImportsControllerCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: IMPORT_ID },
        body: {
          assets: [
            {
              ticker: 'XYZ',
              assetId: 'xyz-token',
              symbol: 'XYZ',
              name: 'XYZ Token',
            },
          ],
        },
      }),
    )
    expect(toast.success).toHaveBeenCalledWith(
      'Export importé : 2 lignes ajoutées',
    )
    expect(api.cryptoImportsControllerRemove).not.toHaveBeenCalled()
  })

  it('discards the pending import on cancel', async () => {
    const user = userEvent.setup()
    const { onOpenChange } = renderSheet()
    await user.upload(screen.getByLabelText('Fichier CSV'), csv())
    await user.click(await screen.findByRole('button', { name: 'Annuler' }))
    expect(api.cryptoImportsControllerRemove).toHaveBeenCalledWith(
      expect.objectContaining({ path: { id: IMPORT_ID } }),
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(api.cryptoImportsControllerCommit).not.toHaveBeenCalled()
  })

  it('explains a refused file', async () => {
    api.accountCryptoImportsControllerPreview.mockImplementation(() =>
      fail(400, 'This is a Coinbase export; the account is not'),
    )
    const user = userEvent.setup({ applyAccept: false })
    renderSheet()
    await user.upload(screen.getByLabelText('Fichier CSV'), csv())
    expect(
      await screen.findByText(
        'Ce fichier est un export Coinbase : importez-le dans le compte Coinbase.',
      ),
    ).toBeInTheDocument()

    await user.upload(
      screen.getByLabelText('Fichier CSV'),
      new File(['x'], 'releve.pdf', { type: 'application/pdf' }),
    )
    expect(
      screen.getByText(
        'Choisissez le fichier .csv exporté depuis la plateforme.',
      ),
    ).toBeInTheDocument()
    expect(api.accountCryptoImportsControllerPreview).toHaveBeenCalledTimes(1)
  })
})

describe('exchange import helpers', () => {
  it('lists skipped lines', () => {
    expect(lineList([3])).toBe('Ligne 3')
    expect(lineList([3, 5, 8])).toBe('Lignes 3, 5 et 8')
    expect(lineList([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe(
      'Lignes 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 et 2 autres',
    )
  })

  it('states the period in Paris days', () => {
    expect(
      periodText({
        periodStart: '2025-01-10T09:00:00.000Z',
        periodEnd: '2025-02-07T23:30:00.000Z',
      }),
    ).toBe('du 10 janv. 2025 au 8 févr. 2025')
    expect(periodText({ periodStart: null, periodEnd: null })).toBeNull()
  })

  it('maps API errors to French messages', () => {
    expect(
      exchangeImportErrorMessage(
        new ApiRequestError(
          400,
          'Not a Binance or Coinbase transactions export',
        ),
      ),
    ).toMatch(/n’est pas un export « Transactions »/)
    expect(exchangeImportErrorMessage(new ApiRequestError(409, null))).toMatch(
      /déjà été validé/,
    )
    expect(exchangeImportErrorMessage(new Error('offline'))).toMatch(
      /Impossible de joindre/,
    )
  })
})
