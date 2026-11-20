import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  InvestmentAccountSummaryDto,
  InvestmentsSummaryDto,
} from '#/api/types.gen'
import { StaleValuesReminder } from './StaleValuesReminder'

const api = vi.hoisted(() => ({
  investmentsControllerSummary: vi.fn(),
  accountSnapshotsControllerUpsert: vi.fn(),
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
function row(
  overrides: Partial<InvestmentAccountSummaryDto>,
): InvestmentAccountSummaryDto {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'PEA test',
    type: 'brokerage',
    institution: null,
    valueCents: 1_000_000,
    valueDate: '2026-09-30',
    contributionsCents: null,
    contributionsDate: null,
    contributionsSource: null,
    typedContributionsCents: null,
    linkedTransfersCount: 0,
    unknownCostCount: 0,
    linkedAfterValueCents: 0,
    gainCents: null,
    returnRate: null,
    daysSinceLatest: 44,
    staleAfterDays: 31,
    stale: true,
    ...overrides,
  }
}

function summary(
  accounts: InvestmentAccountSummaryDto[],
): InvestmentsSummaryDto {
  return {
    totals: {
      valueCents: 0,
      contributionsCents: null,
      gainCents: null,
      returnRate: null,
      withoutContributionsCount: 0,
      withoutValueCount: 0,
      staleCount: accounts.filter((account) => account.stale).length,
    },
    accounts,
  }
}

function ok<T>(data: T) {
  return Promise.resolve({
    data,
    response: new Response(null, { status: 200 }),
  })
}

function renderReminder() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <StaleValuesReminder />
    </QueryClientProvider>,
  )
}

describe('StaleValuesReminder', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-13T10:00:00Z'))
    for (const fn of Object.values(api)) fn.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the hand-valued investments older than a month, each to update', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    api.investmentsControllerSummary.mockImplementation(() =>
      ok(
        summary([
          row({}),
          row({
            id: '10000000-0000-4000-8000-000000000002',
            name: 'Assurance vie test',
            type: 'life_insurance',
            valueDate: '2026-11-01',
            daysSinceLatest: 12,
            stale: false,
          }),
          row({
            id: '10000000-0000-4000-8000-000000000003',
            name: 'Crypto test',
            type: 'crypto',
          }),
        ]),
      ),
    )
    api.accountSnapshotsControllerUpsert.mockImplementation(() =>
      ok({ id: 's1', date: '2026-11-13', valueCents: 1_020_000, note: null }),
    )
    renderReminder()

    const card = (
      await screen.findByText('Valeurs à mettre à jour')
    ).closest<HTMLElement>('[data-slot="card"]')!
    const items = within(card).getAllByRole('listitem')
    // Recent values and crypto (valued from holdings) are left out.
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('PEA test')
    expect(items[0]).toHaveTextContent(
      'Valeur du 30 sept. 2026, il y a 44 jours',
    )
    expect(within(items[0]).getByRole('link')).toHaveAttribute(
      'href',
      '/accounts/10000000-0000-4000-8000-000000000001',
    )

    await user.click(
      within(items[0]).getByRole('button', {
        name: 'Mettre à jour « PEA test »',
      }),
    )
    await user.type(await screen.findByLabelText('Valeur'), '10 200')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(api.accountSnapshotsControllerUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          path: {
            id: '10000000-0000-4000-8000-000000000001',
            date: '2026-11-13',
          },
        }),
      ),
    )
  })

  it('shows nothing while every value is recent', async () => {
    api.investmentsControllerSummary.mockImplementation(() =>
      ok(summary([row({ stale: false, daysSinceLatest: 3 })])),
    )
    const { container } = renderReminder()

    await waitFor(() =>
      expect(api.investmentsControllerSummary).toHaveBeenCalled(),
    )
    expect(container).toBeEmptyDOMElement()
  })
})
