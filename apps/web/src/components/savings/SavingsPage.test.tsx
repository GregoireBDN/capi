import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AccountDto,
  SavingsGoalDto,
  SavingsMonthDto,
  SavingsOverviewDto,
} from '#/api/types.gen'
import { SavingsPage } from './SavingsPage'

const api = vi.hoisted(() => ({
  savingsControllerOverview: vi.fn(),
  savingsControllerListGoals: vi.fn(),
  savingsControllerSetTarget: vi.fn(),
  savingsControllerCreateGoal: vi.fn(),
  savingsControllerUpdateGoal: vi.fn(),
  savingsControllerRemoveGoal: vi.fn(),
  accountsControllerList: vi.fn(),
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
    <a href={to.replace('$accountId', params?.accountId ?? '')} {...props}>
      {children}
    </a>
  ),
}))

/** Synthetic data only. */
const LIVRET_ID = '20000000-0000-4000-8000-000000000001'
const PEA_ID = '20000000-0000-4000-8000-000000000002'

function month(
  key: string,
  netCents: number,
  overrides: Partial<SavingsMonthDto> = {},
): SavingsMonthDto {
  return {
    month: key,
    complete: true,
    incomeCents: 300_000,
    expenseCents: netCents - 300_000,
    netCents,
    savingsRate: netCents / 300_000,
    oneOffIncomeCents: 0,
    oneOffExpenseCents: 0,
    oneOffNetCents: 0,
    netExcludingOneOffsCents: netCents,
    movedToSavingsCents: 50_000,
    movedToInvestmentsCents: 20_000,
    movedCents: 70_000,
    targetGapCents: null,
    ...overrides,
  }
}

function overview(
  overrides: Partial<SavingsOverviewDto> = {},
): SavingsOverviewDto {
  return {
    currentMonth: '2026-11',
    period: {
      month: '2026-11',
      dataUntil: '2026-11-02',
      status: 'partial',
      throughDay: 2,
      previousMonth: '2026-10',
      previousUntil: '2026-10-02',
      defaultMonth: '2026-11',
    },
    current: {
      month: '2026-11',
      until: '2026-11-30',
      incomeCents: 300_000,
      expenseCents: -260_000,
      netCents: 40_000,
      oneOffIncomeCents: 0,
      oneOffExpenseCents: 0,
      savingsRate: 40_000 / 300_000,
    },
    previous: {
      month: '2026-10',
      until: '2026-10-02',
      incomeCents: 300_000,
      expenseCents: -10_000,
      netCents: 290_000,
      oneOffIncomeCents: 0,
      oneOffExpenseCents: 0,
      savingsRate: 290_000 / 300_000,
    },
    monthlyTargetCents: 86_000,
    months: [
      month('2026-09', -50_000, {
        oneOffExpenseCents: -150_000,
        oneOffNetCents: -150_000,
      }),
      month('2026-10', 120_000),
      month('2026-11', 40_000, { complete: false }),
    ],
    averages: [3, 6, 12].map((months) => ({
      months,
      monthCount: 2,
      from: '2026-09',
      to: '2026-10',
      incomeCents: 300_000,
      expenseCents: -265_000,
      netCents: 35_000,
      netExcludingOneOffsCents: 110_000,
      movedCents: 70_000,
      savingsRate: 35_000 / 300_000,
    })),
    projectionAverageCents: 110_000,
    stock: {
      totalCents: 480_000,
      gainCents: 30_000,
      cash: {
        totalCents: 250_000,
        accounts: [
          {
            id: LIVRET_ID,
            name: 'Livret test',
            type: 'savings',
            institution: 'Banque test',
            balanceCents: 250_000,
            balanceDate: '2026-11-02',
          },
        ],
      },
      investments: {
        totals: {
          valueCents: 230_000,
          contributionsCents: 200_000,
          gainCents: 30_000,
          returnRate: 0.15,
          withoutContributionsCount: 0,
          withoutValueCount: 0,
          staleCount: 0,
        },
        accounts: [
          {
            id: PEA_ID,
            name: 'PEA test',
            type: 'brokerage',
            institution: null,
            valueCents: 230_000,
            valueDate: '2026-10-31',
            contributionsCents: 200_000,
            contributionsDate: '2026-10-31',
            gainCents: 30_000,
            returnRate: 0.15,
            daysSinceLatest: 6,
            staleAfterDays: 45,
            stale: false,
          },
        ],
      },
    },
    ...overrides,
  }
}

function goal(overrides: Partial<SavingsGoalDto> = {}): SavingsGoalDto {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    name: 'Fonds de secours',
    targetCents: 1_000_000,
    targetDate: '2027-03-31',
    source: 'accounts',
    manualAmountCents: null,
    accountIds: [LIVRET_ID],
    color: null,
    archived: false,
    currentCents: 250_000,
    progressRatio: 0.25,
    remainingCents: 750_000,
    reached: false,
    monthsLeft: 5,
    targetDatePassed: false,
    requiredMonthlyCents: 150_000,
    projection: {
      averageMonthlyCents: 110_000,
      reachable: true,
      monthsNeeded: 7,
      projectedDate: '2027-05-31',
      onTrack: false,
    },
    ...overrides,
  }
}

function account(overrides: Partial<AccountDto>): AccountDto {
  return {
    id: LIVRET_ID,
    name: 'Livret test',
    type: 'savings',
    institution: null,
    position: 0,
    archivedAt: null,
    balanceCents: 250_000,
    balanceDate: '2026-11-02',
    cryptoSource: null,
    cryptoProvider: null,
    cryptoSyncedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function ok<T>(data: T) {
  return Promise.resolve({ data, response: { ok: true, status: 200 } })
}

/** Testing Library collapses the narrow no-break spaces `Intl` emits. */
const text = (value: string) => value.replace(/\s/g, ' ')

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <SavingsPage />
    </QueryClientProvider>,
  )
}

beforeAll(() => {
  // Recharts and Radix measure themselves; jsdom has no ResizeObserver.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  api.savingsControllerOverview.mockImplementation(() => ok(overview()))
  api.savingsControllerListGoals.mockImplementation(() => ok([goal()]))
  api.accountsControllerList.mockImplementation(() =>
    ok([
      account({}),
      account({ id: PEA_ID, name: 'PEA test', type: 'brokerage' }),
    ]),
  )
  api.savingsControllerSetTarget.mockImplementation(
    ({ body }: { body: { monthlyTargetCents: number | null } }) => ok(body),
  )
  api.savingsControllerCreateGoal.mockImplementation(
    ({ body }: { body: Partial<SavingsGoalDto> }) => ok(goal(body)),
  )
  api.savingsControllerUpdateGoal.mockImplementation(
    ({ body }: { body: Partial<SavingsGoalDto> }) => ok(goal(body)),
  )
})

describe('SavingsPage', () => {
  it('shows the month, the averages, the target, the stock and the goals', async () => {
    renderPage()

    expect(await screen.findByText('Épargne du mois')).toBeInTheDocument()
    expect(screen.getByText('Novembre 2026')).toBeInTheDocument()
    // One average on the tiles, named and dated.
    const average = screen
      .getByText('Épargne moyenne')
      .closest('[data-slot="stat-card"]') as HTMLElement
    expect(average).toHaveTextContent(text('350 €'))
    expect(average).toHaveTextContent(
      'Par mois, de sept. à oct. (2 mois complets)',
    )
    const kpis = screen.getByRole('region', { name: 'Chiffres clés' })
    expect(kpis).not.toHaveTextContent(/Moy\. 6 mois|ponctuel/)

    // Target vs actual: 400 € saved so far, 460 € to go.
    expect(
      screen.getByText(text('Reste 460,00 € à épargner ce mois-ci')),
    ).toBeInTheDocument()
    expect(screen.getByText('1 mois sur 2')).toBeInTheDocument()

    // Savings stock links to the account pages.
    const livret = screen.getByRole('link', { name: /Livret test/ })
    expect(livret).toHaveAttribute('href', `/accounts/${LIVRET_ID}`)
    expect(screen.getByRole('link', { name: /PEA test/ })).toHaveTextContent(
      text('+300,00 € (+15 %)'),
    )
    // Investments valued by hand update their value from the list; cash
    // accounts are fed by imports.
    expect(
      screen.getByRole('button', {
        name: 'Mettre à jour « PEA test »',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: 'Mettre à jour « Livret test »',
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Ajouter un placement' }),
    ).toBeInTheDocument()

    // Goal: monthly effort and a late projection.
    expect(
      await screen.findByRole('meter', { name: 'Fonds de secours' }),
    ).toHaveAttribute('aria-valuenow', '250000')
    expect(
      screen.getByText(
        text('31 mars 2027, soit 1 500,00 € par mois pendant 5 mois'),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Atteint en mai 2027 au rythme actuel, après l’échéance',
      ),
    ).toBeInTheDocument()
    // The projections' own average (one-offs excluded) is in their section.
    expect(
      screen.getByText(
        text(
          'Projetés à 1 100,00 € par mois : votre épargne moyenne des 6 derniers mois complets, sans les revenus et dépenses ponctuels.',
        ),
      ),
    ).toBeInTheDocument()
  })

  it('compares the month in progress with the same days of the previous one', async () => {
    renderPage()

    const tile = (await screen.findByText('Épargne du mois')).closest(
      '[data-slot="stat-card"]',
    ) as HTMLElement
    // 400 € so far vs 2 900 € over 1–2 October.
    expect(tile).toHaveTextContent(text('-2 500 €'))
    expect(tile).toHaveTextContent('vs 1–2 oct.')
    expect(
      screen.getByText(
        'Mois en cours : données jusqu’au 2 nov., comparées au 1–2 oct.',
      ),
    ).toBeInTheDocument()
  })

  it('follows a past month whose data stops before its end', async () => {
    api.savingsControllerOverview.mockImplementation(() =>
      ok(
        overview({
          period: {
            month: '2026-10',
            dataUntil: '2026-10-20',
            status: 'partial',
            throughDay: 20,
            previousMonth: '2026-09',
            previousUntil: '2026-09-20',
            defaultMonth: '2026-10',
          },
        }),
      ),
    )
    renderPage()

    const tile = (await screen.findByText('Épargne du mois')).closest(
      '[data-slot="stat-card"]',
    ) as HTMLElement
    expect(tile).toHaveTextContent('vs 1–20 sept.')
    // The target follows the page's month, known until the 20th.
    expect(
      screen.getByRole('meter', { name: 'Octobre 2026 (jusqu’au 20 oct.)' }),
    ).toBeInTheDocument()
    expect(screen.getByText(text('460,00 € sous la cible'))).toBeInTheDocument()
  })

  it('names the month a complete month is compared with', async () => {
    api.savingsControllerOverview.mockImplementation(() =>
      ok(
        overview({
          period: {
            month: '2026-10',
            dataUntil: '2026-10-31',
            status: 'complete',
            throughDay: null,
            previousMonth: '2026-09',
            previousUntil: '2026-09-30',
            defaultMonth: '2026-10',
          },
        }),
      ),
    )
    renderPage()

    const tile = (await screen.findByText('Épargne du mois')).closest(
      '[data-slot="stat-card"]',
    ) as HTMLElement
    expect(tile).toHaveTextContent('vs septembre')
    expect(
      screen.getByRole('meter', { name: 'Octobre 2026' }),
    ).toBeInTheDocument()
  })

  it('explains a savings rate without income', async () => {
    api.savingsControllerOverview.mockImplementation(() =>
      ok(
        overview({
          current: {
            month: '2026-11',
            until: '2026-11-30',
            incomeCents: 0,
            expenseCents: -10_000,
            netCents: -10_000,
            oneOffIncomeCents: 0,
            oneOffExpenseCents: 0,
            savingsRate: null,
          },
        }),
      ),
    )
    renderPage()

    const rate = (await screen.findByText('Taux d’épargne')).closest(
      '[data-slot="stat-card"]',
    ) as HTMLElement
    expect(rate).toHaveTextContent('—')
    expect(rate).toHaveTextContent('Pas encore de revenus ce mois-ci')
  })

  it('shows a dash and says why when a figure is not known yet', async () => {
    api.savingsControllerOverview.mockImplementation(() =>
      ok(
        overview({
          // Savings accounts but no transaction yet.
          period: {
            month: '2026-11',
            dataUntil: null,
            status: 'empty',
            throughDay: null,
            previousMonth: '2026-10',
            previousUntil: '2026-10-31',
            defaultMonth: '2026-11',
          },
          current: {
            month: '2026-11',
            until: '2026-11-30',
            incomeCents: 0,
            expenseCents: 0,
            netCents: 0,
            oneOffIncomeCents: 0,
            oneOffExpenseCents: 0,
            savingsRate: null,
          },
          months: [
            month('2026-11', 0, {
              incomeCents: 0,
              expenseCents: 0,
              savingsRate: null,
              complete: false,
            }),
          ],
          averages: [3, 6, 12].map((months) => ({
            months,
            monthCount: 0,
            from: null,
            to: null,
            incomeCents: null,
            expenseCents: null,
            netCents: null,
            netExcludingOneOffsCents: null,
            movedCents: null,
            savingsRate: null,
          })),
          projectionAverageCents: null,
        }),
      ),
    )
    renderPage()

    const tile = (label: string) =>
      screen.getByText(label).closest('[data-slot="stat-card"]') as HTMLElement
    await screen.findByText('Épargne du mois')
    for (const label of ['Épargne du mois', 'Taux d’épargne']) {
      expect(tile(label)).toHaveTextContent('—')
      expect(tile(label)).toHaveTextContent('Pas encore de données')
      expect(tile(label)).not.toHaveTextContent(/vs /)
    }
    expect(tile('Épargne moyenne')).toHaveTextContent('—')
    expect(tile('Épargne moyenne')).toHaveTextContent(
      'Pas encore de mois complet',
    )
    expect(
      screen.getByText(
        'Pas encore de mois complet pour projeter vos objectifs.',
      ),
    ).toBeInTheDocument()
  })

  it('says when there is no savings account or investment yet', async () => {
    api.savingsControllerOverview.mockImplementation(() =>
      ok(
        overview({
          stock: {
            totalCents: 0,
            gainCents: null,
            cash: { totalCents: 0, accounts: [] },
            investments: {
              totals: {
                valueCents: 0,
                contributionsCents: null,
                gainCents: null,
                returnRate: null,
                withoutContributionsCount: 0,
                withoutValueCount: 0,
                staleCount: 0,
              },
              accounts: [],
            },
          },
        }),
      ),
    )
    renderPage()

    const stock = (await screen.findByText('Mis de côté')).closest(
      '[data-slot="stat-card"]',
    ) as HTMLElement
    expect(stock).toHaveTextContent('—')
    expect(stock).toHaveTextContent('Aucun livret ni placement')
  })

  it('says when a goal cannot be reached at the current pace', async () => {
    api.savingsControllerListGoals.mockImplementation(() =>
      ok([
        goal({
          targetDate: null,
          monthsLeft: null,
          requiredMonthlyCents: null,
          projection: {
            averageMonthlyCents: -10_000,
            reachable: false,
            monthsNeeded: null,
            projectedDate: null,
            onTrack: null,
          },
        }),
      ]),
    )
    renderPage()
    expect(
      await screen.findByText(/Pas atteignable au rythme actuel/),
    ).toBeInTheDocument()
  })

  it('edits the monthly target in place', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Modifier l’épargne cible' }),
    )
    const input = screen.getByLabelText('Épargne cible par mois')
    await user.clear(input)
    await user.type(input, '1 000,50')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(api.savingsControllerSetTarget).toHaveBeenCalledWith(
        expect.objectContaining({ body: { monthlyTargetCents: 100_050 } }),
      ),
    )
    expect(toast.success).toHaveBeenCalled()
  })

  it('adds a goal with a manual amount', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Ajouter' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Nom'), 'Voyage')
    await user.type(within(dialog).getByLabelText('Montant cible'), '2 500')

    // Linked accounts are required by default.
    await user.click(
      within(dialog).getByRole('button', { name: 'Enregistrer' }),
    )
    expect(
      within(dialog).getByText('Choisissez au moins un compte'),
    ).toBeInTheDocument()
    expect(api.savingsControllerCreateGoal).not.toHaveBeenCalled()

    await user.click(within(dialog).getByLabelText('Montant saisi à la main'))
    await user.type(
      within(dialog).getByLabelText('Montant déjà épargné'),
      '300,5',
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Enregistrer' }),
    )
    await waitFor(() =>
      expect(api.savingsControllerCreateGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            name: 'Voyage',
            targetCents: 250_000,
            targetDate: null,
            source: 'manual',
            manualAmountCents: 30_050,
            accountIds: [],
          },
        }),
      ),
    )
  })

  it('archives a goal from its sheet', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(
      await screen.findByRole('button', {
        name: 'Modifier l’objectif Fonds de secours',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Archiver' }))
    await waitFor(() =>
      expect(api.savingsControllerUpdateGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: goal().id },
          body: { archived: true },
        }),
      ),
    )
  })

  it('shows an empty state without any data', async () => {
    api.savingsControllerOverview.mockImplementation(() =>
      ok(
        overview({
          months: [
            month('2026-11', 0, {
              incomeCents: 0,
              expenseCents: 0,
              complete: false,
            }),
          ],
          stock: {
            totalCents: 0,
            gainCents: null,
            cash: { totalCents: 0, accounts: [] },
            investments: {
              totals: {
                valueCents: 0,
                contributionsCents: null,
                gainCents: null,
                returnRate: null,
                withoutContributionsCount: 0,
                withoutValueCount: 0,
                staleCount: 0,
              },
              accounts: [],
            },
          },
        }),
      ),
    )
    api.savingsControllerListGoals.mockImplementation(() => ok([]))
    renderPage()
    expect(
      await screen.findByText('Pas encore d’épargne à suivre'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('Aucun objectif en cours'),
    ).toBeInTheDocument()
  })
})
