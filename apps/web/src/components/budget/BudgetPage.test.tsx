import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BudgetHistoryDto,
  BudgetLineDto,
  BudgetMonthDto,
  BudgetSuggestionsDto,
  CategoryDto,
} from '#/api/types.gen'
import { BudgetPage } from './BudgetPage'

const api = vi.hoisted(() => ({
  categoriesControllerList: vi.fn(),
  budgetsControllerMonth: vi.fn(),
  budgetsControllerHistory: vi.fn(),
  budgetsControllerSuggest: vi.fn(),
  budgetsControllerUpsert: vi.fn(),
  budgetsControllerRemove: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)

vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast }))
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
    <a href={`${to}?${new URLSearchParams(search).toString()}`} {...props}>
      {children}
    </a>
  ),
}))

/** Testing Library collapses the narrow no-break spaces `Intl` emits. */
const text = (value: string) => value.replace(/\s/g, ' ')

/** Synthetic data only. */
function category(
  n: number,
  name: string,
  kind: CategoryDto['kind'],
): CategoryDto {
  return {
    id: `c0000000-0000-4000-8000-00000000000${n}`,
    slug: name.toLowerCase(),
    name,
    kind,
    color: '#d97706',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
const groceries = category(1, 'Courses', 'expense')
const leisure = category(2, 'Loisirs', 'expense')
const transport = category(3, 'Transport', 'expense')
const salary = category(4, 'Salaire', 'income')

function line(
  c: CategoryDto,
  targetCents: number,
  spentCents: number,
  status: BudgetLineDto['status'],
): BudgetLineDto {
  return {
    categoryId: c.id,
    slug: c.slug,
    name: c.name,
    color: c.color,
    targetCents,
    effectiveFrom: '2026-09',
    note: null,
    spentCents,
    spentExcludingOneOffsCents: spentCents,
    remainingCents: targetCents - spentCents,
    percentUsed: Math.round((spentCents * 1000) / targetCents) / 10,
    status,
  }
}

const monthData: BudgetMonthDto = {
  month: '2026-10',
  period: {
    month: '2026-10',
    dataUntil: '2026-11-03',
    status: 'complete',
    throughDay: null,
    previousMonth: '2026-09',
    previousUntil: '2026-09-30',
    defaultMonth: '2026-11',
  },
  items: [
    {
      ...line(leisure, 10_000, 15_000, 'over'),
      spentExcludingOneOffsCents: 5_000,
    },
    line(groceries, 40_000, 20_000, 'ok'),
  ],
  totals: {
    targetCents: 50_000,
    spentCents: 35_000,
    spentExcludingOneOffsCents: 25_000,
    remainingCents: 15_000,
    percentUsed: 70,
    status: 'ok',
    budgetCount: 2,
    overCount: 1,
    warningCount: 0,
  },
  unbudgeted: {
    totalCents: 8_000,
    categoryCount: 2,
    top: [
      {
        categoryId: transport.id,
        slug: transport.slug,
        name: transport.name,
        color: transport.color,
        budgetable: true,
        spentCents: 6_000,
      },
      {
        categoryId: null,
        slug: null,
        name: null,
        color: null,
        budgetable: false,
        spentCents: 2_000,
      },
    ],
  },
}

const emptyMonth: BudgetMonthDto = {
  ...monthData,
  items: [],
  totals: {
    ...monthData.totals,
    targetCents: 0,
    spentCents: 0,
    budgetCount: 0,
    overCount: 0,
  },
  unbudgeted: { totalCents: 0, categoryCount: 0, top: [] },
}

const history: BudgetHistoryDto = {
  months: ['2026-09', '2026-10'],
  categories: [
    {
      categoryId: leisure.id,
      slug: leisure.slug,
      name: leisure.name,
      color: leisure.color,
      months: [
        {
          month: '2026-09',
          targetCents: 10_000,
          spentCents: 9_000,
          status: 'warning',
        },
        {
          month: '2026-10',
          targetCents: 10_000,
          spentCents: 15_000,
          status: 'over',
        },
      ],
    },
  ],
  totals: [
    {
      month: '2026-09',
      targetCents: 10_000,
      spentCents: 9_000,
      status: 'warning',
    },
    {
      month: '2026-10',
      targetCents: 10_000,
      spentCents: 15_000,
      status: 'over',
    },
  ],
}

const suggestions: BudgetSuggestionsDto = {
  month: '2026-10',
  months: ['2026-07', '2026-08', '2026-09'],
  monthsWithData: 3,
  items: [
    {
      categoryId: groceries.id,
      slug: groceries.slug,
      name: groceries.name,
      color: groceries.color,
      averageCents: 31_183,
      suggestedCents: 31_200,
      currentTargetCents: null,
    },
    {
      categoryId: leisure.id,
      slug: leisure.slug,
      name: leisure.name,
      color: leisure.color,
      averageCents: 9_950,
      suggestedCents: 10_000,
      currentTargetCents: 12_000,
    },
  ],
}

function ok<T>(data: T) {
  return Promise.resolve({
    data,
    response: new Response(null, { status: 200 }),
  })
}

/** `null`: no month in the URL (the API picks it). */
function renderPage(month: string | null = '2026-10') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const onMonthChange = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <BudgetPage month={month ?? undefined} onMonthChange={onMonthChange} />
    </QueryClientProvider>,
  )
  return { onMonthChange }
}

describe('BudgetPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-15T10:00:00Z'))
    for (const fn of Object.values(api)) fn.mockReset()
    api.categoriesControllerList.mockImplementation(() =>
      ok([groceries, leisure, transport, salary]),
    )
    api.budgetsControllerMonth.mockImplementation(() => ok(monthData))
    api.budgetsControllerHistory.mockImplementation(() => ok(history))
    api.budgetsControllerSuggest.mockImplementation(() => ok(suggestions))
    api.budgetsControllerUpsert.mockImplementation(
      ({ body }: { body: { monthlyTargetCents: number } }) =>
        ok({ id: 'b', monthlyTargetCents: body.monthlyTargetCents }),
    )
    api.budgetsControllerRemove.mockImplementation(() =>
      Promise.resolve({
        data: undefined,
        response: new Response(null, { status: 204 }),
      }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the month totals and the budgets, overruns flagged', async () => {
    renderPage()

    const list = await screen.findByRole('list', {
      name: 'Budgets par catégorie',
    })
    expect(api.budgetsControllerMonth).toHaveBeenCalledWith(
      expect.objectContaining({ query: { month: '2026-10' } }),
    )
    const rows = within(list).getAllByRole('listitem')
    // API order: highest share used first.
    expect(rows[0]).toHaveAttribute('data-status', 'over')
    expect(within(rows[0]).getByText('Loisirs')).toBeInTheDocument()
    expect(text(rows[0].textContent)).toContain('Dépassement de 50 €')
    expect(text(rows[0].textContent)).toContain('dont ponctuel 100,00 €')
    expect(rows[1]).toHaveAttribute('data-status', 'ok')
    expect(text(rows[1].textContent)).toContain('Reste 200 €')

    // Tapping a row opens the same expenses on the transactions page.
    expect(
      within(rows[0]).getByRole('link', { name: 'Opérations Loisirs' }),
    ).toHaveAttribute(
      'href',
      `/transactions?month=2026-10&category=${leisure.id}&kind=expense`,
    )

    const total = screen.getByRole('meter', { name: 'Total' })
    expect(total).toHaveAttribute('aria-valuenow', '35000')
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    // Spending outside the budgets, uncategorized included.
    const outside = screen.getByRole('list', { name: 'Dépenses hors budget' })
    expect(within(outside).getByText('Sans catégorie')).toBeInTheDocument()
    expect(
      within(outside).getByRole('button', {
        name: 'Ajouter un budget Transport',
      }),
    ).toBeInTheDocument()
  })

  it('shows the month the API picks and how far its data goes', async () => {
    api.budgetsControllerMonth.mockImplementation(() =>
      ok({
        ...monthData,
        period: {
          ...monthData.period,
          dataUntil: '2026-10-28',
          status: 'partial',
          throughDay: 28,
          previousUntil: '2026-09-28',
          defaultMonth: '2026-10',
        },
      }),
    )
    renderPage(null)

    expect(
      await screen.findByText(
        'Données jusqu’au 28 oct. seulement, comparées au 1–28 sept.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Octobre 2026')).toBeInTheDocument()
    expect(api.budgetsControllerMonth).toHaveBeenCalledWith({
      throwOnError: false,
    })
    // The history follows the month shown.
    await waitFor(() =>
      expect(api.budgetsControllerHistory).toHaveBeenCalledWith(
        expect.objectContaining({ query: { month: '2026-10', months: 6 } }),
      ),
    )
  })

  it('moves between months, not past the current one', async () => {
    const user = userEvent.setup()
    const { onMonthChange } = renderPage('2026-11')
    await screen.findByText('Novembre 2026')

    expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Mois précédent' }))
    expect(onMonthChange).toHaveBeenCalledWith('2026-10')
  })

  it('edits a target from the month shown', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Modifier le budget Courses' }),
    )
    const dialog = await screen.findByRole('dialog')
    const amount = within(dialog).getByLabelText('Objectif par mois')
    expect(amount).toHaveValue('400')
    await user.clear(amount)
    await user.type(amount, 'abc')
    await user.click(
      within(dialog).getByRole('button', { name: 'Enregistrer' }),
    )
    expect(within(dialog).getByText(/Montant invalide/)).toBeInTheDocument()
    expect(api.budgetsControllerUpsert).not.toHaveBeenCalled()

    await user.clear(amount)
    await user.type(amount, '350,50')
    await user.click(
      within(dialog).getByRole('button', { name: 'Enregistrer' }),
    )

    await waitFor(() =>
      expect(api.budgetsControllerUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { categoryId: groceries.id },
          body: {
            monthlyTargetCents: 35_050,
            effectiveFrom: '2026-10',
            note: null,
          },
        }),
      ),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    // Every budget view is refetched.
    expect(api.budgetsControllerMonth.mock.calls.length).toBeGreaterThan(1)
  })

  it('adds a budget for an unbudgeted category', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', {
        name: 'Ajouter un budget Transport',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Catégorie')).toHaveValue(transport.id)
    // Only expense categories without a budget are offered.
    const options = within(dialog)
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(options).toEqual(['Transport'])
    await user.type(within(dialog).getByLabelText('Objectif par mois'), '80')
    await user.click(
      within(dialog).getByRole('button', { name: 'Enregistrer' }),
    )

    await waitFor(() =>
      expect(api.budgetsControllerUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { categoryId: transport.id },
          body: expect.objectContaining({ monthlyTargetCents: 8_000 }),
        }),
      ),
    )
  })

  it('stops a budget from the month shown after confirmation', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Modifier le budget Loisirs' }),
    )
    await user.click(
      await screen.findByRole('button', { name: 'Arrêter ce budget' }),
    )
    const confirm = await screen.findByRole('dialog', {
      name: 'Arrêter le budget Loisirs ?',
    })
    await user.click(
      within(confirm).getByRole('button', { name: 'Arrêter le budget' }),
    )

    await waitFor(() =>
      expect(api.budgetsControllerRemove).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { categoryId: leisure.id },
          query: { from: '2026-10' },
        }),
      ),
    )
  })

  it('offers suggestions when there is no budget yet', async () => {
    api.budgetsControllerMonth.mockImplementation(() => ok(emptyMonth))
    api.budgetsControllerHistory.mockImplementation(() =>
      ok({ months: history.months, categories: [], totals: [] }),
    )
    const user = userEvent.setup()
    renderPage()

    expect(
      await screen.findByText('Aucun budget en octobre 2026'),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Proposer des budgets' }),
    )

    const sheet = await screen.findByRole('dialog', {
      name: 'Proposer des budgets',
    })
    await within(sheet).findByText('Courses')
    expect(api.budgetsControllerSuggest).toHaveBeenCalledWith(
      expect.objectContaining({ query: { month: '2026-10', months: 3 } }),
    )
    // Pre-ticked only where there is no target yet.
    const groceriesBox = within(sheet).getByRole('checkbox', {
      name: 'Courses',
    })
    const leisureBox = within(sheet).getByRole('checkbox', { name: 'Loisirs' })
    expect(groceriesBox).toBeChecked()
    expect(leisureBox).not.toBeChecked()
    expect(within(sheet).getByLabelText('Objectif Courses')).toHaveValue('312')

    // Adjusting an amount ticks it.
    const leisureAmount = within(sheet).getByLabelText('Objectif Loisirs')
    await user.clear(leisureAmount)
    await user.type(leisureAmount, '90')
    expect(leisureBox).toBeChecked()

    await user.click(
      within(sheet).getByRole('button', { name: 'Enregistrer 2 budgets' }),
    )
    await waitFor(() =>
      expect(api.budgetsControllerUpsert).toHaveBeenCalledTimes(2),
    )
    expect(api.budgetsControllerUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { categoryId: groceries.id },
        body: expect.objectContaining({
          monthlyTargetCents: 31_200,
          effectiveFrom: '2026-10',
        }),
      }),
    )
    expect(api.budgetsControllerUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { categoryId: leisure.id },
        body: expect.objectContaining({ monthlyTargetCents: 9_000 }),
      }),
    )
  })

  it('shows the history with overruns in red and in words', async () => {
    renderPage()

    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row')
    // Header, Loisirs, total.
    expect(rows).toHaveLength(3)
    const cells = within(rows[1]).getAllByRole('cell')
    expect(text(cells[0].textContent)).toBe('90 €/ 100 €')
    expect(cells[1]).toHaveClass('text-chart-delta-bad')
    expect(within(cells[1]).getByText('(dépassement)')).toBeInTheDocument()
  })
})
