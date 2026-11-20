import { accountKeys } from '#/components/accounts/queries'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountHoldingsDto, ValuedHoldingDto } from '#/api/types.gen'
import { HoldingsPanel, rowAmount, rowGain } from './HoldingsPanel'

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
    priceChange24hPercent: null,
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
      unknown: [],
      fiatCents: 0,
    },
    complete: true,
    snapshot: null,
    priceApiEnabled: true,
    refreshFailed: false,
    refreshDue: false,
    sync: null,
    costs: [],
    realised: { yearCents: 0, totalCents: 0, count: 0, unknownCount: 0 },
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

  it('shows each line on two rows, the price age once for the list', async () => {
    renderPanel()
    const list = await screen.findByRole('list', { name: 'Avoirs' })
    const row = text(within(list).getAllByRole('listitem')[0].textContent)
    // Where it is held and its value, then the quantity and the gain; from
    // 1 000 € without cents, so the name keeps its room on a phone.
    expect(row).toBe('BTCPortefeuille test12 958 €1 234,12345679 BTC+11 958 €')
    // Price, age and amount invested left the row (#323): the age is said
    // once, the price and the invested amount are in the editor.
    expect(
      screen.getByText('Cours mis à jour automatiquement · il y a 3 min'),
    ).toBeInTheDocument()

    // The totals are the account summary's (#360), not the panel's.
    const section = text(
      screen.getByRole('region', { name: 'Avoirs crypto' }).textContent,
    )
    expect(section).not.toContain('Valeur des avoirs')
    expect(section).not.toContain('Plus-value')
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
            unknown: [],
            fiatCents: 0,
          },
        }),
      ),
    )
    renderPanel()
    expect(await screen.findByText('Cours non actualisés')).toBeInTheDocument()
    expect(screen.getByText('Un avoir sans cours')).toBeInTheDocument()
    expect(screen.getByText('non à jour')).toBeInTheDocument()
    expect(screen.getByText('cours inconnu')).toBeInTheDocument()
  })

  it('refreshes the live value of the summary and the curve after a load (#366)', async () => {
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
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: accountKeys.performance(ACCOUNT_ID),
      }),
    )
    // Nothing stored: the balances and the net worth stay as they are.
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['accounts'] })
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
    // 1. Actif: picking a result moves on.
    expect(screen.getByRole('button', { name: '1. Actif' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled()
    await user.type(screen.getByLabelText('Rechercher un actif'), 'ether')
    await user.click(
      await screen.findByRole('button', { name: /ETH\s*Ethereum\s*n° 2/ }),
    )
    expect(api.cryptoControllerSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: { q: 'ether' } }),
    )
    // 2. Quantité and invested amount, typed on a decimal pad.
    expect(screen.getByRole('button', { name: '2. Quantité' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.queryByLabelText('Sous-compte')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Quantité')).toHaveAttribute(
      'inputmode',
      'decimal',
    )
    expect(screen.getByLabelText('Montant investi')).toHaveAttribute(
      'inputmode',
      'decimal',
    )
    await user.type(screen.getByLabelText('Quantité'), '1 234,500')
    await user.type(screen.getByLabelText('Montant investi'), '2 000,50')
    await user.click(screen.getByRole('button', { name: 'Suivant' }))
    // 3. Détails, then save.
    expect(screen.getByRole('button', { name: '3. Détails' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    await user.type(screen.getByLabelText('Sous-compte'), ' Spot ')
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
    await user.type(screen.getByLabelText('Rechercher un actif'), 'ether')
    await user.click(await screen.findByRole('button', { name: /^ETH/ }))
    // No quantity: « Suivant » stays on the step and says why.
    await user.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(screen.getByText('Indiquez la quantité')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Quantité'), '1,2,3')
    await user.type(screen.getByLabelText('Montant investi'), '-5')
    await user.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(screen.getByText(/^Quantité invalide/)).toBeInTheDocument()
    expect(screen.getByText(/^Montant invalide/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2. Quantité' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    // « Retour » keeps the asset, offered again above the search.
    await user.click(screen.getByRole('button', { name: 'Retour' }))
    await user.click(
      screen.getByRole('button', { name: 'Garder ETH · Ethereum' }),
    )
    expect(screen.getByLabelText('Quantité')).toHaveValue('1,2,3')
    expect(api.accountHoldingsControllerCreate).not.toHaveBeenCalled()
  })

  it('sets a manual price when the price API is disabled', async () => {
    const user = userEvent.setup()
    api.accountHoldingsControllerList.mockImplementation(() =>
      ok(holdings({ priceApiEnabled: false })),
    )
    renderPanel()
    expect(
      await screen.findByText('Cours saisis à la main · il y a 3 min'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Actualiser les cours' }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Modifier BTC · Portefeuille test' }),
    )
    // A line being edited keeps its asset and opens at its quantity.
    expect(screen.getByRole('button', { name: '1. Quantité' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByLabelText('Quantité')).toHaveValue('1234,123456789')
    // The row shows no price: the editor does.
    expect(screen.getByText(/^Cours 10,50\s€ · il y a 3 min$/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(screen.getByLabelText('Sous-compte')).toHaveValue(
      'Portefeuille test',
    )
    expect(
      screen.getByRole('button', { name: 'Supprimer la ligne' }),
    ).toBeVisible()
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
    await user.type(screen.getByLabelText('Rechercher un actif'), 'ether')
    await user.click(await screen.findByRole('button', { name: /^ETH/ }))
    await user.type(screen.getByLabelText('Quantité'), '1')
    await user.click(screen.getByRole('button', { name: 'Suivant' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Cet actif est déjà enregistré à cet emplacement : modifiez-le plutôt.',
      ),
    )
  })

  it('removes a line typed by hand from the first step of its editor', async () => {
    const user = userEvent.setup()
    api.accountHoldingsControllerRemove.mockImplementation(() =>
      ok(undefined, 204),
    )
    renderPanel()
    await user.click(
      await screen.findByRole('button', {
        name: 'Modifier BTC · Portefeuille test',
      }),
    )
    expect(screen.getByRole('button', { name: '1. Quantité' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    await user.click(screen.getByRole('button', { name: 'Supprimer la ligne' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Supprimer BTC (Portefeuille test) ?',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() =>
      expect(api.accountHoldingsControllerRemove).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: ACCOUNT_ID, holdingId: holding().id },
        }),
      ),
    )
    expect(toast.success).toHaveBeenCalledWith('BTC supprimé')
  })
})

describe('row amounts', () => {
  it('keep their cents under 1 000 €, drop them from there', () => {
    expect(text(rowAmount(99_999))).toBe('999,99 €')
    expect(text(rowAmount(287_100))).toBe('2 871 €')
    expect(text(rowGain(47_100))).toBe('+471,00 €')
    expect(text(rowGain(-120_050))).toBe('-1 201 €')
  })

  describe('loading (#381)', () => {
    it('shows the card as a titled skeleton on first load', () => {
      api.accountHoldingsControllerList.mockImplementation(
        () => new Promise(() => {}),
      )
      renderPanel()
      const loading = screen.getByRole('status', {
        name: 'Chargement des avoirs',
      })
      expect(within(loading).getByText('Avoirs')).toBeVisible()
    })

    it('shows the stored lines, then the live prices in place, without an alert flash', async () => {
      const stale = holdings({
        refreshDue: true,
        holdings: [holding({ priceStale: true })],
        totals: { ...holdings().totals, staleCount: 1 },
      })
      api.accountHoldingsControllerList.mockImplementation(() => ok(stale))
      let answer!: (value: unknown) => void
      api.accountHoldingsControllerValuate.mockImplementation(
        () =>
          new Promise((resolve) => {
            answer = resolve
          }),
      )
      renderPanel()
      const list = await screen.findByRole('list', { name: 'Avoirs' })
      await waitFor(() =>
        expect(api.accountHoldingsControllerValuate).toHaveBeenCalledWith(
          expect.objectContaining({ query: { mode: 'auto' } }),
        ),
      )
      expect(screen.getByText(/actualisation…/)).toBeVisible()
      expect(screen.queryByText('Cours non actualisés')).toBeNull()
      expect(within(list).queryByText('non à jour')).toBeNull()

      answer({
        data: holdings({
          holdings: [holding({ valueCents: 1_400_000, gainCents: 1_300_000 })],
        }),
        response: new Response(null, { status: 200 }),
      })
      await waitFor(() => expect(text(list.textContent)).toContain('14 000 €'))
      expect(screen.queryByText(/actualisation…/)).toBeNull()
      expect(screen.queryByText('Cours non actualisés')).toBeNull()
      // Silent: no « Cours actualisés » toast for the live step.
      expect(toast.success).not.toHaveBeenCalledWith('Cours actualisés')
    })
  })
})
