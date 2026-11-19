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
    icon: 'shopping-cart',
    spentCents: 0,
    share: 0,
    transactionCount: 0,
    previousSpentCents: 0,
    deltaCents: 0,
    averageCents: null,
    notYetThisMonth: false,
    targetCents: null,
    expectedCents: 0,
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
  expectedCents: 0,
  categories: [
    spending({
      categoryId: RENT,
      slug: 'rent',
      name: 'Loyer',
      color: '#dc2626',
      icon: 'house',
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
      icon: null,
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
        icon: 'house',
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
    expect(within(kpis).getByText('Écart avec septembre')).toBeInTheDocument()
    expect(within(kpis).getByText(`+${euros(10_000)}`)).toBeInTheDocument()
    expect(within(kpis).getByText('Écart avec la moyenne')).toBeInTheDocument()
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
    // Without a budget: the share of the month.
    expect(links[1]).toHaveTextContent(/25 % du total/)
    // One comparison, named once above the list and after each change for
    // screen readers.
    expect(
      document.querySelector('[data-slot="comparison-caption"]'),
    ).toHaveTextContent('Écart avec septembre')
    expect(links[1]).toHaveTextContent(/par rapport à septembre/)
    expect(
      links[1].querySelectorAll('[data-slot="spending-delta"]'),
    ).toHaveLength(1)
    // Each row fills the space between the rules (#291): square, its focus
    // ring inside it.
    for (const link of links) {
      expect(link.className).not.toMatch(/rounded/)
      expect(link).toHaveClass('focus-visible:ring-inset')
    }
  })

  it('shows each category with its icon, in the ranking and the legends (#287)', async () => {
    renderPage({ month: '2026-10' })

    const list = await screen.findByRole('list', {
      name: 'Dépenses par catégorie',
    })
    const glyphs = within(list)
      .getAllByRole('link')
      .map((link) => {
        const icon = link.querySelector('[data-slot="category-icon"]')
        expect(icon).toHaveAttribute('aria-hidden', 'true')
        return icon?.querySelector('svg')?.getAttribute('class')
      })
    expect(glyphs).toEqual([
      expect.stringContaining('lucide-house'),
      expect.stringContaining('lucide-shopping-cart'),
      // No category: a question mark.
      expect.stringContaining('lucide-circle-question-mark'),
    ])
    // Rent's colour tints its tile.
    const rent = within(list)
      .getAllByRole('link')[0]
      .querySelector<HTMLElement>('[data-slot="category-icon"]')!
    expect(rent.style.backgroundColor).toContain('rgb(220, 38, 38)')

    // The donut and trend legends draw the icons too, no colour squares.
    const legends = await screen.findAllByRole('list', { name: 'Légende' })
    for (const legend of legends) {
      expect(
        legend.querySelectorAll('[data-slot="category-icon"]').length,
      ).toBe(within(legend).getAllByRole('listitem').length)
    }
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
    expect(within(kpis).getByText('Écart avec le 1–3 oct.')).toBeInTheDocument()
    expect(kpis).toHaveTextContent(/au 1–3 oct\./)
    expect(kpis).toHaveTextContent(/mêmes jours/)
    expect(
      screen.getByText(
        'Mois en cours : données jusqu’au 3 nov., comparées au 1–3 oct.',
      ),
    ).toBeInTheDocument()

    // Nothing spent in rent yet: folded away with the empty categories.
    const user = userEvent.setup()
    const list = screen.getByRole('list', { name: 'Dépenses par catégorie' })
    expect(within(list).queryByRole('link', { name: /Loyer/ })).toBeNull()
    await user.click(
      screen.getByRole('button', {
        name: 'Afficher les catégories sans dépense (1)',
      }),
    )
    const rent = within(list).getByRole('link', { name: /Loyer/ })
    // Not paid yet: no green "saving".
    expect(rent.querySelector('[data-slot="spending-delta"]')).toBeNull()
    expect(rent).toHaveTextContent('Pas encore ce mois-ci')
    await user.click(
      screen.getByRole('button', {
        name: 'Masquer les catégories sans dépense',
      }),
    )
    expect(within(list).queryByRole('link', { name: /Loyer/ })).toBeNull()
  })

  it('shows the budget target, the expected costs and one comparison at a time', async () => {
    const user = userEvent.setup()
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
        totalCents: 36_000,
        previousTotalCents: 30_000,
        averageTotalCents: 32_000,
        oneOffCents: 0,
        expectedCents: 81_399,
        categories: [
          // Over its budget, with a subscription still expected.
          spending({
            categoryId: LEISURE,
            slug: 'leisure',
            name: 'Loisirs',
            color: '#c026d3',
            spentCents: 24_000,
            share: 24_000 / 36_000,
            transactionCount: 3,
            previousSpentCents: 20_000,
            deltaCents: 4_000,
            averageCents: 25_000,
            targetCents: 20_000,
            expectedCents: 1_399,
          }),
          // Within its budget.
          spending({
            spentCents: 12_000,
            share: 12_000 / 36_000,
            transactionCount: 2,
            previousSpentCents: 10_000,
            deltaCents: 2_000,
            averageCents: 15_000,
            targetCents: 40_000,
          }),
          // Rent expected on the 5th: nothing spent yet, not a saving.
          spending({
            categoryId: RENT,
            slug: 'rent',
            name: 'Loyer',
            color: '#dc2626',
            averageCents: 80_000,
            expectedCents: 80_000,
          }),
        ],
      }),
    )
    const { changes } = renderPage({})

    const list = await screen.findByRole('list', {
      name: 'Dépenses par catégorie',
    })
    const [leisure, groceries, rent] = within(list).getAllByRole('link')

    expect(groceries).toHaveTextContent(`30 % du budget (${euros(40_000)})`)
    expect(
      groceries.querySelector('[data-slot="category-bar"]'),
    ).toHaveAttribute('data-target', 'within')
    expect(leisure).toHaveTextContent(`120 % du budget (${euros(20_000)})`)
    expect(leisure.querySelector('[data-slot="category-bar"]')).toHaveAttribute(
      'data-target',
      'over',
    )

    // Expected costs are labelled as such, never as a saving.
    expect(leisure).toHaveTextContent(`${euros(1_399)} attendus`)
    expect(rent).toHaveTextContent(`${euros(0)}`)
    expect(rent).toHaveTextContent(`${euros(80_000)} attendus`)
    expect(rent.querySelector('[data-slot="spending-delta"]')).toBeNull()
    expect(rent.querySelector('[data-slot="not-yet"]')).toBeNull()
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent
            .replace(/\s/g, ' ')
            .includes(
              `Abonnements et charges fixes attendus d’ici la fin du mois : ${euros(81_399)}, non comptés.`.replace(
                /\s/g,
                ' ',
              ),
            ),
      ),
    ).toBeInTheDocument()

    // Previous month first (same first days while the month is partial).
    expect(
      document.querySelector('[data-slot="comparison-caption"]'),
    ).toHaveTextContent('Écart avec le 1–3 oct.')
    expect(within(groceries).getByText(`+${euros(2_000)}`)).toBeInTheDocument()
    expect(groceries).toHaveTextContent(/par rapport au 1–3 oct\./)

    // Then the average, kept in the URL.
    await user.click(screen.getByRole('radio', { name: 'Moyenne' }))
    expect(changes.at(-1)).toEqual({ cmp: 'avg' })
    expect(
      screen.getByText('Écart avec la moyenne sur 6 mois (mêmes jours)'),
    ).toBeInTheDocument()
    expect(within(groceries).getByText(`-${euros(3_000)}`)).toBeInTheDocument()
    expect(within(groceries).queryByText(`+${euros(2_000)}`)).toBeNull()
    expect(groceries).toHaveTextContent(/par rapport à la moyenne/)
    expect(rent.querySelector('[data-slot="spending-delta"]')).toBeNull()

    await user.click(screen.getByRole('radio', { name: 'Mois précédent' }))
    expect(changes.at(-1)).toEqual({})
  })

  it('switches the comparison with the arrow keys, never to nothing', async () => {
    const user = userEvent.setup()
    const { changes } = renderPage()

    const control = await screen.findByRole('radiogroup', {
      name: 'Comparer chaque catégorie avec',
    })
    const previous = within(control).getByRole('radio', {
      name: 'Mois précédent',
    })
    expect(previous).toHaveAttribute('aria-checked', 'true')

    // Pressing the selected segment again keeps it.
    await user.click(previous)
    expect(previous).toHaveAttribute('aria-checked', 'true')
    expect(changes).toEqual([])

    // An arrow key moves to « Moyenne » and selects it (?cmp=avg).
    await user.keyboard('{ArrowRight}')
    const average = within(control).getByRole('radio', { name: 'Moyenne' })
    expect(average).toHaveFocus()
    expect(changes.at(-1)).toMatchObject({ cmp: 'avg' })
    expect(average).toHaveAttribute('aria-checked', 'true')
  })

  it('keeps « Moyenne » disabled without averaged months', async () => {
    const user = userEvent.setup()
    api.spendingControllerByCategory.mockReturnValue(
      ok({ ...october, averageMonths: 0 }),
    )
    const { changes } = renderPage()

    const control = await screen.findByRole('radiogroup', {
      name: 'Comparer chaque catégorie avec',
    })
    expect(
      within(control).getByRole('radio', { name: 'Moyenne' }),
    ).toBeDisabled()
    const previous = within(control).getByRole('radio', {
      name: 'Mois précédent',
    })
    await user.click(previous)
    await user.keyboard('{ArrowRight}')
    expect(previous).toHaveFocus()
    expect(previous).toHaveAttribute('aria-checked', 'true')
    expect(changes).toEqual([])
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
