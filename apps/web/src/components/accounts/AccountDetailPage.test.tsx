import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AccountDto,
  AccountPerformanceDto,
  SnapshotDto,
  AccountHoldingsDto,
  ValuedHoldingDto,
  WalletKeyDto,
  WalletSyncStatusDto,
} from '#/api/types.gen'
import { AccountDetailPage } from './AccountDetailPage'

const api = vi.hoisted(() => ({
  accountsControllerFindOne: vi.fn(),
  accountSnapshotsControllerPerformance: vi.fn(),
  accountSnapshotsControllerUpsert: vi.fn(),
  accountSnapshotsControllerRemove: vi.fn(),
  accountSnapshotsControllerBulk: vi.fn(),
  accountHoldingsControllerList: vi.fn(),
  walletKeysControllerList: vi.fn(),
  walletKeysControllerAdd: vi.fn(),
  walletKeysControllerRemove: vi.fn(),
  walletTokensControllerList: vi.fn(),
  walletTokensControllerAdd: vi.fn(),
  walletTokensControllerRemove: vi.fn(),
  accountHoldingsControllerSync: vi.fn(),
  cryptoControllerSearch: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)

vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({
    to,
    params,
    search,
    children,
    ...props
  }: {
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
    children: ReactNode
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (url, [key, value]) => url.replace(`$${key}`, value),
      to,
    )
    const query = new URLSearchParams(search).toString()
    return (
      <a href={query ? `${path}?${query}` : path} {...props}>
        {children}
      </a>
    )
  },
}))

/** Testing Library collapses the narrow no-break spaces `Intl` emits. */
const text = (value: string | null) => (value ?? '').replace(/\s/g, ' ')

/** Synthetic data only. */
const ACCOUNT_ID = 'a0000000-0000-4000-8000-000000000001'

function account(overrides: Partial<AccountDto> = {}): AccountDto {
  return {
    id: ACCOUNT_ID,
    name: 'PEA test',
    type: 'brokerage',
    institution: 'Banque test',
    position: 0,
    archivedAt: null,
    balanceCents: 1_250_000,
    balanceDate: '2026-09-30',
    cryptoSource: null,
    cryptoProvider: null,
    cryptoSyncedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function snapshot(
  date: string,
  valueCents: number,
  contributionsCents: number | null,
  note: string | null = null,
): SnapshotDto {
  return { id: `s-${date}`, date, valueCents, contributionsCents, note }
}

const snapshots = [
  snapshot('2025-09-30', 1_000_000, 950_000),
  snapshot('2026-06-30', 1_200_000, 1_000_000),
  snapshot('2026-09-30', 1_250_000, 1_020_000, 'Relevé T3'),
]

function performance(
  overrides: Partial<AccountPerformanceDto> = {},
): AccountPerformanceDto {
  return {
    accountId: ACCOUNT_ID,
    type: 'brokerage',
    valueCents: 1_250_000,
    valueDate: '2026-09-30',
    contributionsCents: 1_020_000,
    contributionsDate: '2026-09-30',
    gainCents: 230_000,
    returnRate: 230_000 / 1_020_000,
    sincePrevious: {
      fromDate: '2026-06-30',
      fromValueCents: 1_200_000,
      changeCents: 50_000,
      changeRate: 50_000 / 1_200_000,
      contributionsChangeCents: 20_000,
    },
    sinceOneYear: {
      fromDate: '2025-09-30',
      fromValueCents: 1_000_000,
      changeCents: 250_000,
      changeRate: 0.25,
      contributionsChangeCents: 70_000,
    },
    daysSinceLatest: 37,
    staleAfterDays: 100,
    stale: false,
    snapshots,
    ...overrides,
  }
}

function ok<T>(data: T, status = 200) {
  return Promise.resolve({ data, response: new Response(null, { status }) })
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <AccountDetailPage accountId={ACCOUNT_ID} />
    </QueryClientProvider>,
  )
}

describe('AccountDetailPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-06T10:00:00Z'))
    for (const fn of Object.values(api)) fn.mockReset()
    api.accountsControllerFindOne.mockImplementation(() => ok(account()))
    api.accountSnapshotsControllerPerformance.mockImplementation(() =>
      ok(performance()),
    )
    api.accountSnapshotsControllerUpsert.mockImplementation(
      ({ path, body }: { path: { date: string }; body: SnapshotDto }) =>
        ok({ ...body, id: 'new', date: path.date }),
    )
    api.accountSnapshotsControllerRemove.mockImplementation(() =>
      ok(undefined, 204),
    )
    api.accountSnapshotsControllerBulk.mockImplementation(() =>
      ok({ created: 2, updated: 1 }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows the value, contributions, gain and changes', async () => {
    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'PEA test' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('PEA / compte-titres · Banque test'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Comptes' })).toHaveAttribute(
      'href',
      '/accounts',
    )
    expect(
      text(screen.getByText(/^Valeur du 30 sept\. 2026/).textContent),
    ).toBe('Valeur du 30 sept. 2026, il y a 37 jours')

    const tiles = screen.getByRole('region', { name: 'Chiffres clés' })
    const content = text(tiles.textContent)
    expect(content).toContain('12 500,00 €')
    expect(content).toContain('depuis le 30 juin 2026')
    expect(content).toContain('Versements10 200 €')
    expect(content).toContain('Plus-value+2 300 €')
    expect(content).toContain('+22,5 %')
    expect(content).toContain('Sur 1 an+2 500 €')
    expect(content).toContain(
      'Sur 1 an : depuis le 30 sept. 2025 (+25 %), dont 700,00 € de versements et +1 800,00 € de plus-value.',
    )
    expect(screen.queryByText(/Versements connus au/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    const list = screen.getByRole('list', { name: 'Valeurs enregistrées' })
    const rows = within(list).getAllByRole('listitem')
    // Newest first.
    expect(text(rows[0].textContent)).toContain('30 sept. 2026')
    expect(text(rows[0].textContent)).toContain('Relevé T3')
    expect(text(rows[0].textContent)).toContain('Versé 10 200,00 €')
    expect(
      screen.getByRole('img', { name: /Valeur et versements nets/ }),
    ).toBeInTheDocument()
  })

  it('warns about an old value and says where the contributions come from', async () => {
    api.accountSnapshotsControllerPerformance.mockImplementation(() =>
      ok(
        performance({
          valueDate: '2026-08-06',
          contributionsDate: '2025-12-31',
          daysSinceLatest: 92,
          staleAfterDays: 35,
          stale: true,
          sinceOneYear: null,
        }),
      ),
    )
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(text(alert.textContent)).toContain(
      'Valeur du 6 août 2026, il y a 92 jours',
    )
    expect(
      text(screen.getByText(/Versements connus au/).textContent),
    ).toContain('Versements connus au 31 déc. 2025')
  })

  it('adds a value, refusing a future date and a bad amount', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Ajouter' }))
    const dialog = await screen.findByRole('dialog')
    const date = within(dialog).getByLabelText('Date')
    expect(date).toHaveValue('2026-11-06')
    // Prefilled with the latest known contributions.
    expect(within(dialog).getByLabelText('Versements nets')).toHaveValue(
      '10200',
    )

    await user.clear(date)
    await user.type(date, '2026-11-07')
    await user.type(within(dialog).getByLabelText('Valeur'), 'beaucoup')
    await user.click(
      within(dialog).getByRole('button', { name: 'Enregistrer' }),
    )
    expect(
      within(dialog).getByText('La date ne peut pas être dans le futur'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText(/Montant invalide/)).toBeInTheDocument()
    expect(api.accountSnapshotsControllerUpsert).not.toHaveBeenCalled()

    await user.clear(date)
    await user.type(date, '2026-10-31')
    const value = within(dialog).getByLabelText('Valeur')
    await user.clear(value)
    await user.type(value, '12 750,50')
    await user.type(within(dialog).getByLabelText('Note'), 'Espace client')
    await user.click(
      within(dialog).getByRole('button', { name: 'Enregistrer' }),
    )

    await waitFor(() =>
      expect(api.accountSnapshotsControllerUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: ACCOUNT_ID, date: '2026-10-31' },
          body: {
            valueCents: 1_275_050,
            contributionsCents: 1_020_000,
            note: 'Espace client',
          },
        }),
      ),
    )
    expect(toast.success).toHaveBeenCalled()
    // Refetched after the change.
    await waitFor(() =>
      expect(api.accountSnapshotsControllerPerformance).toHaveBeenCalledTimes(
        2,
      ),
    )
  })

  it('edits and deletes a value', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()

    await user.click(
      await screen.findByRole('button', {
        name: 'Modifier la valeur du 30 juin 2026',
      }),
    )
    let dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByLabelText('Date')).not.toBeInTheDocument()
    const contributions = within(dialog).getByLabelText('Versements nets')
    expect(contributions).toHaveValue('10000')
    await user.clear(contributions)
    await user.click(
      within(dialog).getByRole('button', { name: 'Enregistrer' }),
    )
    await waitFor(() =>
      expect(api.accountSnapshotsControllerUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: ACCOUNT_ID, date: '2026-06-30' },
          body: { valueCents: 1_200_000, contributionsCents: null, note: null },
        }),
      ),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Modifier la valeur du 30 sept. 2026',
      }),
    )
    dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }))
    const confirm = await screen.findByRole('dialog', {
      name: 'Supprimer la valeur du 30 sept. 2026 ?',
    })
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() =>
      expect(api.accountSnapshotsControllerRemove).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: ACCOUNT_ID, date: '2026-09-30' },
        }),
      ),
    )
  })

  it('previews a pasted history and saves the valid lines', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Coller' }))
    const dialog = await screen.findByRole('dialog')
    const save = within(dialog).getByRole('button', { name: 'Enregistrer' })
    expect(save).toBeDisabled()

    await user.click(within(dialog).getByLabelText('Historique'))
    await user.paste(
      '31/12/2024;9 000,00;8 500\n31/13/2024;1\n31/03/2025;9 500,5\n31/12/2026;1',
    )
    const preview = within(dialog).getByRole('region', { name: 'Aperçu' })
    expect(within(preview).getAllByRole('listitem')).toHaveLength(2)
    expect(text(preview.textContent)).toContain('9 500,50 €')
    const warning = within(dialog).getByRole('alert')
    expect(text(warning.textContent)).toContain('2 lignes ignorées')
    expect(text(warning.textContent)).toContain('Ligne 2 : Date invalide')
    expect(text(warning.textContent)).toContain('Ligne 4 : Date dans le futur')

    await user.click(
      within(dialog).getByRole('button', { name: 'Enregistrer 2 valeurs' }),
    )
    await waitFor(() =>
      expect(api.accountSnapshotsControllerBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: ACCOUNT_ID },
          body: {
            rows: [
              {
                date: '2024-12-31',
                valueCents: 900_000,
                contributionsCents: 850_000,
              },
              {
                date: '2025-03-31',
                valueCents: 950_050,
                contributionsCents: null,
              },
            ],
          },
        }),
      ),
    )
    expect(toast.success).toHaveBeenCalledWith(
      '2 valeurs ajoutées, 1 mise à jour',
    )
  })

  it('shows the balance of a checking account and links to its transactions', async () => {
    api.accountsControllerFindOne.mockImplementation(() =>
      ok(
        account({
          type: 'checking',
          name: 'Courant test',
          balanceCents: 154_321,
        }),
      ),
    )
    api.accountSnapshotsControllerPerformance.mockImplementation(() =>
      ok(
        performance({
          type: 'checking',
          snapshots: [snapshot('2026-09-30', 150_000, null)],
        }),
      ),
    )
    renderPage()

    const balance = await screen.findByRole('region', { name: 'Solde' })
    expect(text(balance.textContent)).toContain('1 543,21 €')
    expect(
      screen.getByRole('link', { name: 'Voir les opérations' }),
    ).toHaveAttribute('href', `/transactions?account=${ACCOUNT_ID}`)
    expect(screen.queryByRole('region', { name: 'Chiffres clés' })).toBeNull()
    expect(screen.queryByText(/Versé/)).toBeNull()
  })

  it('is read-only for an archived account and handles unknown ones', async () => {
    api.accountsControllerFindOne.mockImplementation(() =>
      ok(account({ archivedAt: '2026-10-01T00:00:00.000Z' })),
    )
    renderPage()
    expect(await screen.findByText('Archivé')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: /Modifier la valeur/ }),
    ).toBeNull()
  })

  it('says when the account does not exist', async () => {
    api.accountsControllerFindOne.mockImplementation(() =>
      Promise.resolve({
        error: { message: 'Account not found' },
        response: new Response(null, { status: 404 }),
      }),
    )
    renderPage()
    expect(await screen.findByText('Compte introuvable')).toBeInTheDocument()
  })
  function mockCrypto(
    overrides: Partial<AccountDto>,
    holdings: ValuedHoldingDto[] = [],
    sync: WalletSyncStatusDto | null = null,
  ) {
    api.accountsControllerFindOne.mockImplementation(() =>
      ok(
        account({
          type: 'crypto',
          name: 'Crypto test',
          balanceCents: null,
          cryptoSource: 'manual',
          ...overrides,
        }),
      ),
    )
    api.accountSnapshotsControllerPerformance.mockImplementation(() =>
      ok(
        performance({
          type: 'crypto',
          valueCents: null,
          valueDate: null,
          contributionsCents: null,
          contributionsDate: null,
          gainCents: null,
          returnRate: null,
          sincePrevious: null,
          sinceOneYear: null,
          daysSinceLatest: null,
          stale: false,
          snapshots: [],
        }),
      ),
    )
    api.accountHoldingsControllerList.mockImplementation(() =>
      ok({
        accountId: ACCOUNT_ID,
        holdings,
        totals: {
          valueCents: holdings.reduce((sum, h) => sum + (h.valueCents ?? 0), 0),
          investedCents: null,
          gainCents: null,
          missingPriceCount: 0,
          staleCount: 0,
          withoutInvestedCount: 0,
        },
        complete: true,
        snapshot: null,
        priceApiEnabled: true,
        refreshFailed: false,
        sync,
      }),
    )
  }

  function holding(overrides: Partial<ValuedHoldingDto>): ValuedHoldingDto {
    return {
      id: 'h0000000-0000-4000-8000-000000000001',
      accountId: ACCOUNT_ID,
      assetId: 'bitcoin',
      symbol: 'BTC',
      name: 'Bitcoin',
      quantity: '0.5',
      location: '',
      investedCents: null,
      note: null,
      origin: 'manual',
      priceEur: '60000',
      priceSource: 'provider',
      priceFetchedAt: new Date().toISOString(),
      priceStale: false,
      valueCents: 3_000_000,
      gainCents: null,
      ...overrides,
    }
  }

  /** Public test vectors only (BIP32 test vector 1, EIP-55 example). */
  function walletKey(overrides: Partial<WalletKeyDto>): WalletKeyDto {
    return {
      id: 'k0000000-0000-4000-8000-000000000001',
      accountId: ACCOUNT_ID,
      family: 'bitcoin',
      publicKey:
        'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8',
      chains: ['bitcoin'],
      label: null,
      createdAt: '2026-11-01T10:00:00.000Z',
      ...overrides,
    }
  }

  it('shows the source of an exchange account and keeps imported holdings read-only', async () => {
    mockCrypto(
      {
        cryptoSource: 'exchange',
        cryptoProvider: 'binance',
        institution: 'Binance',
      },
      [
        holding({ id: 'h-import', origin: 'import', location: '' }),
        holding({
          id: 'h-manual',
          symbol: 'ETH',
          name: 'Ethereum',
          location: 'Carte test',
        }),
      ],
    )
    renderPage()

    const source = await screen.findByRole('region', {
      name: 'Source des avoirs',
    })
    expect(
      within(source).getByText('Plateforme d’échange · Binance'),
    ).toBeInTheDocument()
    expect(
      within(source).getByText('Dernier import : jamais'),
    ).toBeInTheDocument()
    // Exports are imported from here (#128).
    expect(
      within(source).getByRole('button', { name: 'Importer un export' }),
    ).toBeEnabled()
    expect(within(source).queryByText(/Bientôt disponible/)).toBeNull()

    const list = await screen.findByRole('list', { name: 'Avoirs' })
    // The imported line is read-only, the line typed by hand opens its editor.
    expect(within(list).getByText('Importé')).toBeInTheDocument()
    expect(within(list).getByText('Saisi à la main')).toBeInTheDocument()
    expect(
      within(list).queryByRole('button', { name: /^Modifier BTC/ }),
    ).not.toBeInTheDocument()
    expect(
      within(list).getByRole('button', { name: 'Modifier ETH · Carte test' }),
    ).toBeInTheDocument()
  })

  it('lists the public keys of a wallet account and adds one', async () => {
    // Radix Checkbox measures itself; jsdom has no ResizeObserver (left
    // undefined elsewhere: the charts fall back without it).
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    const user = userEvent.setup()
    mockCrypto(
      {
        cryptoSource: 'wallet',
        institution: 'Ledger',
        cryptoSyncedAt: '2026-11-05T09:30:00.000Z',
      },
      [holding({ origin: 'sync' })],
      {
        enabled: false,
        syncedAt: '2026-11-05T09:30:00.000Z',
        failedAt: null,
        failedChains: [],
        retryAt: null,
      },
    )
    api.walletTokensControllerList.mockImplementation(() => ok([]))
    api.walletKeysControllerList.mockImplementation(() =>
      ok([
        walletKey({ label: 'Épargne' }),
        walletKey({
          id: 'k-evm',
          family: 'evm',
          publicKey: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
          chains: ['ethereum', 'base'],
        }),
      ]),
    )
    api.walletKeysControllerAdd.mockImplementation(
      ({ body }: { body: { publicKey: string } }) =>
        ok(walletKey({ id: 'k-new', publicKey: body.publicKey }), 201),
    )
    api.walletKeysControllerRemove.mockImplementation(() =>
      Promise.resolve({
        data: undefined,
        response: new Response(null, { status: 204 }),
      }),
    )
    renderPage()

    const source = await screen.findByRole('region', {
      name: 'Source des avoirs',
    })
    expect(within(source).getByText('Wallet · Ledger')).toBeInTheDocument()
    expect(
      text(within(source).getByText(/^Dernière synchronisation/).textContent),
    ).toBe('Dernière synchronisation : 5 novembre 2026 à 10:30')
    // The server does not read chains: synced by hand only.
    expect(
      await within(source).findByRole('button', { name: 'Synchroniser' }),
    ).toBeDisabled()
    expect(
      within(source).getByText(/Synchronisation désactivée sur ce serveur/),
    ).toBeInTheDocument()

    // Keys are shown masked, with their label and chains.
    const keys = await within(source).findByRole('list', {
      name: 'Clés publiques',
    })
    expect(within(keys).getByText('xpub661M…GMcet8')).toBeInTheDocument()
    expect(within(keys).getByText('Épargne · Bitcoin')).toBeInTheDocument()
    expect(within(keys).getByText('0x5aAeb6…1BeAed')).toBeInTheDocument()
    expect(within(keys).getByText('Ethereum, Base')).toBeInTheDocument()
    // The synced line is read-only.
    expect(screen.getByText('Synchronisé')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Modifier BTC/ }),
    ).not.toBeInTheDocument()

    await user.click(
      within(source).getByRole('button', { name: 'Ajouter une clé' }),
    )
    const sheet = await screen.findByRole('dialog', {
      name: 'Ajouter une clé publique',
    })
    await user.click(within(sheet).getByLabelText('Clé publique'))
    await user.paste('0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359')
    await user.click(within(sheet).getByRole('checkbox', { name: 'Polygon' }))
    await user.type(
      within(sheet).getByLabelText('Libellé (facultatif)'),
      'Compte 2',
    )
    await user.click(
      within(sheet).getByRole('button', { name: 'Ajouter la clé' }),
    )
    await waitFor(() =>
      expect(api.walletKeysControllerAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: ACCOUNT_ID },
          body: {
            publicKey: '0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359',
            chains: ['ethereum', 'polygon'],
            label: 'Compte 2',
          },
        }),
      ),
    )

    // Removing a key asks first.
    await user.click(
      within(keys).getByRole('button', {
        name: 'Retirer la clé 0x5aAeb6…1BeAed',
      }),
    )
    await user.click(await screen.findByRole('button', { name: 'Retirer' }))
    await waitFor(() =>
      expect(api.walletKeysControllerRemove).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: ACCOUNT_ID, keyId: 'k-evm' } }),
      ),
    )
  })

  function walletHoldings(
    sync: WalletSyncStatusDto,
    holdings: ValuedHoldingDto[] = [],
  ): AccountHoldingsDto {
    return {
      accountId: ACCOUNT_ID,
      holdings,
      totals: {
        valueCents: 0,
        investedCents: null,
        gainCents: null,
        missingPriceCount: 0,
        staleCount: 0,
        withoutInvestedCount: 0,
      },
      complete: true,
      snapshot: null,
      priceApiEnabled: true,
      refreshFailed: false,
      sync,
    }
  }

  function mockWallet(sync: WalletSyncStatusDto) {
    mockCrypto(
      {
        cryptoSource: 'wallet',
        institution: 'Ledger',
        cryptoSyncedAt: sync.syncedAt,
      },
      [],
      sync,
    )
    api.walletKeysControllerList.mockImplementation(() => ok([walletKey({})]))
    api.walletTokensControllerList.mockImplementation(() => ok([]))
  }

  it('syncs a wallet account and shows the synced holdings', async () => {
    const user = userEvent.setup()
    mockWallet({
      enabled: true,
      syncedAt: null,
      failedAt: null,
      failedChains: [],
      retryAt: null,
    })
    const synced = walletHoldings(
      {
        enabled: true,
        syncedAt: '2026-11-06T09:59:00.000Z',
        failedAt: null,
        failedChains: [],
        retryAt: null,
      },
      [holding({ origin: 'sync', location: 'Bitcoin' })],
    )
    api.accountHoldingsControllerSync.mockImplementation(() => {
      // The API now lists the synced holdings too.
      api.accountHoldingsControllerList.mockImplementation(() => ok(synced))
      return ok(synced)
    })
    renderPage()

    const source = await screen.findByRole('region', {
      name: 'Source des avoirs',
    })
    expect(
      within(source).getByText('Dernière synchronisation : jamais'),
    ).toBeInTheDocument()
    await user.click(
      await within(source).findByRole('button', { name: 'Synchroniser' }),
    )
    await waitFor(() =>
      expect(api.accountHoldingsControllerSync).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: ACCOUNT_ID } }),
      ),
    )
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Wallet synchronisé'),
    )
    expect(
      text(within(source).getByText(/^Dernière synchronisation/).textContent),
    ).toBe('Dernière synchronisation : 6 novembre 2026 à 10:59')
  })

  it('flags stale holdings when the last sync failed', async () => {
    const user = userEvent.setup()
    const stale: WalletSyncStatusDto = {
      enabled: true,
      syncedAt: '2026-11-05T09:30:00.000Z',
      failedAt: '2026-11-06T09:00:00.000Z',
      failedChains: [],
      retryAt: null,
    }
    mockWallet(stale)
    api.accountHoldingsControllerSync.mockImplementation(() =>
      ok(walletHoldings({ ...stale, failedAt: '2026-11-06T09:59:00.000Z' })),
    )
    renderPage()

    const source = await screen.findByRole('region', {
      name: 'Source des avoirs',
    })
    const alert = await within(source).findByText(
      'La dernière synchronisation a échoué',
    )
    expect(text(alert.parentElement!.textContent)).toContain(
      'Tentative du 6 novembre 2026 à 10:00',
    )
    await user.click(
      within(source).getByRole('button', { name: 'Synchroniser' }),
    )
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Synchronisation impossible pour le moment : les derniers avoirs connus sont conservés.',
      ),
    )
  })

  it('names the chains a sync could not read and when it retries', async () => {
    const user = userEvent.setup()
    // Bitcoin rate limited until 11:30 (Paris), Ethereum read at 10:58.
    const partial: WalletSyncStatusDto = {
      enabled: true,
      syncedAt: '2026-11-06T09:58:00.000Z',
      failedAt: '2026-11-06T09:58:00.000Z',
      failedChains: [
        {
          chain: 'bitcoin',
          reason: 'rate_limited',
          retryAt: '2026-11-06T10:30:00.000Z',
        },
      ],
      retryAt: '2026-11-06T10:30:00.000Z',
    }
    mockWallet(partial)
    api.accountHoldingsControllerSync.mockImplementation(() =>
      ok(
        walletHoldings({
          ...partial,
          syncedAt: '2026-11-06T09:59:30.000Z',
          failedAt: '2026-11-06T09:59:30.000Z',
        }),
      ),
    )
    renderPage()

    const source = await screen.findByRole('region', {
      name: 'Source des avoirs',
    })
    expect(
      await within(source).findByText(
        'Certaines chaînes n’ont pas pu être lues',
      ),
    ).toBeInTheDocument()
    const chains = within(source).getByRole('list', {
      name: 'Chaînes non lues',
    })
    expect(text(chains.textContent)).toBe(
      'Bitcoin : trop de requêtes, nouvel essai possible à 11:30',
    )
    expect(
      within(source).getByText(
        'Les avoirs de ces chaînes sont ceux de leur dernière lecture réussie.',
        { exact: false },
      ),
    ).toBeInTheDocument()
    expect(
      within(source).getByText('Prochain essai possible à 11:30'),
    ).toBeInTheDocument()

    await user.click(
      within(source).getByRole('button', { name: 'Synchroniser' }),
    )
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Lecture impossible pour Bitcoin (nouvel essai possible à 11:30) : leurs derniers avoirs connus sont conservés, les autres chaînes sont à jour.',
      ),
    )
  })

  it('adds a token to read and syncs the wallet again', async () => {
    const user = userEvent.setup()
    const sync: WalletSyncStatusDto = {
      enabled: true,
      syncedAt: null,
      failedAt: null,
      failedChains: [],
      retryAt: null,
    }
    mockWallet(sync)
    api.cryptoControllerSearch.mockImplementation(() =>
      ok([{ id: 'usd-coin', symbol: 'USDC', name: 'USDC', rank: 7 }]),
    )
    api.walletTokensControllerAdd.mockImplementation(() =>
      ok(
        {
          id: 't-1',
          accountId: ACCOUNT_ID,
          assetId: 'usd-coin',
          symbol: 'USDC',
          name: 'USDC',
        },
        201,
      ),
    )
    api.accountHoldingsControllerSync.mockImplementation(() =>
      ok(walletHoldings(sync)),
    )
    renderPage()

    const source = await screen.findByRole('region', {
      name: 'Source des avoirs',
    })
    expect(
      await within(source).findByText(
        'Monnaies natives et actifs déjà détenus uniquement.',
      ),
    ).toBeInTheDocument()
    await user.click(
      within(source).getByRole('button', { name: 'Ajouter un jeton' }),
    )
    const sheet = await screen.findByRole('dialog', {
      name: 'Ajouter un jeton',
    })
    await user.type(within(sheet).getByLabelText('Jeton'), 'usdc')
    await user.click(
      await within(sheet).findByRole(
        'button',
        { name: /USDC/ },
        { timeout: 2000 },
      ),
    )
    await waitFor(() =>
      expect(api.walletTokensControllerAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: ACCOUNT_ID },
          body: { assetId: 'usd-coin', symbol: 'USDC', name: 'USDC' },
        }),
      ),
    )
    await waitFor(() =>
      expect(api.accountHoldingsControllerSync).toHaveBeenCalled(),
    )
  })

  it('lists the holdings of a crypto account instead of the empty state', async () => {
    api.accountsControllerFindOne.mockImplementation(() =>
      ok(
        account({
          type: 'crypto',
          name: 'Crypto test',
          balanceCents: null,
          cryptoSource: 'manual',
          institution: 'Ledger',
        }),
      ),
    )
    api.accountSnapshotsControllerPerformance.mockImplementation(() =>
      ok(
        performance({
          type: 'crypto',
          valueCents: null,
          valueDate: null,
          contributionsCents: null,
          contributionsDate: null,
          gainCents: null,
          returnRate: null,
          sincePrevious: null,
          sinceOneYear: null,
          daysSinceLatest: null,
          stale: false,
          snapshots: [],
        }),
      ),
    )
    api.accountHoldingsControllerList.mockImplementation(() =>
      ok({
        accountId: ACCOUNT_ID,
        holdings: [],
        totals: {
          valueCents: 0,
          investedCents: null,
          gainCents: null,
          missingPriceCount: 0,
          staleCount: 0,
          withoutInvestedCount: 0,
        },
        complete: true,
        snapshot: null,
        priceApiEnabled: true,
        refreshFailed: false,
        sync: null,
      }),
    )
    renderPage()

    expect(await screen.findByText('Aucun avoir')).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Avoirs crypto' }),
    ).toBeInTheDocument()
    // Typed by hand: no import or sync action, only the way to read it from
    // a wallet or an exchange instead (#207).
    const source = screen.getByRole('region', { name: 'Source des avoirs' })
    expect(
      within(source).getByText('Saisie manuelle · Ledger'),
    ).toBeInTheDocument()
    expect(
      within(source)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Relier à un wallet ou une plateforme'])
    expect(
      screen.queryByText('Aucune valeur pour ce compte'),
    ).not.toBeInTheDocument()
    // Its value comes from its holdings: no "Ajouter" next to "Ajouter un
    // avoir", only past values can be pasted.
    expect(
      screen.queryByRole('button', { name: 'Ajouter' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Coller un historique de valeurs' }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: 'Ajouter un avoir' }),
    ).not.toHaveLength(0)
  })
})
