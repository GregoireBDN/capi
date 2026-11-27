import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  IntegrityDto,
  MonthCloseDto,
  MonthReportDto,
} from '#/api/types.gen'
import { centsToCsv, reportToCsv } from './csv'
import { MonthClosePage } from './MonthClosePage'

const api = vi.hoisted(() => ({
  integrityControllerCheck: vi.fn(),
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
        icon: 'shopping-cart',
        kind: 'expense',
        amountCents: 40_000,
        previousAmountCents: 30_000,
        targetCents: 35_000,
      },
    ],
    oneOffs: [],
    notes: null,
    plan: null,
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
      { key: 'budget', done: true },
      { key: 'savings', done: true },
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
    income: { plannedCents: 0, receivedCents: 0, shortfalls: [] },
    savings: {
      netCents: 210_000,
      targetCents: 60_000,
      gapCents: 150_000,
      envelopes: [],
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

function integrity(overrides: Partial<IntegrityDto> = {}): IntegrityDto {
  return {
    month: '2026-10',
    checks: (['balances', 'crypto', 'owed', 'totals'] as const).map((key) => ({
      key,
      scope: key === 'crypto' || key === 'owed' ? 'current' : 'month',
      status: 'ok',
      count: 0,
    })),
    findings: [],
    ...overrides,
  }
}

/** A fix's round icon, by its accessible name. */
const fix = (name: RegExp) => screen.getByRole('button', { name })

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
  api.integrityControllerCheck.mockImplementation(() => ok(integrity()))
})

describe('MonthClosePage', () => {
  it('answers first: saved, income, expenses against the month before, the budget', async () => {
    renderPage()

    const answer = await screen.findByRole('region', {
      name: 'Le mois en bref',
    })
    expect(api.monthCloseControllerGet).toHaveBeenCalledWith(
      expect.objectContaining({ path: { month: '2026-10' } }),
    )
    expect(answer).toHaveTextContent(text('+2 100 €'))
    expect(answer).toHaveTextContent('épargnés · 84 %')
    expect(answer).toHaveTextContent(text('objectif 600 €'))
    expect(answer).toHaveTextContent(text('Revenus2 500 €'))
    expect(answer).toHaveTextContent(text('en hausse de 100 €400 €'))
    expect(answer).toHaveTextContent(text('400 € / 350 €'))

    const top = screen.getByRole('region', { name: 'Plus grosses dépenses' })
    expect(top).toHaveTextContent(text('Courses test400 €'))
  })

  it('shows only the steps left, never budget or savings', async () => {
    renderPage()

    const fixes = await screen.findByRole('region', { name: 'À régler' })
    const names = within(fixes)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
    expect(names).toEqual([
      'Relevés importés : 11',
      'Valeur des placements : 1',
    ])
  })

  it('opens a step left in its sheet', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /^Relevés/ }))
    let sheet = await screen.findByRole('dialog')
    expect(sheet).toHaveTextContent('au 20 oct., 11 jours manquants')
    expect(sheet).toHaveTextContent('entre le 2 oct. et le 9 oct.')
    expect(sheet).toHaveTextContent(text('-50,00 €'))
    expect(
      within(sheet).getByRole('link', { name: /Importer un relevé/ }),
    ).toHaveAttribute('href', '/import')

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    await user.click(fix(/^Valeur des placements/))
    sheet = await screen.findByRole('dialog')
    expect(sheet).toHaveTextContent('Valeur au 30 sept.')
    expect(
      within(sheet).getByRole('button', { name: 'Mettre à jour « PEA test »' }),
    ).toBeInTheDocument()
  })

  it('goes straight to the operations and subscriptions to review', async () => {
    api.monthCloseControllerGet.mockImplementation(() =>
      ok(
        review({
          steps: review().steps.map((s) =>
            s.key === 'review_queue' || s.key === 'recurring'
              ? { ...s, done: false }
              : s,
          ),
          reviewQueue: { count: 3 },
          recurring: {
            suggestedCount: 2,
            priceChanges: [],
            chargedAfterEnd: [],
          },
        }),
      ),
    )
    renderPage()

    expect(
      await screen.findByRole('link', { name: 'Opérations à revoir : 3' }),
    ).toHaveAttribute('href', '/transactions')
    expect(
      screen.getByRole('link', { name: 'Abonnements et prélèvements : 2' }),
    ).toHaveAttribute('href', '/subscriptions')
  })

  it('lists the integrity findings with their account and day (#427)', async () => {
    const user = userEvent.setup()
    api.integrityControllerCheck.mockImplementation(() =>
      ok(
        integrity({
          checks: integrity().checks.map((check) =>
            check.key === 'balances'
              ? { ...check, status: 'findings', count: 1 }
              : check.key === 'crypto'
                ? { ...check, status: 'failed' }
                : check,
          ),
          findings: [
            {
              check: 'balances',
              code: 'balance_gap',
              accountId: CHECKING_ID,
              accountName: 'Compte test',
              date: '2026-10-20',
              fromDate: '2026-10-05',
              amountCents: -500,
              transactionId: null,
              asset: null,
              quantity: null,
              readQuantity: null,
            },
          ],
        }),
      ),
    )
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Cohérence des chiffres : 1' }),
    )
    const sheet = await screen.findByRole('dialog')
    expect(
      within(sheet).getByRole('link', { name: 'Compte test' }),
    ).toHaveAttribute('href', `/accounts/${CHECKING_ID}`)
    expect(sheet).toHaveTextContent('· 20 oct.')
    expect(sheet).toHaveTextContent(
      'Le solde recalculé ne suit plus celui de la banque depuis le 5 oct.',
    )
    expect(sheet).toHaveTextContent(text('-5,00 €'))
    expect(sheet).toHaveTextContent('Non vérifié : crypto.')
  })

  it('never holds the review back when the checks fail to load', async () => {
    const user = userEvent.setup()
    api.integrityControllerCheck.mockImplementation(() =>
      Promise.resolve({
        data: undefined,
        error: {},
        response: { ok: false, status: 500 },
      }),
    )
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Cohérence des chiffres' }),
    )
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'La vérification n’a pas pu se faire.',
    )
  })

  it('marks the planned income on the answer, the plan in the full report (#315)', async () => {
    const user = userEvent.setup()
    const FAMILY_ID = '30000000-0000-4000-8000-000000000005'
    api.monthCloseControllerGet.mockImplementation(() =>
      ok(
        review({
          report: report({
            categories: [
              ...report().categories,
              {
                categoryId: FAMILY_ID,
                name: 'Famille test',
                color: null,
                icon: null,
                kind: 'income',
                amountCents: 0,
                previousAmountCents: 25_000,
                targetCents: 25_000,
              },
            ],
            plan: {
              plannedIncomeCents: 265_000,
              receivedIncomeCents: 250_000,
              budgetedExpensesCents: 35_000,
              plannedSavingsCents: 230_000,
              actualSavingsCents: 210_000,
            },
          }),
        }),
      ),
    )
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Tout voir' }))
    const reportCard = await screen.findByRole('region', {
      name: /Rapport d’octobre 2026/,
    })
    expect(
      within(reportCard).getByRole('list', { name: 'Prévu et réalisé' }),
    ).toHaveTextContent(text('Revenus2 500 € / 2 650 € prévus'))
    expect(
      within(reportCard).getByRole('list', {
        name: 'Revenus en dessous du prévu',
      }),
    ).toHaveTextContent('Famille testpas reçu')
  })

  it('ticks the subscriptions charged after their end date as seen', async () => {
    const user = userEvent.setup()
    const charged = {
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
    }
    api.monthCloseControllerGet.mockImplementation(() =>
      ok(
        review({
          steps: review().steps.map((s) =>
            s.key === 'recurring' ? { ...s, done: false } : s,
          ),
          recurring: charged,
        }),
      ),
    )
    api.monthCloseControllerUpdate.mockImplementation(
      ({ body }: { body: Partial<MonthCloseDto> }) =>
        ok(review({ ...body, recurring: charged })),
    )
    renderPage()

    await user.click(
      await screen.findByRole('button', {
        name: 'Abonnements et prélèvements : 1',
      }),
    )
    const sheet = await screen.findByRole('dialog')
    expect(sheet).toHaveTextContent('Prélevés après la résiliation')
    expect(sheet).toHaveTextContent('Vidéo test')
    expect(sheet).toHaveTextContent(text('9,99 €'))
    await user.click(within(sheet).getByRole('button', { name: 'Vu' }))
    expect(api.monthCloseControllerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { month: '2026-10' },
        body: { acknowledged: ['recurring'] },
      }),
    )
  })

  it('saves the notes from their sheet', async () => {
    const user = userEvent.setup()
    api.monthCloseControllerUpdate.mockImplementation(
      ({ body }: { body: Partial<MonthCloseDto> }) => ok(review({ ...body })),
    )
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Note du mois' }),
    )
    await user.type(
      await screen.findByLabelText('Note du mois', { selector: 'textarea' }),
      '  Mois calme.  ',
    )
    await user.tab()
    expect(api.monthCloseControllerUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: { notes: 'Mois calme.' } }),
    )
  })

  it('confirms a close with steps left, then shows the frozen month', async () => {
    const user = userEvent.setup()
    api.monthCloseControllerClose.mockImplementation(() =>
      ok(
        review({
          status: 'closed',
          closedAt: '2026-11-05T10:00:00.000Z',
          closedReport: report(),
        }),
      ),
    )
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Clôturer' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Il reste 2 choses à régler.')
    await user.click(within(dialog).getByRole('button', { name: 'Clôturer' }))

    expect(api.monthCloseControllerClose).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { month: '2026-10' },
        body: { notes: null },
      }),
    )
    expect(
      await screen.findByRole('button', { name: 'Rouvrir' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Clôturé')).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'À régler' }),
    ).not.toBeInTheDocument()
  })

  it('closes in one tap when nothing is left', async () => {
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

    expect(await screen.findByText('Tout est en ordre')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clôturer octobre' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.monthCloseControllerClose).toHaveBeenCalledWith(
      expect.objectContaining({ body: { notes: null } }),
    )
  })

  it('keeps the figures of the close, flags what changed and reopens', async () => {
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

    // The answer keeps the figures of the close.
    expect(
      await screen.findByRole('region', { name: 'Le mois en bref' }),
    ).toHaveTextContent(text('+2 100 €'))

    await user.click(
      screen.getByRole('button', { name: 'Modifié depuis la clôture' }),
    )
    const sheet = await screen.findByRole('dialog')
    expect(sheet).toHaveTextContent(text('Dépenses-400,00 € → -440,00 €'))
    expect(sheet).toHaveTextContent(
      text('Courses test (dépense)400,00 € → 440,00 €'),
    )
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Rouvrir' }))
    expect(api.monthCloseControllerReopen).toHaveBeenCalledWith(
      expect.objectContaining({ path: { month: '2026-10' } }),
    )
    expect(
      await screen.findByRole('button', { name: 'Clôturer' }),
    ).toBeInTheDocument()
  })

  it('does not close a month that is not over', async () => {
    api.monthCloseControllerGet.mockImplementation(() =>
      ok(review({ month: '2026-11', closable: false })),
    )
    renderPage('2026-11')

    expect(
      await screen.findByRole('button', { name: 'Mois pas terminé' }),
    ).toBeDisabled()
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
    expect(lines).toContain('Exceptionnel;2026-10-18 MAGASIN TEST;-600,00;;')
    expect(lines).toContain('Notes;"Note; avec ""guillemets""";;;')
    // No plan in a report frozen before planned income.
    expect(csv).not.toContain('Revenus prévus')
    const planned = reportToCsv(
      report({
        plan: {
          plannedIncomeCents: 265_000,
          receivedIncomeCents: 250_000,
          budgetedExpensesCents: 35_000,
          plannedSavingsCents: 230_000,
          actualSavingsCents: 210_000,
        },
      }),
    ).split('\r\n')
    expect(planned).toContain('Total;Revenus prévus;2650,00;;')
    expect(planned).toContain('Total;Épargne prévue;2300,00;;')
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
      'Exceptionnel;"2026-10-18 =HYPERLINK(""https://exemple.test"")";-600,00;;',
    )
  })
})
