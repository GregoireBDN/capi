import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AccountDto,
  CryptoImportDto,
  PortfolioAccountDto,
  ValuedHoldingDto,
} from '#/api/types.gen'
import { AddCryptoSheet } from './AddCryptoSheet'

const api = vi.hoisted(() => ({
  accountsControllerCreate: vi.fn(),
  accountCryptoImportsControllerPreview: vi.fn(),
  cryptoImportsControllerCommit: vi.fn(),
  cryptoImportsControllerRemove: vi.fn(),
  accountHoldingsControllerCreate: vi.fn(),
  cryptoControllerSearch: vi.fn(),
  cryptoControllerSetPrice: vi.fn(),
  cryptoControllerSettings: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)
const navigate = vi.hoisted(() => vi.fn())

vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

// Radix RadioGroup (radio cards) measures itself; jsdom has no ResizeObserver.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

/** Public test vectors only (BIP32 test vector 1, EIP-55 example). */
const XPUB =
  'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8'
const ADDRESS = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'

/** Synthetic data only. */
const NEW_ID = 'a0000000-0000-4000-8000-000000000021'
const BINANCE_ID = 'a0000000-0000-4000-8000-000000000022'
const MANUAL_ID = 'a0000000-0000-4000-8000-000000000023'
const IMPORT_ID = 'i0000000-0000-4000-8000-000000000021'

function followed(
  overrides: Partial<PortfolioAccountDto>,
): PortfolioAccountDto {
  return {
    accountId: BINANCE_ID,
    name: 'Binance test',
    institution: 'Binance',
    source: 'exchange',
    provider: 'binance',
    valueCents: 100_000,
    holdingCount: 1,
    missingPriceCount: 0,
    updatedAt: null,
    sync: null,
    ...overrides,
  }
}

function accountDto(body: Partial<AccountDto>): AccountDto {
  return {
    id: NEW_ID,
    name: 'Nouveau',
    type: 'crypto',
    institution: null,
    position: 0,
    archivedAt: null,
    balanceCents: null,
    balanceDate: null,
    cryptoSource: 'manual',
    cryptoProvider: null,
    cryptoSyncedAt: null,
    investedBaseCents: null,
    investedBaseOn: null,
    createdAt: '2026-11-19T10:00:00Z',
    updatedAt: '2026-11-19T10:00:00Z',
    ...body,
  }
}

function preview(overrides: Partial<CryptoImportDto> = {}): CryptoImportDto {
  return {
    id: IMPORT_ID,
    accountId: NEW_ID,
    format: 'binance_csv',
    fileName: 'binance-test.csv',
    status: 'pending',
    createdAt: '2026-11-19T10:00:00.000Z',
    committedAt: null,
    periodStart: '2026-01-01T10:00:00.000Z',
    periodEnd: '2026-11-01T10:00:00.000Z',
    counts: { rows: 12, new: 12, duplicates: 0, issues: 0, inserted: 0 },
    issues: [],
    unknownOperations: [],
    unmappedTickers: [],
    holdings: [
      {
        tickers: ['BTC'],
        assetId: 'bitcoin',
        symbol: 'BTC',
        name: 'Bitcoin',
        quantity: '0.0225',
        investedCents: 120_000,
        status: 'ok',
      },
    ],
    rows: [],
    ...overrides,
  }
}

function ok<T>(data: T, status = 200) {
  return Promise.resolve({ data, response: new Response(null, { status }) })
}

function renderFlow({
  accounts = [],
  priceApiEnabled = true,
}: {
  accounts?: PortfolioAccountDto[]
  priceApiEnabled?: boolean
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const onOpenChange = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <AddCryptoSheet
        open
        onOpenChange={onOpenChange}
        accounts={accounts}
        priceApiEnabled={priceApiEnabled}
      />
    </QueryClientProvider>,
  )
  return { onOpenChange, dialog: within(screen.getByRole('dialog')) }
}

const csv = () =>
  new File(['Date;Operation\n'], 'binance-test.csv', { type: 'text/csv' })

describe('AddCryptoSheet', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset()
    navigate.mockReset()
    toast.success.mockReset()
    toast.error.mockReset()
    api.accountsControllerCreate.mockImplementation(
      ({ body }: { body: Partial<AccountDto> }) => ok(accountDto(body), 201),
    )
    api.accountCryptoImportsControllerPreview.mockImplementation(
      ({ path }: { path: { id: string } }) =>
        ok(preview({ accountId: path.id }), 201),
    )
    api.cryptoImportsControllerCommit.mockImplementation(() =>
      ok({
        ...preview(),
        status: 'committed',
        counts: { ...preview().counts, inserted: 12 },
      }),
    )
    api.cryptoImportsControllerRemove.mockImplementation(() =>
      ok(undefined, 204),
    )
    api.cryptoControllerSettings.mockImplementation(() =>
      ok({ priceApiEnabled: true, walletSyncEnabled: true }),
    )
    api.cryptoControllerSearch.mockImplementation(() =>
      ok([{ id: 'ethereum', symbol: 'ETH', name: 'Ethereum', rank: 2 }]),
    )
    api.accountHoldingsControllerCreate.mockImplementation(
      ({
        path,
        body,
      }: {
        path: { id: string }
        body: Partial<ValuedHoldingDto>
      }) => ok({ ...body, id: 'h-new', accountId: path.id }, 201),
    )
    api.cryptoControllerSetPrice.mockImplementation(() =>
      ok({
        assetId: 'ethereum',
        priceEur: '2950',
        source: 'manual',
        fetchedAt: '2026-11-19T10:00:00Z',
      }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts on where the cryptos come from, a tap moving on', async () => {
    const user = userEvent.setup()
    const { dialog } = renderFlow()
    expect(
      dialog.getByRole('heading', { name: /D’où viennent ces cryptos \?/ }),
    ).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: /^1\. / })).toHaveAttribute(
      'aria-current',
      'step',
    )
    // No « Suivant » on a list of choices: the tap is the choice.
    expect(dialog.queryByRole('button', { name: /Suivant/ })).toBeNull()
    await user.click(dialog.getByRole('button', { name: /^Un wallet/ }))
    expect(
      dialog.getByRole('heading', { name: /Quel wallet \?/ }),
    ).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: /^2\. / })).toHaveAttribute(
      'aria-current',
      'step',
    )
    await user.click(dialog.getByRole('button', { name: 'Retour' }))
    expect(
      dialog.getByRole('heading', { name: /D’où viennent ces cryptos \?/ }),
    ).toBeInTheDocument()
  })

  it('sets up a new exchange from its export, then imports it', async () => {
    const user = userEvent.setup()
    const { dialog, onOpenChange } = renderFlow()
    await user.click(dialog.getByRole('button', { name: /^Une plateforme/ }))
    await user.click(dialog.getByRole('button', { name: 'Binance' }))
    expect(
      dialog.getByRole('heading', { name: /L’export de Binance/ }),
    ).toBeInTheDocument()
    expect(api.accountsControllerCreate).not.toHaveBeenCalled()

    await user.upload(dialog.getByLabelText('Fichier CSV'), csv())
    // The account is created with the first export, then previewed.
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
    expect(
      await dialog.findByRole('heading', { name: /Récapitulatif/ }),
    ).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: /^4\. / })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(dialog.getByText('Avoirs après l’import')).toBeInTheDocument()

    await user.click(dialog.getByRole('button', { name: 'Importer 12 lignes' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(api.cryptoImportsControllerCommit).toHaveBeenCalledWith(
      expect.objectContaining({ path: { id: IMPORT_ID } }),
    )
    expect(toast.success).toHaveBeenCalledWith(
      'Export importé : 12 lignes ajoutées',
    )
  })

  it('adds an export to an exchange already followed, creating nothing', async () => {
    const user = userEvent.setup()
    const { dialog } = renderFlow({ accounts: [followed({})] })
    await user.click(dialog.getByRole('button', { name: /^Une plateforme/ }))
    await user.click(dialog.getByRole('button', { name: /^Binance test/ }))
    await user.upload(dialog.getByLabelText('Fichier CSV'), csv())
    await dialog.findByRole('heading', { name: /Récapitulatif/ })
    expect(api.accountsControllerCreate).not.toHaveBeenCalled()
    expect(api.accountCryptoImportsControllerPreview).toHaveBeenCalledWith(
      expect.objectContaining({ path: { id: BINANCE_ID } }),
    )
    // Going back drops the pending import: nothing was written.
    await user.click(dialog.getByRole('button', { name: 'Retour' }))
    expect(api.cryptoImportsControllerRemove).toHaveBeenCalledWith(
      expect.objectContaining({ path: { id: IMPORT_ID } }),
    )
  })

  it('sends another platform to the manual entry', async () => {
    const user = userEvent.setup()
    const { dialog } = renderFlow()
    await user.click(dialog.getByRole('button', { name: /^Une plateforme/ }))
    await user.click(
      dialog.getByRole('button', { name: /^Une autre plateforme/ }),
    )
    expect(
      dialog.getByRole('heading', { name: /Quel actif \?/ }),
    ).toBeInTheDocument()
  })

  it('sets up a wallet from its public keys, then opens its page', async () => {
    const user = userEvent.setup()
    const { dialog } = renderFlow()
    await user.click(dialog.getByRole('button', { name: /^Un wallet/ }))
    await user.click(dialog.getByRole('button', { name: 'Ledger' }))
    expect(
      dialog.getByRole('heading', { name: /Ses clés publiques/ }),
    ).toBeInTheDocument()

    // An empty key is caught before moving on.
    await user.click(dialog.getByRole('button', { name: /Suivant/ }))
    expect(
      dialog.getByRole('heading', { name: /Ses clés publiques/ }),
    ).toBeInTheDocument()

    await user.click(dialog.getByLabelText('Clé publique'))
    await user.paste(XPUB)
    await user.click(
      dialog.getByRole('button', { name: 'Ajouter une autre clé' }),
    )
    await user.click(dialog.getByLabelText('Clé publique 2'))
    await user.paste(ADDRESS)
    await user.click(dialog.getByRole('button', { name: /Suivant/ }))

    await dialog.findByRole('heading', { name: /Récapitulatif/ })
    expect(dialog.getByRole('button', { name: /^4\. / })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(dialog.getByText('1. Clé Bitcoin')).toBeInTheDocument()
    expect(dialog.getByText('2. Adresse EVM · Ethereum')).toBeInTheDocument()
    expect(dialog.getByText('xpub661M…GMcet8')).toBeInTheDocument()
    expect(api.accountsControllerCreate).not.toHaveBeenCalled()

    await user.click(dialog.getByRole('button', { name: 'Ajouter le wallet' }))
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
            {
              publicKey: XPUB,
              chains: ['bitcoin'],
              label: null,
              addressType: 'native_segwit',
            },
            { publicKey: ADDRESS, chains: ['ethereum'], label: null },
          ],
        },
      }),
    )
    expect(toast.success).toHaveBeenCalledWith('Wallet « Ledger » ajouté')
  })

  it('adds a line typed by hand, creating its account', async () => {
    const user = userEvent.setup()
    const { dialog, onOpenChange } = renderFlow({ priceApiEnabled: false })
    await user.click(dialog.getByRole('button', { name: /^Saisie manuelle/ }))
    await user.type(dialog.getByLabelText('Rechercher un actif'), 'eth')
    await user.click(await dialog.findByRole('button', { name: /^ETH/ }))
    expect(
      dialog.getByRole('heading', { name: /Combien \?/ }),
    ).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: /^3\. / })).toHaveAttribute(
      'aria-current',
      'step',
    )

    await user.click(dialog.getByRole('button', { name: /Suivant/ }))
    expect(dialog.getByText('Indiquez la quantité')).toBeInTheDocument()
    await user.type(dialog.getByLabelText('Quantité'), '1,5')
    await user.type(dialog.getByLabelText('Montant investi'), '3 000')
    await user.type(dialog.getByLabelText('Cours manuel'), '2950')
    await user.type(dialog.getByLabelText('Plateforme ou wallet'), 'Kraken')
    await user.click(dialog.getByRole('button', { name: /Suivant/ }))

    await dialog.findByRole('heading', { name: /Récapitulatif/ })
    expect(dialog.getByText('Kraken (nouveau)')).toBeInTheDocument()
    expect(dialog.getByText('3 000,00 €')).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Ajouter' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(api.accountsControllerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          name: 'Kraken',
          type: 'crypto',
          institution: 'Kraken',
          cryptoSource: 'manual',
        },
      }),
    )
    expect(api.accountHoldingsControllerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: NEW_ID },
        body: {
          assetId: 'ethereum',
          symbol: 'ETH',
          name: 'Ethereum',
          quantity: '1.5',
          location: '',
          investedCents: 300_000,
          note: null,
        },
      }),
    )
    expect(api.cryptoControllerSetPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { assetId: 'ethereum' },
        body: { priceEur: '2950' },
      }),
    )
    expect(toast.success).toHaveBeenCalledWith('ETH ajouté à « Kraken »')
  })

  it('adds a line to a manual account already followed', async () => {
    const user = userEvent.setup()
    const { dialog } = renderFlow({
      accounts: [
        followed({}),
        followed({
          accountId: MANUAL_ID,
          name: 'Coffre test',
          source: 'manual',
          provider: null,
        }),
      ],
    })
    await user.click(dialog.getByRole('button', { name: /^Saisie manuelle/ }))
    await user.type(dialog.getByLabelText('Rechercher un actif'), 'eth')
    await user.click(await dialog.findByRole('button', { name: /^ETH/ }))
    // The exchange is fed by its exports: only the manual account is offered.
    expect(dialog.queryByRole('radio', { name: 'Binance test' })).toBeNull()
    expect(dialog.getByRole('radio', { name: 'Coffre test' })).toBeChecked()
    // No price to type: the price API values it.
    expect(dialog.queryByLabelText('Cours manuel')).toBeNull()
    await user.type(dialog.getByLabelText('Quantité'), '0.25')
    await user.click(dialog.getByRole('button', { name: /Suivant/ }))
    await user.click(await dialog.findByRole('button', { name: 'Ajouter' }))

    await waitFor(() =>
      expect(api.accountHoldingsControllerCreate).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: MANUAL_ID } }),
      ),
    )
    expect(api.accountsControllerCreate).not.toHaveBeenCalled()
    expect(api.cryptoControllerSetPrice).not.toHaveBeenCalled()
  })
})
