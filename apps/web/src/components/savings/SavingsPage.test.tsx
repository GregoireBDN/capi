import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AccountDto,
  EnvelopeSummaryDto,
  SavingsMonthDto,
  SavingsOverviewDto,
} from '#/api/types.gen'
import { SavingsPage } from './SavingsPage'

const api = vi.hoisted(() => ({
  savingsControllerOverview: vi.fn(),
  coverageControllerCoverage: vi.fn(),
  savingsControllerSetTarget: vi.fn(),
  envelopesControllerList: vi.fn(),
  envelopesControllerOffers: vi.fn(),
  envelopesControllerApplySplit: vi.fn(),
  envelopesControllerDismiss: vi.fn(),
  envelopesControllerForAccount: vi.fn(),
  categoriesControllerList: vi.fn(),
  accountsControllerList: vi.fn(),
  investmentsControllerSummary: vi.fn(),
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
    <a
      href={to.replace(/\$(\w+)/g, (_, key: string) => params?.[key] ?? '')}
      {...props}
    >
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
    moved: {
      toSavingsCents: 40_000,
      toInvestmentsCents: 50_000,
      totalCents: 90_000,
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
            contributionsSource: 'typed',
            linkedTransfersCount: 0,
            unknownCostCount: 0,
            unknownCost: [],
            realised: null,
            linkedAfterValueCents: 0,
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

function envelope(
  overrides: Partial<EnvelopeSummaryDto> = {},
): EnvelopeSummaryDto {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    name: 'Lisbonne',
    icon: 'plane',
    color: '#e87ba4',
    targetCents: 400_000,
    dueDate: '2027-05-31',
    archived: false,
    categoryIds: [],
    totalCents: 250_000,
    paidCents: 0,
    putAsideCents: 250_000,
    accounts: [
      { accountId: LIVRET_ID, accountName: 'Livret test', amountCents: 250_000 },
    ],
    plan: {
      remainingCents: 150_000,
      progressRatio: 0.625,
      reached: false,
      monthsLeft: 7,
      targetDatePassed: false,
      requiredMonthlyCents: 21_429,
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
    investedBaseCents: null,
    investedBaseOn: null,
    openedOn: null,
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

/** October 2026, a full month: 1 200 € saved of 3 000 € of income. */
const OCTOBER_COMPLETE: Partial<SavingsOverviewDto> = {
  period: {
    month: '2026-10',
    dataUntil: '2026-10-31',
    status: 'complete',
    throughDay: null,
    previousMonth: '2026-09',
    previousUntil: '2026-09-30',
    defaultMonth: '2026-11',
  },
  current: {
    month: '2026-10',
    until: '2026-10-31',
    incomeCents: 300_000,
    expenseCents: -180_000,
    netCents: 120_000,
    oneOffIncomeCents: 0,
    oneOffExpenseCents: 0,
    savingsRate: 0.4,
  },
}

/** The card whose title is `title` (and, for « Mis de côté », its period). */
async function card(title: string, period?: string): Promise<HTMLElement> {
  await screen.findAllByText(title)
  const cards = screen
    .getAllByText(title)
    .filter((element) => element.closest('[data-slot="card-title"]'))
    .map((element) => element.closest('[data-slot="card"]') as HTMLElement)
    .filter(
      (found) => period === undefined || within(found).queryByText(period),
    )
  expect(cards).toHaveLength(1)
  return cards[0]
}

function renderPage({
  month: shown,
  onMonthChange = () => {},
}: {
  month?: string
  onMonthChange?: (month: string | undefined) => void
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <SavingsPage month={shown} onMonthChange={onMonthChange} />
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
  api.coverageControllerCoverage.mockImplementation(() =>
    ok({
      dataUntil: '2026-11-03',
      currentMonth: '2026-11',
      defaultMonth: '2026-11',
      months: ['2026-10', '2026-11'],
    }),
  )
  api.envelopesControllerList.mockImplementation(() => ok([envelope()]))
  api.envelopesControllerOffers.mockImplementation(() =>
    ok({ savings: [], transfers: [], expenses: [] }),
  )
  api.categoriesControllerList.mockImplementation(() => ok([]))
  api.accountsControllerList.mockImplementation(() =>
    ok([
      account({}),
      account({ id: PEA_ID, name: 'PEA test', type: 'brokerage' }),
    ]),
  )
  api.investmentsControllerSummary.mockImplementation(() =>
    ok(overview().stock.investments),
  )
  api.savingsControllerSetTarget.mockImplementation(
    ({ body }: { body: { monthlyTargetCents: number | null } }) => ok(body),
  )
})

describe('SavingsPage', () => {
  it('judges a full month against its target, in figures', async () => {
    api.savingsControllerOverview.mockImplementation(() =>
      ok(overview(OCTOBER_COMPLETE)),
    )
    renderPage()

    const shown = await card('Épargné')
    expect(within(shown).getByText('Cible atteinte')).toBeInTheDocument()
    expect(shown).toHaveTextContent(text('1 200 €'))
    expect(shown).toHaveTextContent(text('Cible 860 €'))
    // The gap and the rate as two figures, no sentence.
    expect(shown).toHaveTextContent(text('+340 €vs cible'))
    expect(shown).toHaveTextContent(text('40 %des revenus'))
    // The last full months as dots, then the one average.
    expect(
      within(
        within(shown).getByRole('list', { name: 'Derniers mois complets' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(2)
    expect(
      within(shown).getByLabelText('Cible atteinte 1 mois sur 2'),
    ).toHaveTextContent('1/2')
    expect(shown).toHaveTextContent(text('Moyenne 1 100 €'))
    // A full month needs no period note.
    expect(screen.queryByText(/Mois complet, données/)).not.toBeInTheDocument()
  })

  it('says a month below its target and what a one-off did', async () => {
    api.savingsControllerOverview.mockImplementation(() =>
      ok(
        overview({
          ...OCTOBER_COMPLETE,
          current: {
            ...OCTOBER_COMPLETE.current!,
            expenseCents: -260_000,
            netCents: 40_000,
            oneOffExpenseCents: -150_000,
            savingsRate: 40_000 / 300_000,
          },
        }),
      ),
    )
    renderPage()

    const shown = await card('Épargné')
    expect(within(shown).getByText('Sous la cible')).toBeInTheDocument()
    expect(shown).toHaveTextContent(text('-460 €vs cible'))
    expect(shown).toHaveTextContent(text('13,3 %des revenus'))
    expect(shown).toHaveTextContent(text('Hors exceptionnel1 900 €'))
  })

  it('compares the month in progress with the same days of the previous one', async () => {
    renderPage()

    const shown = await card('Épargné à ce jour')
    expect(within(shown).getByText('En cours')).toBeInTheDocument()
    // 400 € so far vs 2 900 € over 1–2 October, then October's 1 200 €.
    expect(shown).toHaveTextContent(text('-2 500 €vs 1–2 oct.'))
    expect(shown).toHaveTextContent(text('1 200 €Octobre'))
    expect(within(shown).getByLabelText('cible atteinte')).toBeInTheDocument()
    // No verdict before the month ends.
    expect(shown).not.toHaveTextContent('vs cible')
    expect(shown).not.toHaveTextContent('des revenus')
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
            defaultMonth: '2026-11',
          },
        }),
      ),
    )
    renderPage()

    const shown = await card('Épargné')
    expect(within(shown).getByText('Jusqu’au 20 oct.')).toBeInTheDocument()
    expect(shown).toHaveTextContent('vs 1–20 sept.')
  })

  it('compares with the average and offers a target without one', async () => {
    api.savingsControllerOverview.mockImplementation(() =>
      ok(overview({ ...OCTOBER_COMPLETE, monthlyTargetCents: null })),
    )
    const user = userEvent.setup()
    renderPage()

    const shown = await card('Épargné')
    expect(shown).toHaveTextContent(text('Moyenne 1 100 €'))
    expect(shown).toHaveTextContent(text('+100 €vs moyenne'))
    expect(within(shown).queryByText('Cible atteinte')).not.toBeInTheDocument()
    expect(
      within(shown).queryByRole('list', { name: 'Derniers mois complets' }),
    ).not.toBeInTheDocument()
    await user.click(
      within(shown).getByRole('button', { name: 'Fixer une cible' }),
    )
    expect(screen.getByLabelText('Cible par mois')).toBeInTheDocument()
  })

  it('shows a dash for a rate without income', async () => {
    api.savingsControllerOverview.mockImplementation(() =>
      ok(
        overview({
          ...OCTOBER_COMPLETE,
          current: {
            ...OCTOBER_COMPLETE.current!,
            incomeCents: 0,
            expenseCents: -10_000,
            netCents: -10_000,
            savingsRate: null,
          },
        }),
      ),
    )
    renderPage()
    expect(await card('Épargné')).toHaveTextContent('—sans revenus')
  })

  it('says when the month has no data and offers the nearest one', async () => {
    const onMonthChange = vi.fn()
    api.savingsControllerOverview.mockImplementation(() =>
      ok(
        overview({
          period: {
            month: '2026-11',
            dataUntil: null,
            status: 'empty',
            throughDay: null,
            previousMonth: '2026-10',
            previousUntil: '2026-10-31',
            defaultMonth: '2026-11',
          },
        }),
      ),
    )
    const user = userEvent.setup()
    renderPage({ onMonthChange })

    const shown = await card('Épargné')
    expect(within(shown).getByText('Rien en novembre')).toBeInTheDocument()
    await user.click(
      await within(shown).findByRole('button', { name: 'Voir octobre 2026' }),
    )
    expect(onMonthChange).toHaveBeenLastCalledWith('2026-10')
  })

  it('shows what was put aside and what it did to the checking account', async () => {
    api.savingsControllerOverview.mockImplementation(() =>
      ok(overview(OCTOBER_COMPLETE)),
    )
    renderPage()

    const shown = await card('Mis de côté', 'Octobre')
    expect(shown).toHaveTextContent(text('900 €'))
    expect(shown).toHaveTextContent(text('Épargné1 200 €'))
    expect(shown).toHaveTextContent(text('Livrets+400 €'))
    expect(shown).toHaveTextContent(text('Placements+500 €'))
    // 1 200 € saved, 900 € put aside: 300 € stayed on the checking account.
    expect(shown).toHaveTextContent(text('Compte courant+300 €'))

    // The months of the overview, summed: 1 100 € saved, 2 100 € put aside.
    const year = await card('Mis de côté', '3 mois')
    expect(year).toHaveTextContent(text('2 100 €'))
    expect(year).toHaveTextContent(text('Livrets+1 500 €'))
    expect(year).toHaveTextContent(text('Placements+600 €'))
    expect(year).toHaveTextContent(text('Compte courant-1 000 €'))
  })

  it('leaves the checking account out while the month runs', async () => {
    renderPage()
    const shown = await card('Mis de côté', 'Novembre')
    expect(shown).toHaveTextContent(text('Livrets+400 €'))
    expect(shown).not.toHaveTextContent('Compte courant')
  })

  it('shows the stock once, its split and the largest accounts', async () => {
    renderPage()

    const stock = await card('Livrets et placements')
    expect(stock).toHaveTextContent(text('4 800 €+300 € de résultat'))
    expect(stock).toHaveTextContent(text('Livrets2 500 €'))
    expect(stock).toHaveTextContent(text('Placements2 300 €'))
    // The accounts, largest first, each opening its page.
    const links = within(stock).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `/accounts/${LIVRET_ID}`,
      `/accounts/${PEA_ID}`,
    ])
    expect(
      within(stock)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Ajouter un placement', 'Ajouter un compte'])
    // Not repeated anywhere else on the page.
    expect(screen.getAllByText(text('4 800 €'))).toHaveLength(1)
  })

  it('lists three accounts and links to the others', async () => {
    const base = overview()
    const extra = (id: string, valueCents: number) => ({
      ...base.stock.investments.accounts[0],
      id,
      name: `Placement ${valueCents}`,
      valueCents,
    })
    api.savingsControllerOverview.mockImplementation(() =>
      ok(
        overview({
          stock: {
            ...base.stock,
            investments: {
              ...base.stock.investments,
              accounts: [
                ...base.stock.investments.accounts,
                extra('20000000-0000-4000-8000-000000000003', 10_000),
                extra('20000000-0000-4000-8000-000000000004', 20_000),
              ],
            },
          },
        }),
      ),
    )
    renderPage()

    const stock = await card('Livrets et placements')
    expect(within(stock).queryByText('Placement 10000')).not.toBeInTheDocument()
    expect(
      within(stock).getByRole('link', { name: 'Voir les 4 comptes' }),
    ).toHaveAttribute('href', '/accounts')
  })

  it('lists the envelopes with their gauge and what they need per month', async () => {
    renderPage()
    const envelopes = await card('Enveloppes')
    const row = await within(envelopes).findByRole('link', { name: /Lisbonne/ })
    expect(envelopes).toHaveTextContent(text('2 500 € mis de côté'))
    expect(row).toHaveAttribute(
      'href',
      '/envelopes/30000000-0000-4000-8000-000000000001',
    )
    expect(row).toHaveTextContent(
      text('Lisbonne2 500 € / 4 000 €214 € par mois pendant 7 mois'),
    )
  })

  it('offers a saving to split by the key, or « Non »', async () => {
    const user = userEvent.setup()
    api.envelopesControllerOffers.mockImplementation(() =>
      ok({
        savings: [
          {
            transaction: {
              transactionId: 'tx-saving',
              accountId: LIVRET_ID,
              bookingDate: '2026-11-02',
              amountCents: 30_000,
              label: 'VIR EPARGNE',
              categoryId: null,
              counterpartAccountId: null,
            },
            envelopes: [
              {
                envelopeId: envelope().id,
                name: 'Lisbonne',
                amountCents: 9_000,
              },
            ],
          },
        ],
        transfers: [],
        expenses: [],
      }),
    )
    api.envelopesControllerApplySplit.mockImplementation(() =>
      ok(envelope()),
    )
    renderPage()
    const offers = await card('À ranger')
    expect(offers).toHaveTextContent(text('Épargne sur Livret test'))
    await user.click(
      within(offers).getByRole('button', { name: /^Lisbonne 90,00/ }),
    )
    await waitFor(() =>
      expect(api.envelopesControllerApplySplit).toHaveBeenCalledWith(
        expect.objectContaining({ path: { transactionId: 'tx-saving' } }),
      ),
    )
  })

  it('reads as rows of figures and tables on a computer', async () => {
    // A wide page: jsdom has no layout, so the page measures 1 200 px.
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 1200 } as DOMRect)
    api.savingsControllerOverview.mockImplementation(() =>
      ok(overview(OCTOBER_COMPLETE)),
    )
    renderPage()

    // The month: five figures in one row, named by its month.
    const shown = await card('Octobre')
    expect(shown).toHaveTextContent(text('Épargné1 200 €+340 € vs cible'))
    expect(shown).toHaveTextContent(text('Taux d’épargne40 %'))
    expect(shown).toHaveTextContent(text('Mis de côté900 €'))
    expect(shown).toHaveTextContent(text('Compte courant+300 €'))
    expect(shown).toHaveTextContent(text('Moyenne1 100 €'))
    // « Mis de côté » of the month is in that row, not a card of its own.
    expect(
      screen
        .getAllByText('Mis de côté')
        .filter((element) => element.closest('[data-slot="card-title"]')),
    ).toHaveLength(1)

    // Every account in one row, the total and the result in the header.
    const stock = await card('Livrets et placements')
    expect(stock).toHaveTextContent(text('4 800 €+300 € de résultat'))
    expect(
      within(stock)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([`/accounts/${LIVRET_ID}`, `/accounts/${PEA_ID}`])
    expect(
      within(stock).getByRole('link', { name: /PEA test/ }),
    ).toHaveTextContent(text('PEA testPEA2 300 €+15 %'))
    rect.mockRestore()
  })

  it('edits the monthly target in place', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Modifier la cible' }),
    )
    const input = screen.getByLabelText('Cible par mois')
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

  it('asks for the month chosen and moves to another one', async () => {
    const onMonthChange = vi.fn()
    renderPage({ month: '2026-09', onMonthChange })
    const user = userEvent.setup()
    expect(
      await screen.findByRole('button', {
        name: 'Septembre 2026, choisir un mois',
      }),
    ).toBeInTheDocument()
    expect(api.savingsControllerOverview).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ month: '2026-09' }) as unknown,
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Mois suivant' }))
    expect(onMonthChange).toHaveBeenLastCalledWith('2026-10')
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
    api.envelopesControllerList.mockImplementation(() => ok([]))
    renderPage()
    expect(
      await screen.findByText('Pas encore d’épargne à suivre'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('Mettre de l’argent de côté pour un projet'),
    ).toBeInTheDocument()
  })
})
