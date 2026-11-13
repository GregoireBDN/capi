import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AccountDto,
  CategoryDto,
  CategorySpendingDto,
  SpendingByCategoryDto,
  SpendingTrendDto,
} from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import type { SpendingSearch } from './search'
import { SpendingPage } from './SpendingPage'

const api = vi.hoisted(() => ({
  accountsControllerList: vi.fn(),
  categoriesControllerList: vi.fn(),
  spendingControllerByCategory: vi.fn(),
  spendingControllerTrend: vi.fn(),
}))

vi.mock('#/api', () => api)
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
    ...props
  }: {
    to: string
    search?: Record<string, string>
    children: ReactNode
  }) => (
    <a
      href={search ? `${to}?${new URLSearchParams(search).toString()}` : to}
      {...props}
    >
      {children}
    </a>
  ),
}))

/** Testing Library collapses the narrow no-break spaces `Intl` emits. */
const euros = (cents: number) => formatCents(cents).replace(/\s/g, ' ')

/** Synthetic data only. */
const ACCOUNT_ID = '10000000-0000-4000-8000-000000000001'
const accounts = [
  { id: ACCOUNT_ID, name: 'Compte test', type: 'checking' },
  {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'PEA test',
    type: 'brokerage',
  },
] as AccountDto[]

const GROCERIES = 'c0000000-0000-4000-8000-000000000001'
const RENT = 'c0000000-0000-4000-8000-000000000002'
const LEISURE = 'c0000000-0000-4000-8000-000000000003'
const categories = [
  {
    id: GROCERIES,
    slug: 'groceries',
    name: 'Courses',
    kind: 'expense',
    color: '#d97706',
  },
  { id: RENT, slug: 'rent', name: 'Loyer', kind: 'expense', color: '#dc2626' },
  {
    id: LEISURE,
    slug: 'leisure',
    name: 'Loisirs',
    kind: 'expense',
    color: '#c026d3',
  },
  {
    id: 'c0000000-0000-4000-8000-000000000004',
    slug: 'salary',
    name: 'Salaire',
    kind: 'income',
    color: null,
  },
] as CategoryDto[]

function spending(
  overrides: Partial<CategorySpendingDto>,
): CategorySpendingDto {
  return {
    categoryId: GROCERIES,
    slug: 'groceries',
    name: 'Courses',
    color: '#d97706',
    spentCents: 0,
    share: 0,
    transactionCount: 0,
    previousSpentCents: 0,
    deltaCents: 0,
    averageCents: null,
    notYetThisMonth: false,
    ...overrides,
  }
}

const october: SpendingByCategoryDto = {
  month: '2026-10',
  previousMonth: '2026-09',
  period: {
    month: '2026-10',
    dataUntil: '2026-11-03',
    status: 'complete',
    throughDay: null,
    previousMonth: '2026-09',
    previousUntil: '2026-09-30',
    defaultMonth: '2026-11',
  },
  includeOneOffs: false,
  averageMonths: 6,
  averageFrom: '2026-04',
  totalCents: 100_000,
  transactionCount: 9,
  previousTotalCents: 90_000,
  averageTotalCents: 95_000,
  oneOffCents: 25_000,
  categories: [
    spending({
      categoryId: RENT,
      slug: 'rent',
      name: 'Loyer',
      color: '#dc2626',
      spentCents: 70_000,
      share: 0.7,
      transactionCount: 1,
      previousSpentCents: 70_000,
      averageCents: 70_000,
    }),
    spending({
      spentCents: 25_000,
      share: 0.25,
      transactionCount: 6,
      previousSpentCents: 12_000,
      deltaCents: 13_000,
      averageCents: 20_000,
    }),
    spending({
      categoryId: null,
      slug: null,
      name: null,
      color: null,
      spentCents: 5_000,
      share: 0.05,
      transactionCount: 2,
      previousSpentCents: 8_000,
      deltaCents: -3_000,
      averageCents: 5_000,
    }),
  ],
}

function trend(overrides: Partial<SpendingTrendDto> = {}): SpendingTrendDto {
  return {
    months: ['2026-08', '2026-09', '2026-10'],
    includeOneOffs: false,
    series: [
      {
        key: RENT,
        type: 'category',
        categoryId: RENT,
        slug: 'rent',
        name: 'Loyer',
        color: '#dc2626',
        valuesCents: [70_000, 70_000, 70_000],
        totalCents: 210_000,
      },
    ],
    totalsCents: [70_000, 70_000, 70_000],
    averageCents: 70_000,
    averageMonths: 3,
    ...overrides,
  }
}

function ok<T>(data: T) {
  return Promise.resolve({
    data,
    response: new Response(null, { status: 200 }),
  })
}

function renderPage(initial: SpendingSearch = { month: '2026-10' }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const changes: SpendingSearch[] = []
  function Harness() {
    const [search, setSearch] = useState(initial)
    return (
      <SpendingPage
        search={search}
        onSearchChange={(next) => {
          changes.push(next)
          setSearch(next)
        }}
      />
    )
  }
  render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  )
  return { changes }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-05T10:00:00Z'))
  api.accountsControllerList.mockReturnValue(ok(accounts))
  api.categoriesControllerList.mockReturnValue(ok(categories))
  api.spendingControllerByCategory.mockReturnValue(ok(october))
  api.spendingControllerTrend.mockReturnValue(ok(trend()))
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('SpendingPage', () => {
  it('shows the KPIs of the month', async () => {
    renderPage()

    const kpis = await screen.findByRole('region', {
      name: 'Indicateurs du mois',
    })
    expect(within(kpis).getByText('Dépensé')).toBeInTheDocument()
    expect(within(kpis).getByText(euros(100_000))).toBeInTheDocument()
    expect(within(kpis).getAllByText('vs septembre')[0]).toBeInTheDocument()
    expect(within(kpis).getByText(`+${euros(10_000)}`)).toBeInTheDocument()
    expect(within(kpis).getByText('vs moyenne')).toBeInTheDocument()
    expect(within(kpis).getByText(`+${euros(5_000)}`)).toBeInTheDocument()
    // Biggest increase: groceries, +130 €.
    expect(within(kpis).getByText('Courses')).toBeInTheDocument()
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent.replace(/\s/g, ' ') ===
            `Virements entre vos comptes exclus. Dépenses ponctuelles exclues : ${euros(25_000)}.`,
      ),
    ).toBeInTheDocument()

    expect(api.spendingControllerByCategory).toHaveBeenCalledWith({
      query: { month: '2026-10', includeOneOffs: false, averageMonths: 6 },
      throwOnError: false,
    })
    expect(api.spendingControllerTrend).toHaveBeenCalledWith({
      query: { month: '2026-10', months: 12, includeOneOffs: false },
      throwOnError: false,
    })
  })

  it('ranks the categories with drill-down links to the transactions', async () => {
    renderPage({ month: '2026-10', account: ACCOUNT_ID })

    const list = await screen.findByRole('list', {
      name: 'Dépenses par catégorie',
    })
    const links = within(list).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining('Loyer'),
      expect.stringContaining('Courses'),
      expect.stringContaining('Non catégorisé'),
    ])

    const groceries = new URL(links[1].getAttribute('href')!, 'http://x')
    expect(groceries.pathname).toBe('/transactions')
    expect(Object.fromEntries(groceries.searchParams)).toEqual({
      month: '2026-10',
      category: GROCERIES,
      kind: 'expense',
      account: ACCOUNT_ID,
    })
    const uncategorized = new URL(links[2].getAttribute('href')!, 'http://x')
    expect(uncategorized.searchParams.get('category')).toBe('none')

    // Spending up is unfavourable, down is favourable.
    const up = within(links[1]).getByText(`+${euros(13_000)}`)
    expect(up.closest('[data-slot="spending-delta"]')).toHaveAttribute(
      'data-tone',
      'bad',
    )
    const down = within(links[2]).getByText(`-${euros(3_000)}`)
    expect(down.closest('[data-slot="spending-delta"]')).toHaveAttribute(
      'data-tone',
      'good',
    )
    expect(
      within(links[1]).getByText('25 %', { exact: false }),
    ).toBeInTheDocument()
  })

  it('moves between months and toggles one-offs through the URL', async () => {
    const user = userEvent.setup()
    // Without a month, the API answers with its default one: November.
    api.spendingControllerByCategory.mockImplementation(
      ({ query }: { query: { month?: string } }) =>
        ok(
          query.month
            ? october
            : {
                ...october,
                month: '2026-11',
                previousMonth: '2026-10',
                period: {
                  ...october.period,
                  month: '2026-11',
                  status: 'partial',
                  throughDay: 3,
                  previousMonth: '2026-10',
                  previousUntil: '2026-10-03',
                },
              },
        ),
    )
    const { changes } = renderPage({ month: '2026-10' })
    await screen.findByRole('list', { name: 'Dépenses par catégorie' })

    await user.click(screen.getByRole('button', { name: 'Mois suivant' }))
    // November is the default month (picked by the API): kept out of the URL.
    expect(changes.at(-1)).toEqual({})
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Mois suivant' }),
      ).toBeDisabled(),
    )

    await user.click(screen.getByRole('button', { name: 'Mois précédent' }))
    expect(changes.at(-1)).toEqual({ month: '2026-10' })

    await user.click(
      screen.getByRole('switch', { name: 'Inclure les dépenses ponctuelles' }),
    )
    expect(changes.at(-1)).toEqual({ month: '2026-10', oneOffs: true })
    await waitFor(() =>
      expect(api.spendingControllerByCategory).toHaveBeenLastCalledWith({
        query: { month: '2026-10', includeOneOffs: true, averageMonths: 6 },
        throwOnError: false,
      }),
    )

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Compte' }),
      ACCOUNT_ID,
    )
    expect(changes.at(-1)).toMatchObject({ account: ACCOUNT_ID })
    // Only transactional accounts are offered.
    expect(screen.queryByRole('option', { name: 'PEA test' })).toBeNull()

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Période de la moyenne' }),
      '12',
    )
    await waitFor(() =>
      expect(api.spendingControllerByCategory).toHaveBeenLastCalledWith({
        query: {
          month: '2026-10',
          includeOneOffs: true,
          averageMonths: 12,
          accountId: ACCOUNT_ID,
        },
        throwOnError: false,
      }),
    )
  })

  it('shows one category alone in the trend', async () => {
    const user = userEvent.setup()
    const { changes } = renderPage()
    const select = await screen.findByRole('combobox', {
      name: 'Catégorie de la tendance',
    })
    // Expense categories only, plus the uncategorized bucket.
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Principales catégories',
      'Courses',
      'Loisirs',
      'Loyer',
      'Non catégorisé',
    ])

    await user.selectOptions(select, LEISURE)
    expect(changes.at(-1)).toEqual({ month: '2026-10', trend: LEISURE })
    await waitFor(() =>
      expect(api.spendingControllerTrend).toHaveBeenCalledWith({
        query: {
          month: '2026-10',
          months: 12,
          includeOneOffs: false,
          categoryId: LEISURE,
        },
        throwOnError: false,
      }),
    )

    await user.selectOptions(select, 'none')
    await waitFor(() =>
      expect(api.spendingControllerTrend).toHaveBeenCalledWith({
        query: {
          month: '2026-10',
          months: 12,
          includeOneOffs: false,
          uncategorized: true,
        },
        throwOnError: false,
      }),
    )
  })

  it('compares a month in progress with the same days, rent not paid yet', async () => {
    api.spendingControllerByCategory.mockReturnValue(
      ok({
        ...october,
        month: '2026-11',
        previousMonth: '2026-10',
        period: {
          month: '2026-11',
          dataUntil: '2026-11-03',
          status: 'partial',
          throughDay: 3,
          previousMonth: '2026-10',
          previousUntil: '2026-10-03',
          defaultMonth: '2026-11',
        },
        totalCents: 3_000,
        previousTotalCents: 72_000,
        averageTotalCents: 71_000,
        oneOffCents: 0,
        categories: [
          spending({
            spentCents: 3_000,
            share: 1,
            transactionCount: 1,
            previousSpentCents: 2_000,
            deltaCents: 1_000,
            averageCents: 1_000,
          }),
          spending({
            categoryId: RENT,
            slug: 'rent',
            name: 'Loyer',
            color: '#dc2626',
            previousSpentCents: 70_000,
            deltaCents: -70_000,
            averageCents: 70_000,
            notYetThisMonth: true,
          }),
        ],
      }),
    )
    renderPage({})

    const kpis = await screen.findByRole('region', {
      name: 'Indicateurs du mois',
    })
    // The API picks the month: none is sent.
    expect(api.spendingControllerByCategory).toHaveBeenCalledWith({
      query: { includeOneOffs: false, averageMonths: 6 },
      throwOnError: false,
    })
    expect(screen.getByText('Novembre 2026')).toBeInTheDocument()
    expect(within(kpis).getByText('vs 1–3 oct.')).toBeInTheDocument()
    expect(kpis).toHaveTextContent(/au 1–3 oct\./)
    expect(kpis).toHaveTextContent(/mêmes jours/)
    expect(
      screen.getByText(
        'Mois en cours : données jusqu’au 3 nov., comparées au 1–3 oct.',
      ),
    ).toBeInTheDocument()

    const list = screen.getByRole('list', { name: 'Dépenses par catégorie' })
    const rent = within(list).getByRole('link', { name: /Loyer/ })
    // Not paid yet: no green "saving".
    expect(rent.querySelector('[data-slot="spending-delta"]')).toBeNull()
    expect(rent).toHaveTextContent(
      `Pas encore ce mois-ci · ${euros(70_000)} au 1–3 oct.`,
    )
  })

  it('says where the data stops when the month has none yet', async () => {
    api.spendingControllerByCategory.mockReturnValue(
      ok({
        ...october,
        month: '2026-11',
        previousMonth: '2026-10',
        period: {
          month: '2026-11',
          dataUntil: '2026-10-28',
          status: 'empty',
          throughDay: null,
          previousMonth: '2026-10',
          previousUntil: null,
          defaultMonth: '2026-10',
        },
        totalCents: 0,
        transactionCount: 0,
        previousTotalCents: 0,
        averageTotalCents: null,
        oneOffCents: 0,
        categories: [],
      }),
    )
    renderPage({ month: '2026-11' })

    expect(
      await screen.findByText(
        'Vos données s’arrêtent au 28 oct. : importez un relevé plus récent ou changez de mois.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/vs octobre/)).not.toBeInTheDocument()
  })

  it('shows an empty state for a month without spending', async () => {
    api.spendingControllerByCategory.mockReturnValue(
      ok({
        ...october,
        totalCents: 0,
        transactionCount: 0,
        previousTotalCents: 0,
        oneOffCents: 0,
        categories: [],
      }),
    )
    api.spendingControllerTrend.mockReturnValue(
      ok(
        trend({
          series: [],
          totalsCents: [0, 0, 0],
          averageCents: null,
          averageMonths: 0,
        }),
      ),
    )
    renderPage()

    expect(
      await screen.findByText('Aucune dépense en octobre 2026'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Importer un relevé' }),
    ).toHaveAttribute('href', '/import')
    expect(
      await screen.findByText('Aucune dépense sur ces 3 mois'),
    ).toBeInTheDocument()
  })

  it('offers to include one-offs when they are the only spending', async () => {
    const user = userEvent.setup()
    api.spendingControllerByCategory.mockReturnValue(
      ok({ ...october, totalCents: 0, categories: [], oneOffCents: 40_000 }),
    )
    const { changes } = renderPage()

    await user.click(
      await screen.findByRole('button', {
        name: 'Inclure les dépenses ponctuelles',
      }),
    )
    expect(changes.at(-1)).toEqual({ month: '2026-10', oneOffs: true })
  })

  it('shows loading placeholders, then an error with a retry', async () => {
    const user = userEvent.setup()
    api.spendingControllerByCategory.mockReturnValue(
      Promise.resolve({
        error: { message: 'boom' },
        response: new Response(null, { status: 500 }),
      }),
    )
    renderPage()
    expect(
      screen.getByRole('generic', { name: 'Chargement des indicateurs' }),
    ).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Réessayer' }))
    expect(api.spendingControllerByCategory).toHaveBeenCalledTimes(2)
  })
})
