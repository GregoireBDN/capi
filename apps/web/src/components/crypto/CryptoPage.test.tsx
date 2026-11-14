import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AccountDto,
  CryptoSummaryAccountDto,
  CryptoSummaryDto,
  ValuedHoldingDto,
} from '#/api/types.gen'
import { CryptoPage } from './CryptoPage'

const api = vi.hoisted(() => ({
  cryptoControllerSummary: vi.fn(),
  cryptoControllerValuate: vi.fn(),
  cryptoControllerSearch: vi.fn(),
  cryptoControllerSetPrice: vi.fn(),
  accountsControllerList: vi.fn(),
  accountsControllerCreate: vi.fn(),
  accountHoldingsControllerCreate: vi.fn(),
  accountHoldingsControllerUpdate: vi.fn(),
  accountHoldingsControllerRemove: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)

vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string
    params?: Record<string, string>
    children: ReactNode
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce(
        (url, [key, value]) => url.replace(`$${key}`, value),
        to,
      )}
      {...props}
    >
      {children}
    </a>
  ),
}))

// Radix RadioGroup (radio cards) measures itself; jsdom has no ResizeObserver.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

/** Testing Library collapses the narrow no-break spaces `Intl` emits. */
const text = (value: string | null) => (value ?? '').replace(/\s/g, ' ')

/** Synthetic data only. */
const LEDGER_ID = 'a0000000-0000-4000-8000-000000000011'
const NEW_ID = 'a0000000-0000-4000-8000-000000000012'
const NOW = new Date('2026-11-06T10:00:00Z')

function holding(overrides: Partial<ValuedHoldingDto> = {}): ValuedHoldingDto {
  return {
    id: 'h0000000-0000-4000-8000-000000000001',
    accountId: LEDGER_ID,
    assetId: 'bitcoin',
    symbol: 'BTC',
    name: 'Bitcoin',
    quantity: '0.5',
    location: 'Coffre test',
    investedCents: 1_000_000,
    note: null,
    priceEur: '40000',
    priceSource: 'provider',
    priceFetchedAt: '2026-11-06T09:55:00Z',
    priceStale: false,
    valueCents: 2_000_000,
    gainCents: 1_000_000,
    ...overrides,
  }
}

const TOTALS = {
  valueCents: 2_000_000,
  investedCents: 1_000_000,
  gainCents: 1_000_000,
  missingPriceCount: 0,
  staleCount: 0,
  withoutInvestedCount: 0,
}

function account(
  overrides: Partial<CryptoSummaryAccountDto> = {},
): CryptoSummaryAccountDto {
  return {
    accountId: LEDGER_ID,
    name: 'Ledger test',
    institution: 'Ledger',
    holdings: [holding()],
    totals: TOTALS,
    complete: true,
    snapshot: null,
    priceApiEnabled: true,
    refreshFailed: false,
    ...overrides,
  }
}

function summary(overrides: Partial<CryptoSummaryDto> = {}): CryptoSummaryDto {
  return {
    accounts: [account()],
    totals: TOTALS,
    priceApiEnabled: true,
    refreshFailed: false,
    ...overrides,
  }
}

const EMPTY_TOTALS = {
  valueCents: 0,
  investedCents: null,
  gainCents: null,
  missingPriceCount: 0,
  staleCount: 0,
  withoutInvestedCount: 0,
}

function accountDto(id: string, name: string): AccountDto {
  return {
    id,
    name,
    type: 'crypto',
    institution: name,
    position: 0,
    archivedAt: null,
    balanceCents: 2_000_000,
    balanceDate: '2026-11-05',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  }
}

function ok<T>(data: T, status = 200) {
  return Promise.resolve({ data, response: new Response(null, { status }) })
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <CryptoPage />
    </QueryClientProvider>,
  )
  return { invalidate }
}

describe('CryptoPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    for (const fn of Object.values(api)) fn.mockReset()
    toast.success.mockReset()
    toast.error.mockReset()
    api.cryptoControllerSummary.mockImplementation(() => ok(summary()))
    api.accountsControllerList.mockImplementation(() =>
      ok([accountDto(LEDGER_ID, 'Ledger test')]),
    )
    api.accountsControllerCreate.mockImplementation(
      ({ body }: { body: { name: string } }) =>
        ok(accountDto(NEW_ID, body.name), 201),
    )
    api.accountHoldingsControllerCreate.mockImplementation(
      ({
        path,
        body,
      }: {
        path: { id: string }
        body: Partial<ValuedHoldingDto>
      }) => ok({ ...holding(), ...body, id: 'new', accountId: path.id }, 201),
    )
    api.accountHoldingsControllerUpdate.mockImplementation(
      ({ body }: { body: Partial<ValuedHoldingDto> }) =>
        ok({ ...holding(), ...body }),
    )
    api.cryptoControllerSearch.mockImplementation(() =>
      ok([{ id: 'ethereum', symbol: 'ETH', name: 'Ethereum', rank: 2 }]),
    )
    api.cryptoControllerSetPrice.mockImplementation(() =>
      ok({
        assetId: 'ethereum',
        priceEur: '1',
        source: 'manual',
        fetchedAt: NOW.toISOString(),
      }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('offers to add a first wallet when nothing is tracked yet', async () => {
    api.cryptoControllerSummary.mockImplementation(() =>
      ok(summary({ accounts: [], totals: EMPTY_TOTALS })),
    )
    renderPage()
    expect(await screen.findByText('Aucune crypto suivie')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Ajouter un wallet' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Actualiser les cours' }),
    ).not.toBeInTheDocument()
  })

  it('adds a first holding from an empty app, creating its wallet', async () => {
    const user = userEvent.setup()
    api.cryptoControllerSummary.mockImplementation(() =>
      ok(summary({ accounts: [], totals: EMPTY_TOTALS })),
    )
    const { invalidate } = renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Ajouter un wallet' }),
    )
    const sheet = within(screen.getByRole('dialog'))
    // No account to pick from: straight to the exchange or wallet.
    expect(sheet.queryByText('Compte')).not.toBeInTheDocument()
    await user.click(sheet.getByRole('button', { name: 'Enregistrer' }))
    expect(
      sheet.getByText('Choisissez une plateforme ou un wallet'),
    ).toBeInTheDocument()
    expect(api.accountsControllerCreate).not.toHaveBeenCalled()

    await user.click(sheet.getByRole('radio', { name: /^Wallet/ }))
    await user.click(sheet.getByRole('radio', { name: 'Ledger' }))
    await user.type(sheet.getByLabelText('Actif'), 'ether')
    await user.click(await sheet.findByRole('button', { name: /^ETH/ }))
    await user.type(sheet.getByLabelText('Quantité'), '2,5')
    await user.click(sheet.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(api.accountHoldingsControllerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: NEW_ID },
          body: expect.objectContaining({
            assetId: 'ethereum',
            quantity: '2.5',
          }) as unknown,
        }),
      ),
    )
    expect(api.accountsControllerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { name: 'Ledger', type: 'crypto', institution: 'Ledger' },
      }),
    )
    expect(toast.success).toHaveBeenCalledWith('ETH ajouté')
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['crypto'] }),
    )
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['accounts'] })
  })

  it('reuses the wallet it created when the holding failed', async () => {
    const user = userEvent.setup()
    api.cryptoControllerSummary.mockImplementation(() =>
      ok(summary({ accounts: [], totals: EMPTY_TOTALS })),
    )
    api.accountHoldingsControllerCreate.mockImplementationOnce(() =>
      Promise.resolve({
        error: { message: 'boom' },
        response: new Response(null, { status: 500 }),
      }),
    )
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Ajouter un wallet' }),
    )
    const sheet = within(screen.getByRole('dialog'))
    await user.click(sheet.getByRole('radio', { name: /^Plateforme/ }))
    await user.click(sheet.getByRole('radio', { name: 'Autre…' }))
    await user.type(sheet.getByLabelText('Nom de la plateforme'), 'Bourse test')
    await user.type(sheet.getByLabelText('Actif'), 'ether')
    await user.click(await sheet.findByRole('button', { name: /^ETH/ }))
    await user.type(sheet.getByLabelText('Quantité'), '1')
    await user.click(sheet.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Une erreur est survenue. Réessayez.',
      ),
    )
    await user.click(sheet.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(api.accountsControllerCreate).toHaveBeenCalledTimes(1)
    expect(api.accountHoldingsControllerCreate).toHaveBeenCalledTimes(2)
  })

  it('groups holdings by wallet with totals, prices and the last valuation', async () => {
    renderPage()
    const wallet = await screen.findByRole('region', { name: 'Ledger test' })
    const card = text(wallet.textContent)
    expect(card).toContain('20 000,00 €')
    expect(card).toContain('Ledger · Valorisé le 5 nov. 2026')
    expect(card).toContain('Bitcoin · Coffre test')
    expect(card).toContain('0,5 BTC')
    expect(card).toContain('il y a 5 min')
    expect(
      within(wallet).getByRole('link', { name: 'Ledger test' }),
    ).toHaveAttribute('href', `/accounts/${LEDGER_ID}`)
    const page = text(document.body.textContent)
    expect(page).toContain('Valeur totale20 000,00 €')
    expect(page).toContain('Plus-value+10 000 €')
    expect(page).toContain('Dernier cours il y a 5 min.')
  })

  it('shows stale and missing prices', async () => {
    api.cryptoControllerSummary.mockImplementation(() =>
      ok(
        summary({
          refreshFailed: true,
          accounts: [
            account({
              holdings: [
                holding({ priceStale: true }),
                holding({
                  id: 'h2',
                  assetId: 'inconnu-test',
                  symbol: 'UNK',
                  priceEur: null,
                  priceSource: null,
                  priceFetchedAt: null,
                  valueCents: null,
                  gainCents: null,
                }),
              ],
            }),
          ],
          totals: { ...TOTALS, staleCount: 1, missingPriceCount: 1 },
        }),
      ),
    )
    renderPage()
    expect(await screen.findByText('Cours non actualisés')).toBeInTheDocument()
    expect(screen.getByText('Un avoir sans cours')).toBeInTheDocument()
    expect(screen.getByText('Non à jour')).toBeInTheDocument()
    expect(screen.getByText('Cours inconnu')).toBeInTheDocument()
  })

  it('adds a holding to a picked wallet', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('region', { name: 'Ledger test' })
    await user.click(screen.getByRole('button', { name: 'Ajouter un avoir' }))
    const sheet = within(screen.getByRole('dialog'))
    expect(sheet.getByRole('radio', { name: 'Ledger test' })).toBeChecked()
    await user.type(sheet.getByLabelText('Actif'), 'ether')
    await user.click(await sheet.findByRole('button', { name: /^ETH/ }))
    await user.type(sheet.getByLabelText('Quantité'), '3')
    await user.click(sheet.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(api.accountHoldingsControllerCreate).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: LEDGER_ID } }),
      ),
    )
    expect(api.accountsControllerCreate).not.toHaveBeenCalled()
  })

  it('adds a holding to a wallet from its card, without the picker', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(
      await screen.findByRole('button', {
        name: 'Ajouter un avoir à Ledger test',
      }),
    )
    const sheet = within(screen.getByRole('dialog'))
    expect(sheet.queryByRole('radio', { name: 'Ledger test' })).toBeNull()
    await user.type(sheet.getByLabelText('Actif'), 'ether')
    await user.click(await sheet.findByRole('button', { name: /^ETH/ }))
    await user.type(sheet.getByLabelText('Quantité'), '1')
    await user.click(sheet.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(api.accountHoldingsControllerCreate).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: LEDGER_ID } }),
      ),
    )
  })

  it('edits a holding and sets its price by hand without the price API', async () => {
    const user = userEvent.setup()
    api.cryptoControllerSummary.mockImplementation(() =>
      ok(
        summary({
          priceApiEnabled: false,
          accounts: [account({ priceApiEnabled: false })],
        }),
      ),
    )
    renderPage()
    expect(
      await screen.findByText(/Cours automatiques désactivés/),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Actualiser les cours' }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Modifier BTC · Coffre test' }),
    )
    const sheet = within(screen.getByRole('dialog'))
    expect(sheet.queryByText('Compte')).not.toBeInTheDocument()
    const quantity = sheet.getByLabelText('Quantité')
    await user.clear(quantity)
    await user.type(quantity, '0,75')
    await user.type(sheet.getByLabelText('Cours manuel'), '41000')
    await user.click(sheet.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(api.cryptoControllerSetPrice).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { assetId: 'bitcoin' },
          body: { priceEur: '41000' },
        }),
      ),
    )
    expect(api.accountHoldingsControllerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: LEDGER_ID, holdingId: holding().id },
        body: expect.objectContaining({ quantity: '0.75' }) as unknown,
      }),
    )
  })

  it('refreshes the prices of every wallet at once', async () => {
    const user = userEvent.setup()
    api.cryptoControllerValuate.mockImplementation(() => ok(summary()))
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Actualiser les cours' }),
    )
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Cours actualisés'),
    )
    expect(api.cryptoControllerValuate).toHaveBeenCalledTimes(1)
  })
})
