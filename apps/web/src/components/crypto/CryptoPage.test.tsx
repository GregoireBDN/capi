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
  cryptoControllerSettings: vi.fn(),
  accountsControllerList: vi.fn(),
  accountsControllerCreate: vi.fn(),
  accountHoldingsControllerCreate: vi.fn(),
  accountHoldingsControllerUpdate: vi.fn(),
  accountHoldingsControllerRemove: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)

const navigate = vi.hoisted(() => vi.fn())

vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
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

/** Public test vectors only (BIP32 test vector 1, EIP-55 example). */
const XPUB =
  'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8'
const ADDRESS = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'

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
    origin: 'manual',
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
    sync: null,
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
    cryptoSource: null,
    cryptoProvider: null,
    cryptoSyncedAt: null,
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
    navigate.mockReset()
    toast.success.mockReset()
    toast.error.mockReset()
    api.cryptoControllerSummary.mockImplementation(() => ok(summary()))
    api.accountsControllerList.mockImplementation(() =>
      ok([accountDto(LEDGER_ID, 'Ledger test')]),
    )
    api.accountsControllerCreate.mockImplementation(
      ({ body }: { body: { name: string; cryptoSource?: string } }) =>
        ok(
          {
            ...accountDto(NEW_ID, body.name),
            cryptoSource: body.cryptoSource ?? 'manual',
          },
          201,
        ),
    )
    api.cryptoControllerSettings.mockImplementation(() =>
      ok({ priceApiEnabled: true, walletSyncEnabled: true }),
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

  it('sets up a Ledger from its public keys, without any quantity (#207)', async () => {
    const user = userEvent.setup()
    api.cryptoControllerSummary.mockImplementation(() =>
      ok(summary({ accounts: [], totals: EMPTY_TOTALS })),
    )
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Ajouter un wallet' }),
    )
    const sheet = within(screen.getByRole('dialog'))
    // No account to pick from: straight to where the cryptos are.
    expect(sheet.queryByText('Compte')).not.toBeInTheDocument()
    // Nothing to type about a holding before knowing where it comes from.
    expect(sheet.queryByLabelText('Actif')).not.toBeInTheDocument()
    await user.click(sheet.getByRole('button', { name: 'Enregistrer' }))
    expect(
      sheet.getByText('Choisissez d’où viennent les avoirs'),
    ).toBeInTheDocument()
    expect(api.accountsControllerCreate).not.toHaveBeenCalled()

    await user.click(sheet.getByRole('radio', { name: /^Wallet/ }))
    expect(sheet.getByText('Nouveau wallet')).toBeInTheDocument()
    // Its holdings are read from its keys: no asset, no quantity.
    expect(sheet.queryByLabelText('Actif')).not.toBeInTheDocument()
    expect(sheet.queryByLabelText('Quantité')).not.toBeInTheDocument()
    await user.click(sheet.getByRole('radio', { name: 'Ledger' }))
    await user.click(sheet.getByLabelText('Clé publique'))
    await user.paste(XPUB)
    await user.click(
      sheet.getByRole('button', { name: 'Ajouter une autre clé' }),
    )
    await user.click(sheet.getByLabelText('Clé publique 2'))
    await user.paste(XPUB)
    await user.click(sheet.getByRole('button', { name: 'Ajouter le wallet' }))
    // The same key twice is caught before anything is sent.
    expect(
      sheet.getByText('Cette clé est déjà saisie ci-dessus'),
    ).toBeInTheDocument()
    await user.clear(sheet.getByLabelText('Clé publique 2'))
    await user.click(sheet.getByLabelText('Clé publique 2'))
    await user.paste(ADDRESS)
    await user.click(sheet.getByRole('checkbox', { name: 'Base' }))
    // Sync is on here: nothing to warn about.
    expect(
      sheet.queryByText('Synchronisation des wallets désactivée'),
    ).not.toBeInTheDocument()
    await user.click(sheet.getByRole('button', { name: 'Ajouter le wallet' }))

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/accounts/$accountId',
        params: { accountId: NEW_ID },
      }),
    )
    expect(api.accountsControllerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          name: 'Ledger',
          type: 'crypto',
          institution: 'Ledger',
          cryptoSource: 'wallet',
          walletKeys: [
            { publicKey: XPUB, chains: ['bitcoin'], label: null },
            {
              publicKey: ADDRESS,
              chains: ['ethereum', 'base'],
              label: null,
            },
          ],
        },
      }),
    )
    expect(api.accountHoldingsControllerCreate).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Wallet « Ledger » ajouté')
  })

  it('says before creating a wallet that this server does not sync wallets', async () => {
    const user = userEvent.setup()
    api.cryptoControllerSettings.mockImplementation(() =>
      ok({ priceApiEnabled: true, walletSyncEnabled: false }),
    )
    api.cryptoControllerSummary.mockImplementation(() =>
      ok(summary({ accounts: [], totals: EMPTY_TOTALS })),
    )
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Ajouter un wallet' }),
    )
    const sheet = within(screen.getByRole('dialog'))
    await user.click(sheet.getByRole('radio', { name: /^Wallet/ }))
    expect(
      await sheet.findByText('Synchronisation des wallets désactivée'),
    ).toBeInTheDocument()
    expect(sheet.getByText(/WALLET_SYNC_ENABLED/)).toBeInTheDocument()
  })

  it('sets up an exchange and opens the import of its first export', async () => {
    const user = userEvent.setup()
    api.cryptoControllerSummary.mockImplementation(() =>
      ok(summary({ accounts: [], totals: EMPTY_TOTALS })),
    )
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Ajouter un wallet' }),
    )
    const sheet = within(screen.getByRole('dialog'))
    await user.click(sheet.getByRole('radio', { name: /^Plateforme/ }))
    expect(sheet.queryByLabelText('Quantité')).not.toBeInTheDocument()
    await user.click(sheet.getByRole('radio', { name: 'Binance' }))
    await user.click(
      sheet.getByRole('button', { name: 'Ajouter et importer un export' }),
    )
    expect(
      await screen.findByRole('heading', { name: 'Importer un export' }),
    ).toBeInTheDocument()
    expect(api.accountsControllerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          name: 'Binance',
          type: 'crypto',
          institution: 'Binance',
          cryptoSource: 'exchange',
          cryptoProvider: 'binance',
        },
      }),
    )
    expect(api.accountHoldingsControllerCreate).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('adds a first holding typed by hand, creating its account', async () => {
    const user = userEvent.setup()
    api.cryptoControllerSummary.mockImplementation(() =>
      ok(summary({ accounts: [], totals: EMPTY_TOTALS })),
    )
    const { invalidate } = renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Ajouter un wallet' }),
    )
    const sheet = within(screen.getByRole('dialog'))
    await user.click(sheet.getByRole('radio', { name: /^Saisie manuelle/ }))
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
        body: {
          name: 'Crypto',
          type: 'crypto',
          institution: null,
          cryptoSource: 'manual',
        },
      }),
    )
    expect(toast.success).toHaveBeenCalledWith('ETH ajouté')
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['crypto'] }),
    )
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['accounts'] })
  })

  it('reuses the account it created when the holding failed', async () => {
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
    await user.click(sheet.getByRole('radio', { name: /^Saisie manuelle/ }))
    await user.type(
      sheet.getByLabelText('Plateforme ou wallet (facultatif)'),
      'Bourse test',
    )
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
