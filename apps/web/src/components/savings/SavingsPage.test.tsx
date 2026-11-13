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
    expect(screen.getByText('Moy. 6 mois')).toBeInTheDocument()
    expect(
      screen.getByText(text('1 100,00 €'), { exact: false }),
    ).toBeInTheDocument()

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
