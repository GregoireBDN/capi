import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type {
  DashboardAccountDto,
  DashboardHistoryDto,
  DashboardOverviewDto,
  MonthReviewDto,
} from '#/api/types.gen'
import { forecast } from '#/components/forecast/test-fixtures'
import { formatCents } from '#/lib/money'
import { DashboardPage } from './DashboardPage'

const api = vi.hoisted(() => ({
  dashboardControllerOverview: vi.fn(),
  dashboardControllerHistory: vi.fn(),
  dashboardControllerReview: vi.fn(),
  forecastControllerForecast: vi.fn(),
  accountSnapshotsControllerUpsert: vi.fn(),
  budgetsControllerEnvelopes: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  }),
)
vi.mock('sonner', () => ({ toast }))

vi.mock('#/api', () => api)
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
const text = (value: string) => value.replace(/\s/g, ' ')

/** Synthetic data only. */
const checking: DashboardAccountDto = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Compte test',
  type: 'checking',
  institution: 'Banque test',
  group: 'cash',
  balanceCents: 123_456,
  balanceDate: '2026-11-03',
  dataUntil: '2026-11-03',
  stale: false,
}
const savings: DashboardAccountDto = {
  id: '10000000-0000-4000-8000-000000000002',
  name: 'Livret test',
  type: 'savings',
  institution: null,
  group: 'cash',
  balanceCents: 500_000,
  balanceDate: '2026-10-31',
  dataUntil: '2026-10-31',
  stale: false,
}
const pea: DashboardAccountDto = {
  id: '10000000-0000-4000-8000-000000000003',
  name: 'PEA test',
  type: 'brokerage',
  institution: null,
  group: 'investments',
  balanceCents: 1_000_000,
  balanceDate: '2026-10-31',
  dataUntil: '2026-10-31',
  stale: false,
}
const crypto: DashboardAccountDto = {
  id: '10000000-0000-4000-8000-000000000004',
  name: 'Crypto test',
  type: 'crypto',
  institution: null,
  group: 'investments',
  balanceCents: null,
  balanceDate: null,
  dataUntil: null,
  stale: false,
}

const overview: DashboardOverviewDto = {
  netWorth: {
    totalCents: 1_623_456,
    cashCents: 623_456,
    investmentsCents: 1_000_000,
    previousMonthEnd: '2026-10-31',
    previousMonthEndCents: 1_600_000,
    unknownBalanceCount: 1,
  },
  accounts: [checking, savings, pea, crypto],
  period: {
    month: '2026-11',
    dataUntil: '2026-11-30',
    status: 'complete',
    throughDay: null,
    previousMonth: '2026-10',
    previousUntil: '2026-10-31',
    defaultMonth: '2026-11',
  },
  current: {
    month: '2026-11',
    until: '2026-11-30',
    incomeCents: 300_000,
    expenseCents: -240_000,
    netCents: 60_000,
    oneOffIncomeCents: 0,
    oneOffExpenseCents: -40_000,
    savingsRate: 0.2,
  },
  previous: {
    month: '2026-10',
    until: '2026-10-31',
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
      accounts: [],
    },
    {
      month: '2026-10',
      incomeCents: 300_000,
      expenseCents: -200_000,
      netCents: 100_000,
      netWorthCents: 1_600_000,
      accounts: [],
    },
    {
      month: '2026-11',
      incomeCents: 300_000,
      expenseCents: -240_000,
      netCents: 60_000,
      netWorthCents: 1_623_456,
      accounts: [],
    },
  ],
}

const review: MonthReviewDto = {
  month: '2026-10',
  nextMonth: '2026-11',
  period: {
    month: '2026-10',
    dataUntil: '2026-11-03',
    status: 'complete',
    throughDay: null,
    previousMonth: '2026-09',
    previousUntil: '2026-09-30',
    defaultMonth: '2026-11',
  },
  closed: true,
  netWorth: {
    date: '2026-10-31',
    endCents: 4_823_000,
    previousDate: '2026-09-30',
    previousEndCents: 4_711_000,
    changeCents: 112_000,
    savedCents: 65_500,
    otherCents: 46_500,
  },
  flow: {
    month: '2026-10',
    until: '2026-10-31',
    incomeCents: 250_000,
    expenseCents: -184_500,
    netCents: 65_500,
    oneOffIncomeCents: 0,
    oneOffExpenseCents: 0,
    savingsRate: 0.262,
  },
  budget: {
    budgetCount: 4,
    targetCents: 200_000,
    spentCents: 184_500,
    remainingCents: 15_500,
    unbudgetedCents: 0,
    over: [
      {
        categoryId: 'c0000000-0000-4000-8000-000000000001',
        slug: 'restaurants',
        name: 'Restaurants',
        color: '#dc2626',
        targetCents: 15_000,
        spentCents: 27_000,
        gapCents: 12_000,
      },
    ],
    under: [
      {
        categoryId: 'c0000000-0000-4000-8000-000000000002',
        slug: 'groceries',
        name: 'Courses',
        color: '#d97706',
        targetCents: 40_000,
        spentCents: 34_000,
        gapCents: -6_000,
      },
    ],
  },
  missing: [],
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

function renderPage(
  banner?: ReactNode,
  {
    month,
    onMonthChange,
  }: {
    month?: string
    onMonthChange?: (month: string | undefined) => void
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage
        banner={banner}
        month={month}
        onMonthChange={onMonthChange}
      />
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
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-05T10:00:00Z'))
  api.dashboardControllerReview.mockImplementation(() => ok(review))
  api.dashboardControllerOverview.mockImplementation(() => ok(overview))
  api.dashboardControllerHistory.mockImplementation(() => ok(history))
  api.forecastControllerForecast.mockImplementation(() => ok(forecast()))
  api.budgetsControllerEnvelopes.mockImplementation(() =>
    ok({
      month: '2026-11',
      today: '2026-11-05',
      dayOfMonth: 5,
      daysInMonth: 30,
      items: [],
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('DashboardPage', () => {
  it('reviews the last month: net worth, what moved it, budget drift', async () => {
    renderPage()

    const card = await screen.findByRole('region', { name: 'Bilan d’octobre' })
    expect(api.dashboardControllerReview).toHaveBeenCalledWith({
      throwOnError: false,
    })
    expect(within(card).getByText('Complet')).toBeInTheDocument()
    expect(card).toHaveTextContent('Patrimoine au 31 oct.')
    expect(card).toHaveTextContent(text('48 230 €'))
    expect(card).toHaveTextContent(text('+1 120 €'))
    expect(card).toHaveTextContent(text('Épargné+655 € · 26,2 %'))
    expect(card).toHaveTextContent(text('Placements et autres+465 €'))
    expect(
      within(card).getByRole('meter', { name: 'Dépensé' }),
    ).toHaveAttribute('aria-valuenow', '184500')
    expect(card).toHaveTextContent(text('Reste 155 €'))

    const drift = within(card).getByRole('list', { name: 'Écarts au budget' })
    const rows = within(drift).getAllByRole('link')
    expect(rows[0]).toHaveTextContent(text('Restaurants120 € de trop'))
    expect(rows[0]).toHaveAttribute(
      'href',
      '/transactions?month=2026-10&category=c0000000-0000-4000-8000-000000000001&kind=expense',
    )
    expect(rows[1]).toHaveTextContent(text('Courses60 € de marge'))
    expect(
      within(card).getByRole('link', {
        name: 'Préparer le budget de novembre',
      }),
    ).toHaveAttribute('href', '/budget?month=2026-11')
  })

  it('follows the current month under the review', async () => {
    renderPage()

    const card = await screen.findByRole('region', { name: 'Ce mois-ci' })
    expect(
      await within(card).findByRole('link', {
        name: 'Choisir les enveloppes',
      }),
    ).toHaveAttribute('href', '/budget')
    expect(
      within(card).getByRole('button', { name: 'Ajouter une dépense' }),
    ).toBeInTheDocument()
    // Right after the review, before the accounts.
    const reviewCard = screen.getByRole('region', { name: 'Bilan d’octobre' })
    expect(
      reviewCard.compareDocumentPosition(card) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('leaves out « Placements et autres » when nothing but savings moved the net worth', async () => {
    api.dashboardControllerReview.mockImplementation(() =>
      ok({
        ...review,
        netWorth: {
          ...review.netWorth,
          changeCents: 65_520,
          savedCents: 65_500,
          otherCents: 20,
        },
      }),
    )
    renderPage()

    const card = await screen.findByRole('region', { name: 'Bilan d’octobre' })
    expect(card).toHaveTextContent(text('Épargné+655 € · 26,2 %'))
    expect(card).not.toHaveTextContent('Placements et autres')
  })

  it('says which accounts to update while the month is incomplete', async () => {
    api.dashboardControllerReview.mockImplementation(() =>
      ok({
        ...review,
        closed: false,
        period: { ...review.period, status: 'partial', throughDay: 20 },
        missing: [
          {
            id: checking.id,
            name: 'Compte test',
            type: 'checking',
            group: 'cash',
            lastDate: '2026-10-20',
          },
          {
            id: pea.id,
            name: 'PEA test',
            type: 'brokerage',
            group: 'investments',
            lastDate: null,
          },
        ],
      }),
    )
    renderPage()

    const card = await screen.findByRole('region', { name: 'Bilan d’octobre' })
    expect(within(card).getByText('À compléter')).toBeInTheDocument()
    const missing = within(card).getByRole('region', {
      name: 'Comptes à mettre à jour',
    })
    expect(missing).toHaveTextContent('Compte testau 20 oct.')
    expect(missing).toHaveTextContent('PEA testjamais')
    expect(
      within(missing).getByRole('link', { name: /Importer/ }),
    ).toHaveAttribute('href', '/import')
    expect(screen.queryByText(/-100/)).not.toBeInTheDocument()
  })

  it('updates a missing investment value from the month review', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    api.accountSnapshotsControllerUpsert.mockImplementation(() =>
      ok({ id: 's1', date: '2026-11-05', valueCents: 1_050_000, note: null }),
    )
    api.dashboardControllerReview.mockImplementation(() =>
      ok({
        ...review,
        closed: false,
        missing: [
          {
            id: pea.id,
            name: 'PEA test',
            type: 'brokerage',
            group: 'investments',
            lastDate: '2026-09-30',
          },
          {
            id: crypto.id,
            name: 'Crypto test',
            type: 'crypto',
            group: 'investments',
            lastDate: null,
          },
        ],
      }),
    )
    renderPage()

    const card = await screen.findByRole('region', { name: 'Bilan d’octobre' })
    const missing = within(card).getByRole('region', {
      name: 'Comptes à mettre à jour',
    })
    // Nothing to import: only investment values are missing.
    expect(
      within(missing).queryByRole('link', { name: /Importer/ }),
    ).not.toBeInTheDocument()
    // Crypto values come from holdings, not typed by hand.
    expect(
      within(missing).queryByRole('button', {
        name: 'Mettre à jour « Crypto test »',
      }),
    ).not.toBeInTheDocument()

    await user.click(
      within(missing).getByRole('button', {
        name: 'Mettre à jour « PEA test »',
      }),
    )
    await user.type(await screen.findByLabelText('Valeur'), '10 500')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(api.accountSnapshotsControllerUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: pea.id, date: '2026-11-05' },
        }),
      ),
    )
  })

  it('shows the spending alone when no budget is set', async () => {
    api.dashboardControllerReview.mockImplementation(() =>
      ok({
        ...review,
        budget: {
          ...review.budget,
          budgetCount: 0,
          targetCents: 0,
          spentCents: 0,
          remainingCents: 0,
          over: [],
          under: [],
        },
      }),
    )
    renderPage()

    const card = await screen.findByRole('region', { name: 'Bilan d’octobre' })
    expect(within(card).queryByRole('meter')).not.toBeInTheDocument()
    expect(card).toHaveTextContent(text('Dépensé, sans budget fixé1 845 €'))
    expect(
      within(card).getByRole('link', {
        name: 'Préparer le budget de novembre',
      }),
    ).toHaveAttribute('href', '/budget?month=2026-11')
  })

  it('moves between months, the previous month kept out of the URL', async () => {
    const user = userEvent.setup()
    const onMonthChange = vi.fn()
    renderPage(undefined, { month: '2026-10', onMonthChange })
    await screen.findByRole('region', { name: 'Bilan d’octobre' })

    // October is the latest month that can be reviewed in November.
    expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Mois précédent' }))
    expect(onMonthChange).toHaveBeenLastCalledWith('2026-09')
    expect(api.dashboardControllerReview).toHaveBeenCalledWith({
      query: { month: '2026-10' },
      throwOnError: false,
    })
  })

  it('lists the accounts by group with their balance and date', async () => {
    renderPage()

    const cash = await screen.findByRole('region', { name: 'Liquidités' })
    expect(cash).toHaveTextContent(euros(623_456))
    const link = within(cash).getByRole('link', { name: /Compte test/ })
    expect(link).toHaveAttribute('href', `/transactions?account=${checking.id}`)
    expect(link).toHaveTextContent(euros(123_456))
    // Left: type (the name doesn't say it) · institution · date this year.
    expect(link).toHaveTextContent('Compte courant · Banque test · au 3 nov.')
    // The name already says it is a livret: no type repeated.
    expect(
      within(cash).getByRole('link', { name: /Livret test/ }),
    ).toHaveTextContent(/^Livret testau 31 oct\./)

    const investments = screen.getByRole('region', { name: 'Investissements' })
    expect(investments).toHaveTextContent(euros(1_000_000))
    // Investment accounts open their valuation page.
    expect(
      within(investments).getByRole('link', { name: /PEA test/ }),
    ).toHaveAttribute('href', `/accounts/${pea.id}`)
    expect(investments).not.toHaveTextContent('PEA / compte-titres')
    expect(
      within(investments).getByRole('link', { name: /Crypto test/ }),
    ).toHaveTextContent('aucune valeur')
    // One target per row: no edit button in the list.
    expect(within(cash).queryByRole('button')).not.toBeInTheDocument()
    expect(within(investments).queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens the net worth page from the accounts card and the chart', async () => {
    renderPage()

    const total = await screen.findByRole('link', { name: /Patrimoine net/ })
    expect(total).toHaveAttribute('href', '/net-worth')
    expect(total).toHaveTextContent(euros(1_623_456))
    expect(await screen.findByRole('link', { name: 'Détail' })).toHaveAttribute(
      'href',
      '/net-worth',
    )
  })

  it('flags an investment value older than a month', async () => {
    api.dashboardControllerOverview.mockImplementation(() =>
      ok({
        ...overview,
        accounts: overview.accounts.map((account) =>
          account.id === pea.id
            ? { ...account, balanceDate: '2026-09-30', stale: true }
            : account,
        ),
      }),
    )
    renderPage()

    const investments = await screen.findByRole('region', {
      name: 'Investissements',
    })
    expect(
      within(investments).getByRole('link', { name: /PEA test/ }),
    ).toHaveTextContent(`PEA testau 30 sept.${euros(1_000_000)}à mettre à jour`)
    expect(
      within(screen.getByRole('region', { name: 'Liquidités' })).queryByText(
        /à mettre à jour/,
      ),
    ).not.toBeInTheDocument()
  })

  it('opens the add-an-investment flow from the accounts card', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()

    await screen.findByRole('region', { name: 'Investissements' })
    // « Ajouter un compte » is the usual action here, first and solid.
    const [first, second] = screen.getAllByRole('button', {
      name: /^Ajouter un (compte|placement)$/,
    })
    expect(first).toHaveAccessibleName('Ajouter un compte')
    expect(second).toHaveAccessibleName('Ajouter un placement')
    await user.click(
      screen.getByRole('button', { name: 'Ajouter un placement' }),
    )
    expect(
      await screen.findByRole('dialog', { name: 'Ajouter un placement' }),
    ).toBeInTheDocument()
  })

  it('points to the review queue, without an import button beside the title', async () => {
    renderPage()

    expect(await screen.findByText('3 opérations à revoir')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Ouvrir la file de revue/ }),
    ).toHaveAttribute('href', '/review')
    // The accounts not updated link to the import (and so do the navigation
    // and the month review): no page action on the dashboard (#246).
    expect(
      screen.queryByRole('link', { name: 'Importer' }),
    ).not.toBeInTheDocument()
  })

  it('hides the review callout when nothing waits', async () => {
    api.dashboardControllerOverview.mockImplementation(() =>
      ok({ ...overview, reviewCount: 0 }),
    )
    renderPage()

    await screen.findByRole('region', { name: 'Bilan d’octobre' })
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
          previousMonthEnd: '2026-10-31',
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
      screen.queryByRole('region', { name: /Bilan/ }),
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
      await screen.findByRole('region', { name: 'Bilan d’octobre' }),
    ).toBeInTheDocument()
  })
})
