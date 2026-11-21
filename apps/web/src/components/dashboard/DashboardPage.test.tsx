import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CoverageDto,
  DashboardAccountDto,
  DashboardOverviewDto,
  MonthReviewDto,
  RecurringItemDto,
} from '#/api/types.gen'
import { forecast } from '#/components/forecast/test-fixtures'
import { formatWholeEuros } from '#/lib/money'
import { DashboardPage } from './DashboardPage'

const api = vi.hoisted(() => ({
  dashboardControllerOverview: vi.fn(),
  dashboardControllerReview: vi.fn(),
  forecastControllerForecast: vi.fn(),
  budgetsControllerEnvelopes: vi.fn(),
  coverageControllerCoverage: vi.fn(),
  receivablesControllerSuggestions: vi.fn(),
  recurringControllerList: vi.fn(),
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
    search?: Record<string, string | boolean>
    children: ReactNode
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (url, [key, value]) => url.replace(`$${key}`, value),
      to,
    )
    const query = search
      ? new URLSearchParams(
          Object.entries(search).map(([key, value]) => [key, String(value)]),
        ).toString()
      : ''
    return (
      <a href={query ? `${path}?${query}` : path} {...props}>
        {children}
      </a>
    )
  },
}))

/** Testing Library collapses the narrow no-break spaces `Intl` emits. */
const euros = (cents: number) => formatWholeEuros(cents).replace(/\s/g, ' ')

/** Synthetic data only. */
const checking: DashboardAccountDto = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Compte test',
  type: 'checking',
  institution: 'Banque test',
  group: 'cash',
  balanceCents: 123_456,
  balanceDate: '2026-11-19',
  dataUntil: '2026-11-19',
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

const period = {
  month: '2026-11',
  dataUntil: '2026-11-19',
  status: 'partial' as const,
  throughDay: 19,
  previousMonth: '2026-10',
  previousUntil: '2026-10-19',
  defaultMonth: '2026-11',
}

const flow = {
  month: '2026-11',
  until: '2026-11-19',
  incomeCents: 0,
  expenseCents: -100_000,
  netCents: -100_000,
  oneOffIncomeCents: 0,
  oneOffExpenseCents: 0,
  savingsRate: null,
}

const overview: DashboardOverviewDto = {
  netWorth: {
    totalCents: 1_623_456,
    cashCents: 623_456,
    investmentsCents: 1_000_000,
    previousMonthEnd: '2026-10-31',
    previousMonthEndCents: 1_500_000,
    unknownBalanceCount: 0,
  },
  accounts: [checking, pea],
  period,
  current: flow,
  previous: flow,
  reviewCount: 0,
}

/** The current month: 2 000 € budgeted, 1 000 € spent by the 19th. */
const current: MonthReviewDto = {
  month: '2026-11',
  defaultMonth: '2026-11',
  current: true,
  nextMonth: '2026-12',
  period,
  closed: false,
  closedAt: null,
  nextMonthBudgeted: false,
  netWorth: {
    date: '2026-11-21',
    endCents: 1_623_456,
    previousDate: '2026-10-31',
    previousEndCents: 1_500_000,
    changeCents: 123_456,
    savedCents: -100_000,
    otherCents: 223_456,
  },
  flow,
  budget: {
    budgetCount: 4,
    targetCents: 200_000,
    spentCents: 100_000,
    remainingCents: 100_000,
    unbudgetedCents: 8_800,
    over: [],
    under: [],
  },
  missing: [],
}

/** Last month, closed, with the current month budgeted. */
const previous: MonthReviewDto = {
  ...current,
  month: '2026-10',
  current: false,
  nextMonth: '2026-11',
  period: { ...period, month: '2026-10', status: 'complete', throughDay: null },
  closed: true,
  closedAt: '2026-11-02T09:00:00.000Z',
  nextMonthBudgeted: true,
}

const coverage: CoverageDto = {
  dataUntil: '2026-11-19',
  currentMonth: '2026-11',
  defaultMonth: '2026-11',
  months: ['2026-09', '2026-10', '2026-11'],
}

function recurring(overrides: Partial<RecurringItemDto>): RecurringItemDto {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    name: 'Abonnement test',
    status: 'confirmed',
    direction: 'debit',
    renewalReminder: false,
    renewalDate: null,
    ended: false,
    isSubscription: true,
    isFixedCost: false,
    confidence: 0.9,
    active: true,
    monthlyEquivalentCents: 1_000,
    endedOn: null,
    ...overrides,
  } as RecurringItemDto
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

function mockReviews(
  currentReview: MonthReviewDto = current,
  previousReview: MonthReviewDto = previous,
) {
  api.dashboardControllerReview.mockImplementation(
    (options?: { query?: { month?: string } }) =>
      ok(options?.query?.month === '2026-10' ? previousReview : currentReview),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-21T10:00:00Z'))
  mockReviews()
  api.dashboardControllerOverview.mockImplementation(() => ok(overview))
  api.coverageControllerCoverage.mockImplementation(() => ok(coverage))
  api.receivablesControllerSuggestions.mockImplementation(() => ok([]))
  api.recurringControllerList.mockImplementation(() => ok([]))
  api.forecastControllerForecast.mockImplementation(() => ok(forecast()))
  api.budgetsControllerEnvelopes.mockImplementation(() =>
    ok({
      month: '2026-11',
      current: true,
      today: '2026-11-21',
      dayOfMonth: 21,
      daysInMonth: 30,
      items: [],
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('DashboardPage', () => {
  it('follows today: the date under the title, no month to move between', async () => {
    renderPage()
    expect(await screen.findByText('Samedi 21 novembre')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Mois précédent/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Bilan du mois' }),
    ).not.toBeInTheDocument()
  })

  it('shows what is left to spend against the pace of the days known', async () => {
    renderPage()
    const card = await screen.findByRole('region', {
      name: 'Reste à dépenser',
    })
    const link = within(card).getByRole('link', { name: /Reste à dépenser/ })
    expect(link).toHaveAttribute('href', '/budget')
    expect(screen.getByTestId('left-to-spend')).toHaveTextContent(
      euros(100_000),
    )
    // Read to the 19th, the day the data goes to: 2 000 € × 19 / 30.
    expect(card).toHaveTextContent(`${euros(26_667)} sous le rythme`)
    expect(card).toHaveTextContent(
      `${euros(100_000)} sur ${euros(200_000)} · ${euros(8_800)} hors budget`,
    )
    expect(card).toHaveTextContent('À jour au 19 nov.')
    expect(
      within(card).getByRole('meter', { name: 'Budget du mois' }),
    ).toHaveAttribute('aria-valuenow', '100000')
  })

  it('says when the budget is spent past its target', async () => {
    mockReviews({
      ...current,
      budget: {
        ...current.budget,
        spentCents: 212_000,
        remainingCents: -12_000,
      },
    })
    renderPage()
    const amount = await screen.findByTestId('left-to-spend')
    expect(amount).toHaveTextContent(euros(12_000))
    expect(screen.getByText(/Budget dépassé en novembre/)).toBeInTheDocument()
    expect(screen.getByText('Jour 19 sur 30')).toBeInTheDocument()
  })

  it('offers to set a budget when the month has none', async () => {
    mockReviews({
      ...current,
      budget: { ...current.budget, budgetCount: 0, targetCents: 0 },
    })
    renderPage()
    expect(
      await screen.findByText('Pas de budget pour novembre.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Fixer un budget/ }),
    ).toHaveAttribute('href', '/budget')
  })

  it('sums up the end of the month and opens the forecast', async () => {
    renderPage()
    const row = await screen.findByRole(
      'link',
      { name: /Fin de mois/ },
      { timeout: 3_000 },
    )
    expect(row).toHaveAttribute('href', '/forecast')
    expect(row).toHaveTextContent(euros(267_000))
    expect(row).toHaveTextContent(`Point bas ${euros(18_000)} le 29 nov.`)
  })

  it('warns when the balance goes under the threshold', async () => {
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
      await screen.findByText(`Sous ${euros(50_000)} le 29 nov.`),
    ).toBeInTheDocument()
  })

  it('shows today’s net worth with its change, opening the accounts', async () => {
    renderPage()
    const row = await screen.findByRole('link', { name: /Patrimoine/ })
    expect(row).toHaveAttribute('href', '/accounts')
    expect(row).toHaveTextContent(euros(1_623_456))
    expect(row).toHaveTextContent(`+${euros(123_456)} depuis le 31 oct.`)
    // The accounts themselves are on Comptes.
    expect(screen.queryByText('PEA test')).not.toBeInTheDocument()
  })

  it('has nothing to do when everything is up to date', async () => {
    renderPage()
    await screen.findByTestId('left-to-spend')
    expect(
      screen.queryByRole('region', { name: 'À faire' }),
    ).not.toBeInTheDocument()
  })

  it('lists what is waiting, most pressing first, three then the rest', async () => {
    api.coverageControllerCoverage.mockImplementation(() =>
      ok({ ...coverage, dataUntil: '2026-11-11' }),
    )
    mockReviews(current, {
      ...previous,
      closed: false,
      closedAt: null,
      missing: [
        {
          id: pea.id,
          name: pea.name,
          type: pea.type,
          group: 'investments',
          lastDate: '2026-09-30',
        },
      ],
    })
    api.dashboardControllerOverview.mockImplementation(() =>
      ok({
        ...overview,
        reviewCount: 7,
        accounts: [checking, { ...pea, stale: true }],
      }),
    )
    api.receivablesControllerSuggestions.mockImplementation(() =>
      ok([
        {
          transactionId: '40000000-0000-4000-8000-000000000001',
          bookingDate: '2026-11-18',
          label: 'VIR TEST',
          amountCents: 2_400,
          direction: 'owed_to_me',
          contactId: '50000000-0000-4000-8000-000000000001',
          contactName: 'Camille',
          links: [],
        },
      ]),
    )
    api.recurringControllerList.mockImplementation(() =>
      ok([
        recurring({
          id: '30000000-0000-4000-8000-000000000002',
          name: 'Antivirus test',
          renewalReminder: true,
          renewalDate: '2026-12-02',
        }),
        recurring({
          id: '30000000-0000-4000-8000-000000000003',
          status: 'suggested',
        }),
      ]),
    )
    renderPage()

    const todos = await screen.findByRole('region', { name: 'À faire' })
    const links = () => within(todos).getAllByRole('link')
    await vi.waitFor(() => expect(links()).toHaveLength(3))
    expect(links()[0]).toHaveAttribute('href', '/import')
    expect(links()[0]).toHaveTextContent('Importer un relevé')
    expect(links()[0]).toHaveTextContent('Dernier relevé au 11 nov.')
    expect(links()[1]).toHaveAttribute('href', '/month-review?month=2026-10')
    expect(links()[1]).toHaveTextContent('Clôturer octobre')
    expect(links()[1]).toHaveTextContent('1 compte à mettre à jour avant')
    expect(links()[2]).toHaveTextContent('7 opérations à revoir')
    expect(links()[2]).toHaveAttribute(
      'href',
      '/transactions?review=true&month=all',
    )

    await userEvent.click(
      within(todos).getByRole('button', { name: /4 autres/ }),
    )
    expect(links().map((link) => link.textContent.replace(/\s/g, ' '))).toEqual(
      [
        expect.stringContaining('Importer un relevé'),
        expect.stringContaining('Clôturer octobre'),
        expect.stringContaining('7 opérations à revoir'),
        expect.stringContaining(`Camille t’a versé ${euros(2_400)}`),
        expect.stringContaining('Antivirus test'),
        expect.stringContaining('Un abonnement détecté'),
        expect.stringContaining('Un placement à mettre à jour'),
      ],
    )
    expect(links()[5]).toHaveAttribute('href', '/subscriptions')
    expect(links()[6]).toHaveAttribute('href', '/accounts')
    // The figures say how old they are.
    expect(screen.getByText(/Chiffres au/)).toHaveTextContent(
      'Chiffres au 11 nov.',
    )
  })

  it('asks for the month’s budget once last month is closed', async () => {
    mockReviews(current, { ...previous, nextMonthBudgeted: false })
    renderPage()
    const todos = await screen.findByRole('region', { name: 'À faire' })
    expect(
      await within(todos).findByRole('link', {
        name: /Préparer le budget de novembre/,
      }),
    ).toHaveAttribute('href', '/budget')
  })

  it('never asks to close a month without data', async () => {
    api.coverageControllerCoverage.mockImplementation(() =>
      ok({ ...coverage, months: ['2026-11'] }),
    )
    mockReviews(current, { ...previous, closed: false, closedAt: null })
    renderPage()
    await screen.findByTestId('left-to-spend')
    expect(screen.queryByText(/Clôturer/)).not.toBeInTheDocument()
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
      ok({ ...overview, accounts: [], reviewCount: 0 }),
    )
    renderPage()

    expect(
      await screen.findByText('Aucun compte pour l’instant'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Importer un relevé/ }),
    ).toHaveAttribute('href', '/import')
    expect(screen.queryByTestId('left-to-spend')).not.toBeInTheDocument()
  })

  it('keeps the banner and offers a retry when loading fails', async () => {
    api.dashboardControllerOverview.mockImplementationOnce(failure)
    renderPage(<p>Bannière de test</p>)

    expect(
      await screen.findByText('Impossible de charger le tableau de bord.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Bannière de test')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByTestId('left-to-spend')).toBeInTheDocument()
  })
})
