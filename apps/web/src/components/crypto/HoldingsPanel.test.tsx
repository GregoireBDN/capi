import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountHoldingsDto, ValuedHoldingDto } from '#/api/types.gen'
import { HoldingsPanel } from './HoldingsPanel'

const api = vi.hoisted(() => ({
  accountHoldingsControllerList: vi.fn(),
  accountHoldingsControllerCreate: vi.fn(),
  accountHoldingsControllerUpdate: vi.fn(),
  accountHoldingsControllerRemove: vi.fn(),
  accountHoldingsControllerValuate: vi.fn(),
  cryptoControllerSearch: vi.fn(),
  cryptoControllerSetPrice: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)

vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast }))

/** Testing Library collapses the narrow no-break spaces `Intl` emits. */
const text = (value: string | null) => (value ?? '').replace(/\s/g, ' ')

/** Synthetic data only. */
const ACCOUNT_ID = 'a0000000-0000-4000-8000-000000000002'
const NOW = new Date('2026-11-06T10:00:00Z')

function holding(overrides: Partial<ValuedHoldingDto> = {}): ValuedHoldingDto {
  return {
    id: 'h0000000-0000-4000-8000-000000000001',
    accountId: ACCOUNT_ID,
    assetId: 'bitcoin',
    symbol: 'BTC',
    name: 'Bitcoin',
    quantity: '1234.123456789',
    location: 'Portefeuille test',
    investedCents: 100_000,
    note: null,
    origin: 'manual',
    priceEur: '10.5',
    priceSource: 'provider',
    priceFetchedAt: '2026-11-06T09:57:00Z',
    priceStale: false,
    valueCents: 1_295_830,
    gainCents: 1_195_830,
    ...overrides,
  }
}

function holdings(
  overrides: Partial<AccountHoldingsDto> = {},
): AccountHoldingsDto {
  return {
    accountId: ACCOUNT_ID,
    holdings: [holding()],
    totals: {
      valueCents: 1_295_830,
      investedCents: 100_000,
      gainCents: 1_195_830,
      missingPriceCount: 0,
      staleCount: 0,
      withoutInvestedCount: 0,
    },
    complete: true,
    snapshot: null,
    priceApiEnabled: true,
    refreshFailed: false,
    sync: null,
    ...overrides,
  }
}

function ok<T>(data: T, status = 200) {
  return Promise.resolve({ data, response: new Response(null, { status }) })
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <HoldingsPanel accountId={ACCOUNT_ID} writable />
    </QueryClientProvider>,
  )
  return { invalidate }
}

describe('HoldingsPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    for (const fn of Object.values(api)) fn.mockReset()
    toast.success.mockReset()
    toast.error.mockReset()
    api.accountHoldingsControllerList.mockImplementation(() => ok(holdings()))
    api.accountHoldingsControllerCreate.mockImplementation(
      ({ body }: { body: ValuedHoldingDto }) =>
        ok({ ...body, id: 'new', accountId: ACCOUNT_ID }, 201),
    )
    api.accountHoldingsControllerUpdate.mockImplementation(
      ({ body }: { body: ValuedHoldingDto }) => ok({ ...holding(), ...body }),
    )
    api.cryptoControllerSearch.mockImplementation(() =>
      ok([
        { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', rank: 2 },
        {
          id: 'ethereum-classic',
          symbol: 'ETC',
          name: 'Ethereum Classic',
          rank: null,
        },
      ]),
    )
    api.cryptoControllerSetPrice.mockImplementation(() =>
      ok({
        assetId: 'x',
        priceEur: '1',
        source: 'manual',
        fetchedAt: NOW.toISOString(),
      }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows quantities, prices with their age, values and totals', async () => {
    renderPanel()
    const list = await screen.findByRole('list', { name: 'Avoirs' })
    const row = text(within(list).getAllByRole('listitem')[0].textContent)
    expect(row).toContain('BTC')
    expect(row).toContain('Bitcoin · Portefeuille test')
    expect(row).toContain('1 234,12345679 BTC')
    expect(row).toContain('10,50 €')
    expect(row).toContain('il y a 3 min')
    expect(row).toContain('12 958,30 €')
    expect(row).toContain('Investi 1 000,00 €')
    expect(row).toContain('+11 958,30 €')
    expect(row).not.toContain('Non à jour')

    const section = text(
      screen.getByRole('region', { name: 'Avoirs crypto' }).textContent,
    )
    expect(section).toContain('Valeur des avoirs12 958,30 €')
    expect(section).toContain('Investi1 000 €')
    expect(section).toContain('Plus-value+11 958 €')
  })

  it('flags stale and missing prices', async () => {
    api.accountHoldingsControllerList.mockImplementation(() =>
      ok(
        holdings({
          holdings: [
            holding({ priceStale: true }),
            holding({
              id: 'h2',
              assetId: 'unknown',
              symbol: 'UNK',
              priceEur: null,
              priceSource: null,
              priceFetchedAt: null,
              valueCents: null,
              gainCents: null,
            }),
          ],
          refreshFailed: true,
          complete: false,
          totals: {
            valueCents: 1_295_830,
            investedCents: 200_000,
            gainCents: null,
            missingPriceCount: 1,
            staleCount: 1,
            withoutInvestedCount: 0,
          },
        }),
      ),
    )
    renderPanel()
    expect(await screen.findByText('Cours non actualisés')).toBeInTheDocument()
    expect(screen.getByText('Un avoir sans cours')).toBeInTheDocument()
    expect(screen.getByText('Non à jour')).toBeInTheDocument()
    expect(screen.getByText('Cours inconnu')).toBeInTheDocument()
  })

  it('refreshes the snapshot readers when a valuation wrote today', async () => {
    api.accountHoldingsControllerList.mockImplementation(() =>
      ok(
        holdings({
          snapshot: {
            date: '2026-11-06',
            valueCents: 1_295_830,
            contributionsCents: 100_000,
          },
        }),
      ),
    )
    const { invalidate } = renderPanel()
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['accounts'] }),
    )
  })

  it('refreshes prices on demand', async () => {
    const user = userEvent.setup()
    api.accountHoldingsControllerValuate.mockImplementation(() =>
      ok(holdings({ refreshFailed: true })),
    )
    renderPanel()
    await user.click(
      await screen.findByRole('button', { name: 'Actualiser les cours' }),
    )
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Cours non actualisés : le service ne répond pas.',
      ),
    )
    expect(api.accountHoldingsControllerValuate).toHaveBeenCalledWith(
      expect.objectContaining({ path: { id: ACCOUNT_ID } }),
    )
  })

  it('adds a holding from the asset search with a French decimal comma', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(
      await screen.findByRole('button', { name: 'Ajouter un avoir' }),
    )
    await user.type(screen.getByLabelText('Actif'), 'ether')
    await user.click(
      await screen.findByRole('button', { name: /ETH\s*Ethereum\s*n° 2/ }),
    )
    expect(api.cryptoControllerSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: { q: 'ether' } }),
    )
    await user.type(screen.getByLabelText('Sous-compte'), ' Spot ')
    await user.type(screen.getByLabelText('Quantité'), '1 234,500')
    await user.type(screen.getByLabelText('Montant investi'), '2 000,50')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(api.accountHoldingsControllerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: ACCOUNT_ID },
          body: {
            assetId: 'ethereum',
            symbol: 'ETH',
            name: 'Ethereum',
            quantity: '1234.5',
            location: 'Spot',
            investedCents: 200_050,
            note: null,
          },
        }),
      ),
    )
    expect(toast.success).toHaveBeenCalledWith('ETH ajouté')
    expect(api.cryptoControllerSetPrice).not.toHaveBeenCalled()
  })

  it('validates the form', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(
      await screen.findByRole('button', { name: 'Ajouter un avoir' }),
    )
    await user.type(screen.getByLabelText('Quantité'), '1,2,3')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.getByText('Choisissez un actif')).toBeInTheDocument()
    expect(screen.getByText(/^Quantité invalide/)).toBeInTheDocument()
    expect(api.accountHoldingsControllerCreate).not.toHaveBeenCalled()
  })

  it('sets a manual price when the price API is disabled', async () => {
    const user = userEvent.setup()
    api.accountHoldingsControllerList.mockImplementation(() =>
      ok(holdings({ priceApiEnabled: false })),
    )
    renderPanel()
    expect(
      await screen.findByText(
        'Cours automatiques désactivés : cours saisis à la main.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Actualiser les cours' }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Modifier BTC · Portefeuille test' }),
    )
    expect(screen.getByLabelText('Quantité')).toHaveValue('1234,123456789')
    await user.type(screen.getByLabelText('Cours manuel'), '0,0012')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(api.cryptoControllerSetPrice).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { assetId: 'bitcoin' },
          body: { priceEur: '0.0012' },
        }),
      ),
    )
    expect(api.accountHoldingsControllerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: ACCOUNT_ID, holdingId: holding().id },
      }),
    )
  })

  it('explains a duplicate holding', async () => {
    const user = userEvent.setup()
    api.accountHoldingsControllerCreate.mockImplementation(() =>
      Promise.resolve({
        error: { message: 'duplicate' },
        response: new Response(null, { status: 409 }),
      }),
    )
    renderPanel()
    await user.click(
      await screen.findByRole('button', { name: 'Ajouter un avoir' }),
    )
    await user.type(screen.getByLabelText('Actif'), 'ether')
    await user.click(await screen.findByRole('button', { name: /^ETH/ }))
    await user.type(screen.getByLabelText('Quantité'), '1')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Cet actif est déjà enregistré à cet emplacement : modifiez-le plutôt.',
      ),
    )
  })
})
