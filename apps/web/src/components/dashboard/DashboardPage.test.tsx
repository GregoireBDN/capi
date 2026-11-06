import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  DashboardAccountDto,
  DashboardHistoryDto,
  DashboardOverviewDto,
} from '#/api/types.gen'
import { forecast } from '#/components/forecast/test-fixtures'
import { formatCents } from '#/lib/money'
import { DashboardPage } from './DashboardPage'

const api = vi.hoisted(() => ({
  dashboardControllerOverview: vi.fn(),
  dashboardControllerHistory: vi.fn(),
  forecastControllerForecast: vi.fn(),
}))

vi.mock('#/api', () => api)
vi.mock('@tanstack/react-router', () => ({
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
    return (
      <a
        href={
          search ? `${path}?${new URLSearchParams(search).toString()}` : path
        }
        {...props}
      >
        {children}
      </a>
    )
  },
}))

/** Testing Library collapses the narrow no-break spaces `Intl` emits. */
const euros = (cents: number) => formatCents(cents).replace(/\s/g, ' ')

/** Synthetic data only. */
const checking: DashboardAccountDto = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Compte test',
  type: 'checking',
  institution: 'Banque test',
  group: 'cash',
  balanceCents: 123_456,
  balanceDate: '2026-11-03',
}
const savings: DashboardAccountDto = {
  id: '10000000-0000-4000-8000-000000000002',
  name: 'Livret test',
  type: 'savings',
  institution: null,
  group: 'cash',
  balanceCents: 500_000,
  balanceDate: '2026-10-31',
}
const pea: DashboardAccountDto = {
  id: '10000000-0000-4000-8000-000000000003',
  name: 'PEA test',
  type: 'brokerage',
  institution: null,
  group: 'investments',
  balanceCents: 1_000_000,
  balanceDate: '2026-10-31',
}
const crypto: DashboardAccountDto = {
  id: '10000000-0000-4000-8000-000000000004',
  name: 'Crypto test',
  type: 'crypto',
  institution: null,
  group: 'investments',
  balanceCents: null,
  balanceDate: null,
}

const overview: DashboardOverviewDto = {
  netWorth: {
    totalCents: 1_623_456,
    cashCents: 623_456,
    investmentsCents: 1_000_000,
    previousMonthEndCents: 1_600_000,
    unknownBalanceCount: 1,
  },
  accounts: [checking, savings, pea, crypto],
  current: {
    month: '2026-11',
    incomeCents: 300_000,
    expenseCents: -240_000,
    netCents: 60_000,
    oneOffIncomeCents: 0,
    oneOffExpenseCents: -40_000,
    savingsRate: 0.2,
  },
  previous: {
    month: '2026-10',
    incomeCents: 300_000,
    expenseCents: -200_000,
    netCents: 100_000,
    oneOffIncomeCents: 0,
    oneOffExpenseCents: 0,
    savingsRate: 100_000 / 300_000,
  },
  reviewCount: 3,
}

const history: DashboardHistoryDto = {
  months: [
    {
      month: '2026-09',
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
      netWorthCents: null,
    },
    {
      month: '2026-10',
      incomeCents: 300_000,
      expenseCents: -200_000,
      netCents: 100_000,
      netWorthCents: 1_600_000,
    },
    {
      month: '2026-11',
      incomeCents: 300_000,
      expenseCents: -240_000,
      netCents: 60_000,
      netWorthCents: 1_623_456,
    },
  ],
}

function ok<T>(data: T) {
  return Promise.resolve({ data, response: { ok: true, status: 200 } })
}
function failure() {
  return Promise.resolve({
    error: { message: 'Internal error' },
    response: { ok: false, status: 500 },
  })
}

function renderPage(banner?: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage banner={banner} />
    </QueryClientProvider>,
  )
}

beforeAll(() => {
  // Recharts measures its container; jsdom has no ResizeObserver.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  api.dashboardControllerOverview.mockImplementation(() => ok(overview))
  api.dashboardControllerHistory.mockImplementation(() => ok(history))
  api.forecastControllerForecast.mockImplementation(() => ok(forecast()))
})

describe('DashboardPage', () => {
  it('shows the key figures of the month against the previous one', async () => {
    renderPage()

    const tiles = await screen.findByRole('region', { name: 'Chiffres clés' })
    expect(screen.getByText('Novembre 2026')).toBeInTheDocument()

    const netWorth = within(tiles)
      .getByText('Patrimoine net')
      .closest('[data-slot="stat-card"]') as HTMLElement
    expect(netWorth).toHaveTextContent(euros(1_623_456))
    expect(netWorth).toHaveTextContent(euros(23_456).replace(/^/, '+'))
    expect(
      within(netWorth).getByText(/depuis la fin du mois dernier/),
    ).toBeInTheDocument()

    // Expenses are shown as a positive amount; their rise is unfavourable.
    const expenses = within(tiles)
      .getByText('Dépenses')
      .closest('[data-slot="stat-card"]') as HTMLElement
    expect(expenses).toHaveTextContent(/2\s?400 €/)
    expect(
      expenses.querySelector('[data-slot="stat-card-delta"]'),
    ).toHaveAttribute('data-tone', 'bad')

    const saved = within(tiles)
      .getByText('Épargne')
      .closest('[data-slot="stat-card"]') as HTMLElement
    expect(saved).toHaveTextContent(/600 €/)
    expect(
      saved.querySelector('[data-slot="stat-card-delta"]'),
    ).toHaveAttribute('data-tone', 'bad')

    const rate = within(tiles)
      .getByText('% épargné')
      .closest('[data-slot="stat-card"]') as HTMLElement
    expect(rate).toHaveTextContent('20 %'.replace(/\s/g, ' '))
    expect(rate).toHaveTextContent('-13,3 pts')

    expect(
      within(tiles).getByText(/Dont ponctuel ce mois-ci/),
    ).toHaveTextContent(`dépenses ${euros(40_000)}`)
  })

  it('lists the accounts by group with their balance and date', async () => {
    renderPage()

    const cash = await screen.findByRole('region', { name: 'Liquidités' })
    expect(cash).toHaveTextContent(euros(623_456))
    const link = within(cash).getByRole('link', { name: /Compte test/ })
    expect(link).toHaveAttribute('href', `/transactions?account=${checking.id}`)
    expect(link).toHaveTextContent(euros(123_456))
    expect(link).toHaveTextContent('Compte courant · Banque test')
    expect(link).toHaveTextContent('au 3 nov. 2026')

    const investments = screen.getByRole('region', { name: 'Investissements' })
    expect(investments).toHaveTextContent(euros(1_000_000))
    // Investment accounts open their valuation page.
    expect(
      within(investments).getByRole('link', { name: /PEA test/ }),
    ).toHaveAttribute('href', `/accounts/${pea.id}`)
    expect(investments).toHaveTextContent('PEA / compte-titres')
    expect(investments).toHaveTextContent('Solde inconnu')
  })

  it('points to the review queue and to the import', async () => {
    renderPage()

    expect(await screen.findByText('3 opérations à revoir')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Ouvrir la file de revue/ }),
    ).toHaveAttribute('href', '/review')
    expect(screen.getByRole('link', { name: /Importer/ })).toHaveAttribute(
      'href',
      '/import',
    )
  })

  it('hides the review callout when nothing waits', async () => {
    api.dashboardControllerOverview.mockImplementation(() =>
      ok({ ...overview, reviewCount: 0 }),
    )
    renderPage()

    await screen.findByRole('region', { name: 'Chiffres clés' })
    expect(screen.queryByText(/à revoir/)).not.toBeInTheDocument()
  })

  it('draws the history charts with French month names', async () => {
    renderPage()

    // Each chart has a data-table twin captioned with its summary.
    const cashFlow = await screen.findByRole('table', {
      name: /Revenus, dépenses et épargne nette par mois, de septembre 2026 à novembre 2026/,
      hidden: true,
    })
    const october = within(cashFlow).getByRole('row', {
      name: /octobre 2026/,
      hidden: true,
    })
    // Expenses are drawn as positive amounts next to income.
    expect(october).toHaveTextContent(
      [euros(300_000), euros(200_000), euros(100_000)].join(''),
    )
    // Months before any known balance are left out of the net worth chart.
    const netWorth = screen.getByRole('table', {
      name: /Patrimoine net en fin de mois, de octobre 2026 à novembre 2026/,
      hidden: true,
    })
    expect(within(netWorth).getAllByRole('row', { hidden: true })).toHaveLength(
      3,
    )
    expect(api.dashboardControllerHistory).toHaveBeenCalledWith(
      expect.objectContaining({ query: { months: 12 } }),
    )
  })

  it('sums up the end-of-month forecast', async () => {
    renderPage()
    const card = (await screen.findByText('Fin de mois')).closest(
      '[data-slot="card"]',
    ) as HTMLElement
    expect(card).toHaveTextContent(euros(267_000))
    expect(card).toHaveTextContent(`Point bas ${euros(18_000)} le dim. 29 nov.`)
    expect(
      within(card).getByRole('link', { name: /Voir la prévision/ }),
    ).toHaveAttribute('href', '/forecast')

    api.forecastControllerForecast.mockImplementation(() =>
      ok(
        forecast({
          thresholdCents: 50_000,
          belowThreshold: { date: '2026-11-29', balanceCents: 18_000 },
        }),
      ),
    )
    renderPage()
    expect(
      await screen.findByText(`Sous ${euros(50_000)} le dim. 29 nov.`),
    ).toBeInTheDocument()
  })

  it('shows skeletons while loading', () => {
    api.dashboardControllerOverview.mockImplementation(
      () => new Promise(() => {}),
    )
    renderPage()
    expect(screen.getByLabelText('Chargement')).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })

  it('invites a fresh install to import a statement', async () => {
    api.dashboardControllerOverview.mockImplementation(() =>
      ok({
        ...overview,
        accounts: [],
        netWorth: {
          totalCents: 0,
          cashCents: 0,
          investmentsCents: 0,
          previousMonthEndCents: null,
          unknownBalanceCount: 0,
        },
        reviewCount: 0,
      }),
    )
    renderPage()

    expect(
      await screen.findByText('Aucun compte pour l’instant'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Importer un relevé/ }),
    ).toHaveAttribute('href', '/import')
    expect(
      screen.queryByRole('region', { name: 'Chiffres clés' }),
    ).not.toBeInTheDocument()
  })

  it('keeps the banner and offers a retry when loading fails', async () => {
    api.dashboardControllerOverview.mockImplementationOnce(failure)
    renderPage(<p>Bannière de test</p>)

    expect(
      await screen.findByText('Impossible de charger le tableau de bord.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Bannière de test')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(
      await screen.findByRole('region', { name: 'Chiffres clés' }),
    ).toBeInTheDocument()
  })
})
