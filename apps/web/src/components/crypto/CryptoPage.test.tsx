import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CryptoPortfolioDto,
  PortfolioAccountDto,
  PortfolioAssetDto,
} from '#/api/types.gen'
import { CryptoPage } from './CryptoPage'

const api = vi.hoisted(() => ({
  cryptoControllerPortfolio: vi.fn(),
  cryptoControllerRefreshPortfolio: vi.fn(),
  cryptoControllerSettings: vi.fn(),
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

/** Testing Library collapses the narrow no-break spaces `Intl` emits. */
const text = (value: string | null) => (value ?? '').replace(/\s/g, ' ')

/** Synthetic data only. */
const LEDGER_ID = 'a0000000-0000-4000-8000-000000000011'
const EXCHANGE_ID = 'a0000000-0000-4000-8000-000000000012'
const NOW = new Date('2026-11-19T10:00:00Z')
const PRICED_AT = '2026-11-19T09:57:00Z'

function asset(overrides: Partial<PortfolioAssetDto>): PortfolioAssetDto {
  return {
    assetId: 'bitcoin',
    symbol: 'BTC',
    name: 'Bitcoin',
    quantity: '0.0825',
    priceEur: '82500',
    priceSource: 'provider',
    priceFetchedAt: PRICED_AT,
    priceStale: false,
    change24hPercent: '2.4',
    valueCents: 680_625,
    change24hCents: 15_952,
    investedCents: 412_000,
    gainCents: 268_625,
    unknownQuantity: '0',
    priceable: true,
    places: [
      {
        accountId: LEDGER_ID,
        name: 'Ledger test',
        quantity: '0.06',
        valueCents: 495_000,
      },
      {
        accountId: EXCHANGE_ID,
        name: 'Binance test',
        quantity: '0.0225',
        valueCents: 185_625,
      },
    ],
    ...overrides,
  }
}

function account(overrides: Partial<PortfolioAccountDto>): PortfolioAccountDto {
  return {
    accountId: LEDGER_ID,
    name: 'Ledger test',
    institution: 'Ledger',
    source: 'wallet',
    provider: null,
    valueCents: 495_000,
    holdingCount: 2,
    missingPriceCount: 0,
    updatedAt: '2026-11-19T09:54:00Z',
    sync: {
      enabled: true,
      syncedAt: '2026-11-19T09:54:00Z',
      failedAt: null,
      failedChains: [],
      retryAt: null,
      syncing: false,
    },
    ...overrides,
  }
}

function portfolio(
  overrides: Partial<CryptoPortfolioDto> = {},
): CryptoPortfolioDto {
  return {
    assets: [
      asset({}),
      asset({
        assetId: 'ethereum',
        symbol: 'ETH',
        name: 'Ethereum',
        quantity: '0.3',
        priceEur: '2950',
        change24hPercent: '-1.8',
        valueCents: 88_500,
        change24hCents: -1_622,
        investedCents: null,
        gainCents: null,
        places: [
          {
            accountId: EXCHANGE_ID,
            name: 'Binance test',
            quantity: '0.3',
            valueCents: 88_500,
          },
        ],
      }),
      asset({
        assetId: 'erc20.42161.0x0000000000000000000000000000000000000001',
        symbol: 'DEMO',
        name: 'Demo Token',
        quantity: '15000',
        priceEur: null,
        priceSource: null,
        priceFetchedAt: null,
        change24hPercent: null,
        valueCents: null,
        change24hCents: null,
        investedCents: null,
        gainCents: null,
        priceable: false,
        places: [
          {
            accountId: LEDGER_ID,
            name: 'Ledger test',
            quantity: '15000',
            valueCents: null,
          },
        ],
      }),
    ],
    totals: {
      valueCents: 769_125,
      change24hCents: 14_330,
      investedCents: 412_000,
      gainCents: 268_625,
      withoutInvestedCount: 1,
      withoutInvestedSymbols: ['ETH'],
      unknown: [{ assetId: 'ethereum', symbol: 'ETH', quantity: '0.3' }],
      fiatCents: 100_000,
      realised: {
        yearCents: 200_000,
        totalCents: 250_000,
        count: 2,
        unknownCount: 0,
      },
      missingPriceCount: 0,
      staleCount: 0,
    },
    accounts: [
      account({}),
      account({
        accountId: EXCHANGE_ID,
        name: 'Binance test',
        institution: 'Binance',
        source: 'exchange',
        provider: 'binance',
        valueCents: 274_125,
        updatedAt: '2026-09-02T10:00:00Z',
        sync: null,
      }),
    ],
    priceApiEnabled: true,
    walletSyncEnabled: true,
    refreshFailed: false,
    refreshDue: false,
    pricesAt: PRICED_AT,
    valued: false,
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
      <CryptoPage />
    </QueryClientProvider>,
  )
}

describe('CryptoPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    for (const fn of Object.values(api)) fn.mockReset()
    toast.success.mockReset()
    toast.error.mockReset()
    api.cryptoControllerPortfolio.mockImplementation(() => ok(portfolio()))
    api.cryptoControllerSettings.mockImplementation(() =>
      ok({ priceApiEnabled: true, walletSyncEnabled: true }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('offers to add cryptos when nothing is followed yet', async () => {
    api.cryptoControllerPortfolio.mockImplementation(() =>
      ok(
        portfolio({
          assets: [],
          accounts: [],
          totals: { ...portfolio().totals, valueCents: 0 },
        }),
      ),
    )
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('Aucune crypto suivie')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Actualiser' }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Ajouter des cryptos' }),
    )
    // The add flow opens on where the cryptos come from.
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('D’où viennent ces cryptos ?')).toBeInTheDocument()
  })

  it('shows the total, its change, the cost and the split by asset', async () => {
    renderPage()
    const summary = await screen.findByRole('region', {
      name: 'Valeur de vos cryptos',
    })
    expect(text(summary.textContent)).toContain('7 691,25 €')
    expect(text(summary.textContent)).toContain('+143,30 € sur 24 h')
    // Like an account (#373, the owner's « A. Comme un compte »): what the
    // coins cost (the euros waiting left out), the result and what sales
    // realised; ETH's cost is unknown, named apart.
    expect(text(summary.textContent)).toContain('Investi3 120 €')
    expect(text(summary.textContent)).toContain('Résultat+2 686 €+86,1 %')
    expect(text(summary.textContent)).toContain('Réalisé+2 000 €en 2026')
    expect(text(summary.textContent)).toContain(
      'Hors 0,3 ETH sans coût connu : à préciser sur la page du compte.',
    )
    // The euros waiting are a part of the split, not a line of their own.
    expect(
      within(summary).getByRole('img', { name: /Euros 12 %$/ }),
    ).toBeInTheDocument()
    expect(text(summary.textContent)).not.toContain('Dont 1 000')
    expect(text(summary.textContent)).toContain('Cours il y a 3 min')
    expect(
      within(summary).getByRole('img', { name: /^Répartition : BTC 78 %/ }),
    ).toBeInTheDocument()
  })

  it('lists each asset once across accounts, the unpriced token last', async () => {
    const user = userEvent.setup()
    renderPage()
    const assets = await screen.findByRole('list', { name: 'Actifs' })
    const rows = within(assets).getAllByRole('button')
    expect(rows.map((row) => text(row.getAttribute('aria-label')))).toEqual([
      'Bitcoin, 6 806,25 €, 0,0825 BTC · 2 comptes, +2,4 % sur 24 h',
      'Ethereum, 885,00 €, 0,3 ETH · Binance test, -1,8 % sur 24 h',
    ])
    const unpriced = screen.getByRole('list', { name: 'Actifs sans cours' })
    expect(text(unpriced.textContent)).toContain('Demo Token')

    // Where BTC is, each place opening its account.
    await user.click(rows[0])
    const places = screen.getByRole('list', { name: 'Où est BTC' })
    const links = within(places).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `/accounts/${LEDGER_ID}`,
      `/accounts/${EXCHANGE_ID}`,
    ])
    // Each place with its share of the asset.
    expect(text(links[0].textContent)).toBe(
      'Ledger test4 950,00 €0,06 BTC73 % de vos BTC',
    )
    const btc = rows[0].closest('li')!
    expect(text(btc.textContent)).toContain('Investi4 120,00 €')
    expect(text(btc.textContent)).toContain('Résultat+2 686,25 €')
    expect(text(btc.textContent)).toContain('Cours82 500,00 €il y a 3 min')

    await user.click(rows[1])
    expect(
      screen.getByText('Coût inconnu : à préciser sur la page du compte.'),
    ).toBeInTheDocument()
  })

  it('lists the accounts with their freshness, linking to their page', async () => {
    renderPage()
    const card = await screen.findByRole('region', {
      name: 'Où sont mes cryptos',
    })
    const links = within(card).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `/accounts/${LEDGER_ID}`,
      `/accounts/${EXCHANGE_ID}`,
    ])
    expect(text(links[0].textContent)).toContain('Wallet · lu il y a 6 min')
    // An export older than a month asks for a newer one.
    expect(text(links[1].textContent)).toContain(
      'Plateforme · export importé le 2 sept.',
    )
    expect(text(links[1].textContent)).toContain('à mettre à jour')
    expect(
      within(card).getByRole('button', {
        name: 'Ajouter une plateforme ou un wallet',
      }),
    ).toBeInTheDocument()
  })

  it('says what went wrong without an alert block', async () => {
    api.cryptoControllerPortfolio.mockImplementation(() =>
      ok(
        portfolio({
          refreshFailed: true,
          totals: { ...portfolio().totals, missingPriceCount: 2 },
          accounts: [
            account({
              sync: {
                enabled: true,
                syncedAt: '2026-11-19T09:54:00Z',
                failedAt: '2026-11-19T09:58:00Z',
                failedChains: [],
                retryAt: null,
                syncing: false,
              },
            }),
          ],
        }),
      ),
    )
    renderPage()
    expect(
      await screen.findByText(
        'Ledger test non lu : soldes de la lecture précédente.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Cours non actualisés : les derniers connus sont utilisés.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        '2 actifs sans cours connu : ils ne comptent pas dans le total.',
      ),
    ).toBeInTheDocument()
  })

  it('refreshes the whole section at once', async () => {
    const user = userEvent.setup()
    api.cryptoControllerRefreshPortfolio.mockImplementation(() =>
      ok(portfolio({ valued: true })),
    )
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Actualiser' }))
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Cryptos actualisées'),
    )
    expect(api.cryptoControllerRefreshPortfolio).toHaveBeenCalledTimes(1)
  })

  it('offers no refresh when the server reads neither prices nor wallets', async () => {
    api.cryptoControllerPortfolio.mockImplementation(() =>
      ok(portfolio({ priceApiEnabled: false, walletSyncEnabled: false })),
    )
    renderPage()
    expect(
      await screen.findByText('Cours saisis à la main'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Actualiser' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Ajouter des cryptos' }),
    ).toBeInTheDocument()
  })

  describe('loading (#381)', () => {
    function deferred<T>() {
      let resolve!: (value: T) => void
      let reject!: (error: unknown) => void
      const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve, reject }
    }

    /** Stored values whose prices are past the cache TTL. */
    const stored = () =>
      portfolio({
        refreshDue: true,
        pricesAt: '2026-11-19T08:00:00Z',
        totals: { ...portfolio().totals, staleCount: 2 },
        assets: portfolio().assets.map((a) =>
          a.priceEur === null ? a : { ...a, priceStale: true },
        ),
      })

    it('shows one skeleton per card, titled, and the header at once', () => {
      api.cryptoControllerPortfolio.mockImplementation(
        () => new Promise(() => {}),
      )
      renderPage()
      const loading = screen.getByRole('status', {
        name: 'Chargement de vos cryptos',
      })
      expect(within(loading).getByText('Valeur de vos cryptos')).toBeVisible()
      expect(within(loading).getByText('Actifs')).toBeVisible()
      expect(within(loading).getByText('Où sont mes cryptos')).toBeVisible()
      expect(screen.getByRole('heading', { name: 'Crypto' })).toBeVisible()
      expect(
        screen.getByRole('button', { name: 'Ajouter des cryptos' }),
      ).toBeVisible()
    })

    it('shows the stored values, then the live ones in place', async () => {
      api.cryptoControllerPortfolio.mockImplementation(() => ok(stored()))
      const live = deferred<unknown>()
      api.cryptoControllerRefreshPortfolio.mockImplementation(
        () => live.promise,
      )
      renderPage()
      const summary = await screen.findByRole('region', {
        name: 'Valeur de vos cryptos',
      })
      expect(text(summary.textContent)).toContain('7 691,25 €')
      // The live step is fired once, in auto mode, and said in place.
      await waitFor(() =>
        expect(api.cryptoControllerRefreshPortfolio).toHaveBeenCalledTimes(1),
      )
      expect(api.cryptoControllerRefreshPortfolio.mock.calls[0][0]).toEqual(
        expect.objectContaining({ query: { mode: 'auto' } }),
      )
      expect(text(summary.textContent)).toContain('Actualisation des cours…')
      // Stale prices are not news while they are being asked.
      expect(summary.textContent).not.toContain('Cours non actualisés')
      expect(screen.queryByText('Non à jour')).not.toBeInTheDocument()
      expect(screen.queryByRole('status', { name: /Chargement/ })).toBeNull()

      live.resolve({
        data: portfolio({
          totals: { ...portfolio().totals, valueCents: 800_000 },
        }),
        response: new Response(null, { status: 200 }),
      })
      await waitFor(() =>
        expect(text(summary.textContent)).toContain('8 000,00 €'),
      )
      // The same card, its freshness line back in place of the spinner.
      expect(
        screen.getByRole('region', { name: 'Valeur de vos cryptos' }),
      ).toBe(summary)
      expect(text(summary.textContent)).toContain('Cours il y a 3 min')
      expect(summary.textContent).not.toContain('Actualisation des cours…')
      expect(toast.success).not.toHaveBeenCalled()
    })

    it('asks nothing live when nothing is due', async () => {
      renderPage()
      await screen.findByRole('region', { name: 'Valeur de vos cryptos' })
      expect(api.cryptoControllerRefreshPortfolio).not.toHaveBeenCalled()
    })

    it('keeps the stored values, flagged stale, when the live step fails', async () => {
      api.cryptoControllerPortfolio.mockImplementation(() => ok(stored()))
      api.cryptoControllerRefreshPortfolio.mockImplementation(() =>
        Promise.resolve({
          error: { message: 'down' },
          response: new Response(null, { status: 503 }),
        }),
      )
      renderPage()
      const summary = await screen.findByRole('region', {
        name: 'Valeur de vos cryptos',
      })
      await waitFor(() =>
        expect(text(summary.textContent)).toContain(
          'Cours non actualisés : les derniers connus sont utilisés.',
        ),
      )
      expect(text(summary.textContent)).toContain('7 691,25 €')
      expect(
        screen.queryByText('Impossible de charger vos cryptos.'),
      ).toBeNull()
      expect(toast.error).not.toHaveBeenCalled()
    })

    it('shows a wallet being read while its sync goes on', async () => {
      api.cryptoControllerPortfolio.mockImplementation(() =>
        ok(
          portfolio({
            accounts: [
              account({
                sync: {
                  enabled: true,
                  syncedAt: '2026-11-19T09:54:00Z',
                  failedAt: null,
                  failedChains: [],
                  retryAt: null,
                  syncing: true,
                },
              }),
            ],
          }),
        ),
      )
      renderPage()
      const summary = await screen.findByRole('region', {
        name: 'Valeur de vos cryptos',
      })
      expect(text(summary.textContent)).toContain('Lecture des wallets…')
      const accounts = screen.getByRole('list', { name: 'Comptes crypto' })
      expect(text(accounts.textContent)).toContain('Wallet · lecture en cours…')
    })
  })
})
