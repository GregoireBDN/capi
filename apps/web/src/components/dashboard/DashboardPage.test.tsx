import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
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
    search?:
      | Record<string, string>
      | ((current: Record<string, unknown>) => Record<string, string>)
    children: ReactNode
  }) => {
    // A function resolves against the page's search (none here).
    if (typeof search === 'function') search = search({})
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
  defaultMonth: '2026-10',
  current: false,
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
  closedAt: null,
  nextMonthBudgeted: true,
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
        icon: null,
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
        icon: null,
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
  api.dashboardControllerReview.mockImplementation(
    (options?: { query?: { month?: string } }) => {
      const month = options?.query?.month ?? review.defaultMonth
      return ok(
        month === review.month
          ? review
          : {
              ...review,
              month,
              current: month === '2026-11',
              period: { ...review.period, month },
            },
      )
    },
  )
  api.dashboardControllerOverview.mockImplementation(() => ok(overview))
  api.dashboardControllerHistory.mockImplementation(() => ok(history))
  api.forecastControllerForecast.mockImplementation(() => ok(forecast()))
  api.budgetsControllerEnvelopes.mockImplementation(
    (options?: { query?: { month?: string } }) =>
      ok({
        month: options?.query?.month ?? '2026-11',
        current: options?.query?.month === undefined,
        today: '2026-11-05',
        dayOfMonth: options?.query?.month ? 31 : 5,
        daysInMonth: 30,
        items: [],
      }),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('DashboardPage', () => {
  /** How many times `needle` appears in the element's text. */
  const count = (element: HTMLElement, needle: string) =>
    text(element.textContent).split(text(needle)).length - 1

  it('reviews the last month: flow, net worth at its end, budget', async () => {
    renderPage()

    const card = await screen.findByRole('region', { name: 'Bilan du mois' })
    expect(api.dashboardControllerReview).toHaveBeenCalledWith({
      throwOnError: false,
    })
    // Not closed in « Revue du mois » yet.
    expect(within(card).getByText('À clôturer')).toBeInTheDocument()
    // The month is named once, by the navigator (the app header's, #401).
    expect(card.textContent).not.toMatch(/octobre/i)
    expect(
      screen.getByRole('button', { name: 'Octobre 2026, choisir un mois' }),
    ).toBeInTheDocument()

    const flow = within(card).getByLabelText('Flux du mois')
    expect(flow).toHaveTextContent(text('Revenus2 500 €'))
    expect(flow).toHaveTextContent(text('Dépenses1 845 €'))
    expect(flow).toHaveTextContent(text('Épargné+655 €26,2 %'))

    // Investments moved the net worth: its change, split once.
    const netWorth = within(card).getByRole('region', { name: 'Patrimoine' })
    expect(netWorth).toHaveTextContent(
      text(
        'Patrimoine au 31 oct.48 230 €+1 120 € sur le mois, dont +465 € de placements et autres',
      ),
    )
    // Every amount once.
    for (const amount of ['+655 €', '1 845 €', '2 500 €', '+1 120 €']) {
      expect(count(card, amount)).toBe(1)
    }

    expect(within(card).getByRole('meter', { name: 'Budget' })).toHaveAttribute(
      'aria-valuenow',
      '184500',
    )
    expect(card).toHaveTextContent(text('Reste155 €'))
    // No per-category gaps in the review (owner: unclear; the envelopes
    // of « Ce mois-ci » show each category against its budget).
    expect(
      within(card).queryByRole('list', { name: 'Écarts au budget' }),
    ).not.toBeInTheDocument()

    // One action, from the month's state: close it.
    expect(
      within(card).getByRole('link', { name: 'Revue et clôture' }),
    ).toHaveAttribute('href', '/month-review?month=2026-10')
    expect(
      within(card).queryByRole('link', { name: /Préparer le budget/ }),
    ).not.toBeInTheDocument()
  })

  it('follows the review’s month with its budget, read only for a past month', async () => {
    renderPage()

    const card = await screen.findByRole('region', { name: 'Budget' })
    expect(
      await within(card).findByText('Aucune enveloppe suivie ce mois-là'),
    ).toBeInTheDocument()
    expect(api.budgetsControllerEnvelopes).toHaveBeenCalledWith({
      query: { month: '2026-10' },
      throwOnError: false,
    })
    expect(within(card).getByRole('link', { name: 'Détail' })).toHaveAttribute(
      'href',
      '/budget?month=2026-10',
    )
    // A month that is over: no expense noted from it.
    expect(
      within(card).queryByRole('button', { name: 'Ajouter une dépense' }),
    ).not.toBeInTheDocument()
    const reviewCard = screen.getByRole('region', { name: 'Bilan du mois' })
    expect(
      reviewCard.compareDocumentPosition(card) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // The forecast is for the current month only.
    expect(
      screen.queryByRole('link', { name: /Fin de mois/ }),
    ).not.toBeInTheDocument()
  })

  it('reads the current month so far: en cours, its forecast, no close', async () => {
    renderPage(undefined, { month: '2026-11' })

    const reviewCard = await screen.findByRole('region', {
      name: 'Bilan du mois',
    })
    expect(within(reviewCard).getByText('En cours')).toBeInTheDocument()
    expect(
      within(reviewCard).queryByRole('link', { name: 'Revue et clôture' }),
    ).not.toBeInTheDocument()
    // Nothing is late before the month end.
    expect(
      within(reviewCard).queryByRole('region', {
        name: 'Comptes à mettre à jour',
      }),
    ).not.toBeInTheDocument()
    // How it will end, in place of a second « à ce jour » net worth.
    expect(
      await within(reviewCard).findByRole('link', { name: /Fin de mois/ }),
    ).toHaveAttribute('href', '/forecast')
    expect(
      within(reviewCard).queryByRole('region', { name: 'Patrimoine' }),
    ).not.toBeInTheDocument()
    expect(count(document.body, 'Patrimoine à ce jour')).toBe(1)

    const card = screen.getByRole('region', { name: 'Budget' })
    expect(
      await within(card).findByRole('link', {
        name: 'Choisir les enveloppes',
      }),
    ).toHaveAttribute('href', '/budget')
    expect(api.budgetsControllerEnvelopes).toHaveBeenCalledWith({
      throwOnError: false,
    })
    expect(within(card).getByRole('link', { name: 'Détail' })).toHaveAttribute(
      'href',
      '/budget?',
    )
    expect(
      within(card).getByRole('button', { name: 'Ajouter une dépense' }),
    ).toBeInTheDocument()
  })

  it('shows the change of net worth only when investments moved it', async () => {
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

    const card = await screen.findByRole('region', { name: 'Bilan du mois' })
    // The change is what was saved: said once, under « Épargné ».
    expect(card).not.toHaveTextContent('sur le mois')
    expect(card).not.toHaveTextContent('placements')
    expect(count(card, '+655 €')).toBe(1)
  })

  it('offers to prepare the next budget once the month is closed', async () => {
    api.dashboardControllerReview.mockImplementation(() =>
      ok({
        ...review,
        closedAt: '2026-11-03T09:00:00.000Z',
        nextMonthBudgeted: false,
      }),
    )
    renderPage()

    const card = await screen.findByRole('region', { name: 'Bilan du mois' })
    expect(within(card).getByText('Clôturé')).toBeInTheDocument()
    expect(
      within(card).getByRole('link', {
        name: 'Préparer le budget du mois suivant',
      }),
    ).toHaveAttribute('href', '/budget?month=2026-11')
    expect(
      within(card).queryByRole('link', { name: 'Revue et clôture' }),
    ).not.toBeInTheDocument()
  })

  it('only links back to the review of a closed month whose next one has a budget', async () => {
    api.dashboardControllerReview.mockImplementation(() =>
      ok({ ...review, closedAt: '2026-11-03T09:00:00.000Z' }),
    )
    renderPage()

    const card = await screen.findByRole('region', { name: 'Bilan du mois' })
    expect(
      within(card).getByRole('link', { name: 'Revoir le mois' }),
    ).toHaveAttribute('href', '/month-review?month=2026-10')
    expect(
      within(card).queryByRole('link', { name: /Préparer|clôture/ }),
    ).not.toBeInTheDocument()
  })

  it('says which accounts to update, one target each', async () => {
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

    const card = await screen.findByRole('region', { name: 'Bilan du mois' })
    const missing = within(card).getByRole('region', {
      name: 'Comptes à mettre à jour',
    })
    const cash = within(missing).getByRole('link', { name: /Compte test/ })
    expect(cash).toHaveAttribute('href', '/import')
    expect(cash).toHaveTextContent('Au 20 oct. · importer')
    const value = within(missing).getByRole('link', { name: /PEA test/ })
    expect(value).toHaveAttribute('href', `/accounts/${pea.id}?from=dashboard`)
    expect(value).toHaveTextContent('Aucune donnée · mettre à jour')
    expect(within(missing).queryByRole('button')).not.toBeInTheDocument()
  })

  it('splits the month’s expenses into with and without a budget on one bar', async () => {
    api.dashboardControllerReview.mockImplementation(() =>
      ok({
        ...review,
        budget: {
          ...review.budget,
          spentCents: 154_500,
          remainingCents: 45_500,
          unbudgetedCents: 30_000,
        },
      }),
    )
    renderPage()

    const card = await screen.findByRole('region', { name: 'Bilan du mois' })
    const legend = within(card).getByRole('list', { name: 'Légende' })
    expect(legend).toHaveTextContent(text('Avec budget1 545 €'))
    expect(legend).toHaveTextContent(text('Sans budget300 €'))
    expect(legend).toHaveTextContent(text('Budget2 000 €'))
    expect(legend).toHaveTextContent(text('Reste455 €'))
    for (const amount of ['1 845 €', '1 545 €', '300 €', '2 000 €']) {
      expect(count(card, amount)).toBe(1)
    }
  })

  it('says when no budget is set, the expenses staying in the flow', async () => {
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

    const card = await screen.findByRole('region', { name: 'Bilan du mois' })
    expect(within(card).queryByRole('meter')).not.toBeInTheDocument()
    expect(card).toHaveTextContent('Pas de budget fixé pour ce mois.')
    expect(count(card, '1 845 €')).toBe(1)
  })

  it('moves up to the current month, the default kept out of the URL', async () => {
    const user = userEvent.setup()
    const onMonthChange = vi.fn()
    renderPage(undefined, { month: '2026-09', onMonthChange })
    await screen.findByRole('region', { name: 'Bilan du mois' })
    expect(api.dashboardControllerReview).toHaveBeenCalledWith({
      query: { month: '2026-09' },
      throwOnError: false,
    })

    // October is the default month: back to the bare URL.
    await user.click(screen.getByRole('button', { name: 'Mois suivant' }))
    expect(onMonthChange).toHaveBeenLastCalledWith(undefined)
    await user.click(screen.getByRole('button', { name: 'Mois précédent' }))
    expect(onMonthChange).toHaveBeenLastCalledWith('2026-08')
  })

  it('reaches the current month, and stops there', async () => {
    const user = userEvent.setup()
    const onMonthChange = vi.fn()
    const { unmount } = renderPage(undefined, { onMonthChange })
    await screen.findByRole('region', { name: 'Bilan du mois' })
    await user.click(screen.getByRole('button', { name: 'Mois suivant' }))
    expect(onMonthChange).toHaveBeenLastCalledWith('2026-11')
    unmount()

    renderPage(undefined, { month: '2026-11', onMonthChange })
    await screen.findByText('En cours')
    expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeDisabled()
  })

  it('lists the accounts by group with their balance and date', async () => {
    renderPage()

    const cash = await screen.findByRole('region', { name: 'Liquidités' })
    // The group's total is a tile above the list, said once.
    const card = cash.closest('[data-slot="card"]') as HTMLElement
    expect(card).toHaveTextContent(`Liquidités${euros(623_456)}`)
    expect(cash).not.toHaveTextContent(euros(623_456))
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
    ).toHaveAttribute('href', `/accounts/${pea.id}?from=dashboard`)
    expect(investments).not.toHaveTextContent('PEA / compte-titres')
    expect(
      within(investments).getByRole('link', { name: /Crypto test/ }),
    ).toHaveTextContent('aucune valeur')
    // One target per row: no edit button in the list.
    expect(within(cash).queryByRole('button')).not.toBeInTheDocument()
    expect(within(investments).queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows today’s net worth once, in the accounts card, with the way to its page', async () => {
    renderPage()

    const card = (await screen.findByText('Comptes')).closest(
      '[data-slot="card"]',
    ) as HTMLElement
    // With its change since the last month end, the review's figure.
    expect(card).toHaveTextContent(
      text(`Patrimoine à ce jour${euros(1_623_456)}+235 € depuis le 31 oct.`),
    )
    expect(
      within(card).getByRole('link', { name: 'Évolution' }),
    ).toHaveAttribute('href', '/net-worth')
    // No second « Patrimoine net » (chart or row) on the dashboard.
    expect(screen.queryByText('Patrimoine net')).not.toBeInTheDocument()
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
    const peaRow = within(investments).getByRole('link', { name: /PEA test/ })
    // Wide rows: the date on the left, « à mettre à jour » on the right.
    expect(peaRow).toHaveTextContent(`${euros(1_000_000)}à mettre à jour`)
    expect(peaRow).toHaveTextContent(/^PEA testau 30 sept\./)
    // Phones (#344): the value, then the stale value's date.
    expect(peaRow).toHaveTextContent(
      `${euros(1_000_000)}À mettre à jour, valeur 30 sept.`,
    )
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

  it('points to « À revoir » in Opérations, without an import button beside the title', async () => {
    renderPage()

    expect(await screen.findByText('3 opérations à revoir')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /3 opérations à revoir/ }),
    ).toHaveAttribute('href', '/transactions?review=true&month=all')
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

    await screen.findByRole('region', { name: 'Bilan du mois' })
    expect(screen.queryByText(/à revoir/)).not.toBeInTheDocument()
  })

  it('draws the income and expenses chart with French month names', async () => {
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
    expect(api.dashboardControllerHistory).toHaveBeenCalledWith(
      expect.objectContaining({ query: { months: 12 } }),
    )
  })

  it('sums up the end-of-month forecast in the current month’s review', async () => {
    renderPage(undefined, { month: '2026-11' })
    // The review loads first, then the forecast it holds.
    await screen.findByText('En cours')
    const row = await screen.findByRole(
      'link',
      { name: /Fin de mois/ },
      { timeout: 3_000 },
    )
    expect(
      screen.getByRole('region', { name: 'Bilan du mois' }),
    ).toContainElement(row)
    expect(row).toHaveAttribute('href', '/forecast')
    expect(row).toHaveTextContent(euros(267_000))
    expect(row).toHaveTextContent(`Point bas ${euros(18_000)} le 29 nov.`)

    api.forecastControllerForecast.mockImplementation(() =>
      ok(
        forecast({
          thresholdCents: 50_000,
          belowThreshold: { date: '2026-11-29', balanceCents: 18_000 },
        }),
      ),
    )
    renderPage(undefined, { month: '2026-11' })
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
      await screen.findByRole('region', { name: 'Bilan du mois' }),
    ).toBeInTheDocument()
  })
})
