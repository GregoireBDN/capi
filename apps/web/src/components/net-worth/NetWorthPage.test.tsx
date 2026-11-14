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
  HistoryMonthDto,
} from '#/api/types.gen'
import type { NetWorthPeriod } from './net-worth'
import { NetWorthPage } from './NetWorthPage'

const api = vi.hoisted(() => ({
  dashboardControllerOverview: vi.fn(),
  dashboardControllerHistory: vi.fn(),
}))
vi.mock('#/api', () => api)
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...props
  }: {
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
    children: ReactNode
  }) => {
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
const text = (value: string) => value.replace(/\s/g, ' ')

/** Synthetic data only. */
const account = (
  id: string,
  name: string,
  type: DashboardAccountDto['type'],
): DashboardAccountDto => ({
  id,
  name,
  type,
  institution: null,
  group: type === 'checking' || type === 'savings' ? 'cash' : 'investments',
  balanceCents: 0,
  balanceDate: null,
  dataUntil: null,
  stale: false,
})
const checking = account(
  '10000000-0000-4000-8000-000000000001',
  'Compte test',
  'checking',
)
const livret = account(
  '10000000-0000-4000-8000-000000000002',
  'Livret test',
  'savings',
)
const pea = account(
  '10000000-0000-4000-8000-000000000003',
  'PEA test',
  'brokerage',
)

/**
 * 2025-01 … 2026-11 (current month, 5 Nov.): checking 1 000 € + 10 € a
 * month, livret 5 000 €, PEA from 2025-06 on at 2 000 € + 100 € a month.
 */
function historyMonth(i: number): HistoryMonthDto {
  const key = `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
  const balances: HistoryMonthDto['accounts'] = [
    {
      accountId: checking.id,
      type: 'checking',
      balanceCents: 100_000 + i * 1_000,
    },
    { accountId: livret.id, type: 'savings', balanceCents: 500_000 },
  ]
  if (i >= 5) {
    balances.push({
      accountId: pea.id,
      type: 'brokerage',
      balanceCents: 200_000 + (i - 5) * 10_000,
    })
  }
  return {
    month: key,
    incomeCents: 0,
    expenseCents: 0,
    netCents: 0,
    netWorthCents: balances.reduce((sum, b) => sum + b.balanceCents, 0),
    accounts: balances,
  }
}
const history: DashboardHistoryDto = {
  months: Array.from({ length: 23 }, (_, i) => historyMonth(i)),
}
const netWorthOf = (key: string) =>
  history.months.find((m) => m.month === key)!.netWorthCents!

const overview = {
  accounts: [checking, livret, pea],
  period: {
    month: '2026-11',
    dataUntil: '2026-11-03',
    status: 'partial',
    throughDay: 3,
    previousMonth: '2026-10',
    previousUntil: '2026-10-03',
    defaultMonth: '2026-11',
  },
} as unknown as DashboardOverviewDto

const ok = <T,>(data: T) =>
  Promise.resolve({ data, response: { ok: true, status: 200 } })

const euros = (cents: number) =>
  text(
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(cents / 100),
  )

function renderPage(period: NetWorthPeriod = '12m', onPeriodChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <NetWorthPage period={period} onPeriodChange={onPeriodChange} />
    </QueryClientProvider>,
  )
  return {
    ...view,
    onPeriodChange,
    rerenderWith: (next: NetWorthPeriod) =>
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <NetWorthPage period={next} onPeriodChange={onPeriodChange} />
        </QueryClientProvider>,
      ),
  }
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
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-05T10:00:00Z'))
  api.dashboardControllerOverview.mockImplementation(() => ok(overview))
  api.dashboardControllerHistory.mockImplementation(() => ok(history))
})

afterEach(() => {
  vi.useRealTimers()
})

/** The chart's data-table twin (rows: header + one per month). */
async function chartTable(name: RegExp) {
  return screen.findByRole('table', { name, hidden: true })
}

describe('NetWorthPage', () => {
  it('shows today’s net worth, its deltas and the data date', async () => {
    renderPage()

    expect(await screen.findByText('Aujourd’hui')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      euros(netWorthOf('2026-11')),
    )
    // Five years of month ends, fetched once for every period.
    expect(api.dashboardControllerHistory).toHaveBeenCalledWith(
      expect.objectContaining({ query: { months: 60 } }),
    )

    const deltas = screen.getByText('Sur 1 mois').closest('dl')!
    // +10 € checking, +100 € PEA.
    expect(deltas).toHaveTextContent(text('vs fin oct. 2026+110 €'))
    expect(deltas).toHaveTextContent(text('vs fin nov. 2025+1 320 €'))
    expect(deltas).toHaveTextContent(text('vs fin déc. 2025+1 210 €'))
    expect(screen.getByText(/Données jusqu’au 3 nov\./)).toBeInTheDocument()
  })

  it('plots 6 months, 12 months or every month end', async () => {
    const view = renderPage('12m')

    const twelve = await chartTable(
      /Patrimoine net en fin de mois, de décembre 2025 à novembre 2026/,
    )
    expect(within(twelve).getAllByRole('row', { hidden: true })).toHaveLength(
      13,
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: '6 mois' }))
    expect(view.onPeriodChange).toHaveBeenCalledWith('6m')

    view.rerenderWith('6m')
    const six = await chartTable(
      /Patrimoine net en fin de mois, de juin 2026 à novembre 2026/,
    )
    expect(within(six).getAllByRole('row', { hidden: true })).toHaveLength(7)

    view.rerenderWith('all')
    const all = await chartTable(
      /Patrimoine net en fin de mois, de janvier 2025 à novembre 2026/,
    )
    expect(within(all).getAllByRole('row', { hidden: true })).toHaveLength(24)
  })

  it('reads any month end, with a breakdown that adds up', async () => {
    renderPage()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    await screen.findByText('Aujourd’hui')
    await user.click(screen.getByRole('button', { name: 'Mois précédent' }))
    await user.click(screen.getByRole('button', { name: 'Mois précédent' }))

    expect(screen.getAllByText('Fin septembre 2026')).not.toHaveLength(0)
    const amount = netWorthOf('2026-09')
    expect(screen.getByRole('status')).toHaveTextContent(euros(amount))

    const checkingType = screen.getByRole('listitem', {
      name: 'Compte courant',
    })
    const savingsType = screen.getByRole('listitem', {
      name: 'Livret d’épargne',
    })
    const peaType = screen.getByRole('listitem', {
      name: 'PEA / compte-titres',
    })
    // i = 20 for 2026-09: 1 200 € checking, 5 000 € livret, 3 500 € PEA.
    expect(checkingType).toHaveTextContent(euros(120_000))
    expect(savingsType).toHaveTextContent(euros(500_000))
    expect(peaType).toHaveTextContent(euros(350_000))
    expect(120_000 + 500_000 + 350_000).toBe(amount)
    expect(screen.getByText('Total').parentElement).toHaveTextContent(
      euros(amount),
    )

    // Each account opens its page.
    expect(
      within(checkingType).getByRole('link', { name: /Compte test/ }),
    ).toHaveAttribute('href', `/transactions?account=${checking.id}`)
    expect(
      within(peaType).getByRole('link', { name: /PEA test/ }),
    ).toHaveAttribute('href', `/accounts/${pea.id}`)
  })

  it('stops at the month the data stops in', async () => {
    api.dashboardControllerOverview.mockImplementation(() =>
      ok({
        ...overview,
        period: { ...overview.period, month: '2026-10', status: 'complete' },
      }),
    )
    renderPage()

    expect(await screen.findAllByText('Fin octobre 2026')).not.toHaveLength(0)
    expect(screen.queryByText('Aujourd’hui')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeDisabled()
  })

  it('invites to import when no balance is known yet', async () => {
    api.dashboardControllerHistory.mockImplementation(() =>
      ok({
        months: [{ ...historyMonth(0), netWorthCents: null, accounts: [] }],
      }),
    )
    renderPage()

    expect(
      await screen.findByText('Pas encore de solde connu'),
    ).toBeInTheDocument()
  })
})
