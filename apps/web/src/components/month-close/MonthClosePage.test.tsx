import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MonthCloseDto, MonthReportDto } from '#/api/types.gen'
import { centsToCsv, reportToCsv } from './csv'
import { MonthClosePage } from './MonthClosePage'

const api = vi.hoisted(() => ({
  monthCloseControllerGet: vi.fn(),
  monthCloseControllerUpdate: vi.fn(),
  monthCloseControllerClose: vi.fn(),
  monthCloseControllerReopen: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)

vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    search: _search,
    ...props
  }: {
    to: string
    params?: Record<string, string>
    search?: unknown
    children: ReactNode
  }) => (
    <a href={to.replace('$accountId', params?.accountId ?? '')} {...props}>
      {children}
    </a>
  ),
}))

/** Synthetic data only. */
const CHECKING_ID = '30000000-0000-4000-8000-000000000001'
const PEA_ID = '30000000-0000-4000-8000-000000000002'
const GROCERIES_ID = '30000000-0000-4000-8000-000000000003'

function report(overrides: Partial<MonthReportDto> = {}): MonthReportDto {
  return {
    month: '2026-10',
    flow: {
      month: '2026-10',
      until: '2026-10-31',
      incomeCents: 250_000,
      expenseCents: -40_000,
      netCents: 210_000,
      oneOffIncomeCents: 0,
      oneOffExpenseCents: 0,
      savingsRate: 0.84,
    },
    netWorthCents: 1_200_000,
    savingsTargetCents: 60_000,
    categories: [
      {
        categoryId: GROCERIES_ID,
        name: 'Courses test',
        color: '#16a34a',
        kind: 'expense',
        amountCents: 40_000,
        previousAmountCents: 30_000,
        targetCents: 35_000,
      },
    ],
    oneOffs: [],
    notes: null,
    ...overrides,
  }
}

function review(overrides: Partial<MonthCloseDto> = {}): MonthCloseDto {
  return {
    month: '2026-10',
    nextMonth: '2026-11',
    period: {
      month: '2026-10',
      dataUntil: '2026-11-03',
      status: 'complete',
      throughDay: null,
      previousMonth: '2026-09',
      previousUntil: null,
      defaultMonth: '2026-11',
    },
    closable: true,
    status: 'open',
    closedAt: null,
    notes: null,
    acknowledged: [],
    steps: [
      { key: 'imports', done: false },
      { key: 'review_queue', done: true },
      { key: 'recurring', done: true },
      { key: 'budget', done: false },
      { key: 'savings', done: false },
      { key: 'investments', done: false },
      { key: 'close', done: false },
    ],
    imports: {
      accounts: [
        {
          id: CHECKING_ID,
          name: 'Compte test',
          type: 'checking',
          lastDate: '2026-10-20',
          upToDate: false,
          missingDays: 11,
        },
      ],
      gaps: [
        {
          accountId: CHECKING_ID,
          accountName: 'Compte test',
          fromDate: '2026-10-02',
          toDate: '2026-10-09',
          differenceCents: -5_000,
        },
      ],
    },
    reviewQueue: { count: 0 },
    recurring: { suggestedCount: 0, priceChanges: [], chargedAfterEnd: [] },
    budget: {
      budgetCount: 1,
      targetCents: 35_000,
      spentCents: 40_000,
      remainingCents: -5_000,
      unbudgetedCents: 0,
      over: [
        {
          categoryId: GROCERIES_ID,
          slug: 'groceries',
          name: 'Courses test',
          color: null,
          icon: null,
          targetCents: 35_000,
          spentCents: 40_000,
          gapCents: 5_000,
        },
      ],
      under: [],
    },
    savings: {
      netCents: 210_000,
      targetCents: 60_000,
      gapCents: 150_000,
      goals: [],
    },
    investments: {
      accounts: [
        {
          id: PEA_ID,
          name: 'PEA test',
          type: 'brokerage',
          group: 'investments',
          lastDate: '2026-09-30',
        },
      ],
    },
    report: report(),
    closedReport: null,
    changes: [],
    ...overrides,
  }
}

function ok<T>(data: T) {
  return Promise.resolve({ data, response: { ok: true, status: 200 } })
}

const text = (value: string) => value.replace(/\s/g, ' ')

function step(key: string) {
  return document.querySelector(`li[data-step="${key}"]`) as HTMLElement
}

function renderPage(month = '2026-10') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MonthClosePage month={month} onMonthChange={vi.fn()} />
    </QueryClientProvider>,
  )
}

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  api.monthCloseControllerGet.mockImplementation(() => ok(review()))
})

describe('MonthClosePage', () => {
  it('lists the steps with their state, the progress and where to fix them', async () => {
    renderPage()

    expect(await screen.findByText('2 / 7 étapes faites')).toBeInTheDocument()
    expect(api.monthCloseControllerGet).toHaveBeenCalledWith(
      expect.objectContaining({ path: { month: '2026-10' } }),
    )

    const imports = step('imports')
    expect(imports).toHaveAttribute('data-done', 'false')
    expect(imports).toHaveTextContent('au 20 oct., 11 jours manquants')
    expect(imports).toHaveTextContent('entre le 2 oct. et le 9 oct.')
    expect(imports).toHaveTextContent(text('-50,00 €'))
    expect(
      within(imports).getByRole('link', { name: /Importer un relevé/ }),
    ).toHaveAttribute('href', '/import')

    expect(step('review_queue')).toHaveAttribute('data-done', 'true')
    expect(step('review_queue')).toHaveTextContent(
      'Toutes les opérations du mois sont rangées.',
    )

    const investments = step('investments')
    expect(investments).toHaveTextContent('Valeur au 30 sept.')
    expect(
      within(investments).getByRole('button', {
        name: 'Mettre à jour « PEA test »',
      }),
    ).toBeInTheDocument()

    // The live report, with its highlights.
    const reportCard = screen.getByRole('region', {
      name: /Rapport d’octobre 2026/,
    })
    expect(reportCard).toHaveTextContent(
      'Chiffres actuels, figés à la clôture.',
    )
    expect(
      within(reportCard).getByRole('list', { name: 'Plus fortes hausses' }),
    ).toHaveTextContent(text('+100 €'))
    expect(
      within(reportCard).getByRole('list', { name: 'Au-dessus du budget' }),
    ).toHaveTextContent(text('50 € de trop'))
    expect(screen.getByText('Encore 4 étapes.')).toBeInTheDocument()
  })

  it('lists a cancelled subscription charged after its end date', async () => {
    api.monthCloseControllerGet.mockImplementation(() =>
      ok(
        review({
          recurring: {
            suggestedCount: 0,
            priceChanges: [],
            chargedAfterEnd: [
              {
                id: 'r1',
                name: 'Vidéo test',
                endedOn: '2026-10-01',
                chargedOn: '2026-10-15',
                amountCents: 999,
              },
            ],
          },
        }),
      ),
    )
    renderPage()

    await screen.findByText('Prélevés après la résiliation')
    const recurring = step('recurring')
    expect(recurring).toHaveTextContent('Prélevés après la résiliation')
    expect(recurring).toHaveTextContent('Vidéo test')
    expect(recurring).toHaveTextContent(text('9,99 €'))
    expect(
      within(recurring).getByRole('link', { name: /Voir les abonnements/ }),
    ).toHaveAttribute('href', '/subscriptions')
    expect(
      within(recurring).getByRole('checkbox', { name: 'Prélèvements vus' }),
    ).toBeInTheDocument()
  })

  it('saves a tick and the notes', async () => {
    const user = userEvent.setup()
    api.monthCloseControllerUpdate.mockImplementation(
      ({ body }: { body: Partial<MonthCloseDto> }) =>
        ok(
          review({
            ...body,
            steps: review().steps.map((s) =>
              s.key === 'budget' && body.acknowledged?.includes('budget')
                ? { ...s, done: true }
                : s,
            ),
          }),
        ),
    )
    renderPage()

    await user.click(
      await screen.findByRole('checkbox', { name: 'Budget relu' }),
    )
    expect(api.monthCloseControllerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { month: '2026-10' },
        body: { acknowledged: ['budget'] },
      }),
    )
    await waitFor(() =>
      expect(step('budget')).toHaveAttribute('data-done', 'true'),
    )
    expect(screen.getByText('3 / 7 étapes faites')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Notes du mois'), '  Mois calme.  ')
    await user.tab()
    expect(api.monthCloseControllerUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: { notes: 'Mois calme.' } }),
    )
  })

  it('confirms a close with steps left, then shows the frozen report', async () => {
    const user = userEvent.setup()
    api.monthCloseControllerClose.mockImplementation(() =>
      ok(
        review({
          status: 'closed',
          closedAt: '2026-11-05T10:00:00.000Z',
          notes: 'Bon mois',
          closedReport: report({ notes: 'Bon mois' }),
        }),
      ),
    )
    renderPage()

    await user.type(await screen.findByLabelText('Notes du mois'), 'Bon mois')
    await user.click(screen.getByRole('button', { name: 'Clôturer le mois' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Il reste 4 étapes à faire.')
    await user.click(within(dialog).getByRole('button', { name: 'Clôturer' }))

    expect(api.monthCloseControllerClose).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { month: '2026-10' },
        body: { notes: 'Bon mois' },
      }),
    )
    expect(
      await screen.findByRole('button', { name: 'Rouvrir le mois' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Clôturé')).toBeInTheDocument()
    expect(screen.getByLabelText('Notes du mois')).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Budget relu' })).toBeDisabled()
    const reportCard = screen.getByRole('region', {
      name: /Rapport d’octobre 2026/,
    })
    expect(reportCard).toHaveTextContent('Figé à la clôture, le 5 nov.')
    expect(reportCard).toHaveTextContent('Bon mois')
  })

  it('closes at once when every step is done', async () => {
    const user = userEvent.setup()
    api.monthCloseControllerGet.mockImplementation(() =>
      ok(
        review({
          steps: review().steps.map((s) => ({
            ...s,
            done: s.key !== 'close',
          })),
        }),
      ),
    )
    api.monthCloseControllerClose.mockImplementation(() =>
      ok(review({ status: 'closed', closedAt: '2026-11-05T10:00:00.000Z' })),
    )
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Clôturer le mois' }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.monthCloseControllerClose).toHaveBeenCalledWith(
      expect.objectContaining({ body: { notes: null } }),
    )
  })

  it('flags the figures changed since the close and reopens the month', async () => {
    const user = userEvent.setup()
    api.monthCloseControllerGet.mockImplementation(() =>
      ok(
        review({
          status: 'closed',
          closedAt: '2026-11-05T10:00:00.000Z',
          closedReport: report(),
          report: report({
            flow: {
              ...report().flow,
              expenseCents: -44_000,
              netCents: 206_000,
            },
          }),
          changes: [
            {
              field: 'expense',
              kind: null,
              categoryId: null,
              name: null,
              closedCents: -40_000,
              currentCents: -44_000,
            },
            {
              field: 'category',
              kind: 'expense',
              categoryId: GROCERIES_ID,
              name: 'Courses test',
              closedCents: 40_000,
              currentCents: 44_000,
            },
          ],
        }),
      ),
    )
    api.monthCloseControllerReopen.mockImplementation(() => ok(review()))
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Modifié depuis la clôture')
    expect(alert).toHaveTextContent(text('Dépenses-400,00 € → -440,00 €'))
    expect(alert).toHaveTextContent(
      text('Courses test (dépense)400,00 € → 440,00 €'),
    )
    // The report keeps the figures of the close.
    expect(
      screen.getByRole('region', { name: /Rapport d’octobre 2026/ }),
    ).toHaveTextContent(text('400 €'))

    await user.click(screen.getByRole('button', { name: 'Rouvrir le mois' }))
    expect(api.monthCloseControllerReopen).toHaveBeenCalledWith(
      expect.objectContaining({ path: { month: '2026-10' } }),
    )
    expect(
      await screen.findByRole('button', { name: 'Clôturer le mois' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not close a month that is not over', async () => {
    api.monthCloseControllerGet.mockImplementation(() =>
      ok(review({ month: '2026-11', closable: false })),
    )
    renderPage('2026-11')

    expect(
      await screen.findByRole('button', { name: 'Clôturer le mois' }),
    ).toBeDisabled()
    expect(screen.getByText('Le mois n’est pas terminé.')).toBeInTheDocument()
  })
})

describe('report CSV', () => {
  it('writes cents with a decimal comma, never through floats', () => {
    expect(centsToCsv(-123_456)).toBe('-1234,56')
    expect(centsToCsv(5)).toBe('0,05')
    expect(centsToCsv(null)).toBe('')
  })

  it('lists totals and categories, quoting what needs it', () => {
    const csv = reportToCsv(
      report({
        notes: 'Note; avec "guillemets"',
        oneOffs: [
          {
            transactionId: '30000000-0000-4000-8000-000000000009',
            date: '2026-10-18',
            label: 'MAGASIN TEST',
            amountCents: -60_000,
            categoryName: null,
          },
        ],
      }),
    )
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(
      'Rubrique;Libellé;Montant (€);Mois précédent (€);Budget (€)',
    )
    expect(lines).toContain('Total;Dépenses;-400,00;;')
    expect(lines).toContain('Dépense;Courses test;400,00;300,00;350,00')
    expect(lines).toContain('Ponctuel;2026-10-18 MAGASIN TEST;-600,00;;')
    expect(lines).toContain('Notes;"Note; avec ""guillemets""";;;')
  })

  it('keeps labels, category names and notes from becoming formulas', () => {
    const base = report()
    const csv = reportToCsv({
      ...base,
      notes: '=HYPERLINK("https://exemple.test";"Voir")',
      categories: [{ ...base.categories[0], name: '@Courses' }],
      oneOffs: [
        {
          transactionId: '30000000-0000-4000-8000-000000000009',
          date: '2026-10-18',
          label: '=HYPERLINK("https://exemple.test")',
          amountCents: -60_000,
          categoryName: null,
        },
      ],
    })
    const lines = csv.split('\r\n')
    expect(lines).toContain(
      `Notes;"'=HYPERLINK(""https://exemple.test"";""Voir"")";;;`,
    )
    expect(lines).toContain(`Dépense;"'@Courses";400,00;300,00;350,00`)
    expect(lines).toContain(
      'Ponctuel;"2026-10-18 =HYPERLINK(""https://exemple.test"")";-600,00;;',
    )
  })
})
