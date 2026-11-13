import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CategoryDto, RecurringItemDto } from '#/api/types.gen'
import { SubscriptionsPage } from './SubscriptionsPage'
import { recurringItem, recurringSummary } from './test-fixtures'

const api = vi.hoisted(() => ({
  categoriesControllerList: vi.fn(),
  recurringControllerList: vi.fn(),
  recurringControllerSummary: vi.fn(),
  recurringControllerDetect: vi.fn(),
  recurringControllerUpdate: vi.fn(),
  recurringControllerConfirm: vi.fn(),
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

// Radix Switch measures itself; jsdom has no ResizeObserver.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

/** Testing Library collapses the narrow no-break spaces `Intl` emits. */
const text = (value: string) => value.replace(/\s/g, ' ')

/** Synthetic data only. */
const subscriptions: CategoryDto = {
  id: 'c0000000-0000-4000-8000-000000000001',
  slug: 'subscriptions',
  name: 'Abonnements',
  kind: 'expense',
  color: '#7c3aed',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  archivedAt: null,
}

const items: RecurringItemDto[] = [
  recurringItem({
    id: 'i1',
    name: 'Streamflix',
    searchText: 'Streamflix',
    isSubscription: true,
    categoryId: subscriptions.id,
    categoryName: 'Abonnements',
    categoryColor: '#7c3aed',
    typicalAmountCents: 1_299,
    latestAmountCents: 1_299,
    previousAmountCents: 1_099,
    priceChangeCents: 200,
    priceChangedOn: '2026-03-12',
    yearlyCostCents: 15_588,
    monthlyEquivalentCents: 1_299,
    nextExpectedDate: '2026-11-11',
  }),
  recurringItem({
    id: 'i2',
    name: 'Cotisation carte',
    cadence: 'yearly',
    detectedCadence: 'yearly',
    typicalAmountCents: 4_800,
    yearlyCostCents: 4_800,
    monthlyEquivalentCents: 400,
    nextExpectedDate: '2027-03-15',
  }),
  recurringItem({
    id: 'i3',
    name: 'Vidéo Exemple',
    isSubscription: true,
    active: false,
    lastSeenDate: '2026-07-09',
    nextExpectedDate: '2026-08-09',
  }),
  recurringItem({
    id: 's1',
    name: 'Assureur Exemple',
    status: 'suggested',
    confidence: 0.92,
  }),
  recurringItem({
    id: 's2',
    name: 'Énergie Exemple',
    status: 'suggested',
    amountType: 'variable',
    minAmountCents: 6_400,
    maxAmountCents: 11_200,
    typicalAmountCents: 8_400,
    confidence: 0.55,
  }),
]

function ok<T>(data: T) {
  return Promise.resolve({
    data,
    response: new Response(null, { status: 200 }),
  })
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <SubscriptionsPage />
    </QueryClientProvider>,
  )
}

describe('SubscriptionsPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-06T10:00:00Z'))
    for (const fn of Object.values(api)) fn.mockReset()
    api.categoriesControllerList.mockImplementation(() => ok([subscriptions]))
    api.recurringControllerList.mockImplementation(() => ok(items))
    api.recurringControllerSummary.mockImplementation(() =>
      ok(
        recurringSummary({
          debits: {
            monthlyCents: 1_699,
            yearlyCents: 20_388,
            count: 2,
            fixed: { monthlyCents: 1_699, yearlyCents: 20_388, count: 2 },
            variable: { monthlyCents: 0, yearlyCents: 0, count: 0 },
            subscriptions: {
              monthlyCents: 1_299,
              yearlyCents: 15_588,
              count: 1,
            },
          },
          credits: { monthlyCents: 250_000, yearlyCents: 3_000_000, count: 1 },
          suggestedCount: 2,
        }),
      ),
    )
    api.recurringControllerDetect.mockImplementation(() =>
      ok({
        detectedCount: 3,
        createdCount: 2,
        updatedCount: 1,
        removedCount: 0,
        suggestedCount: 2,
      }),
    )
    api.recurringControllerUpdate.mockImplementation(
      ({
        path,
        body,
      }: {
        path: { id: string }
        body: Partial<RecurringItemDto>
      }) => ok({ ...items.find((i) => i.id === path.id)!, ...body }),
    )
    api.recurringControllerConfirm.mockImplementation(() =>
      ok({ confirmedCount: 1 }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the monthly and yearly totals, fixed share and incomes', async () => {
    renderPage()
    const kpis = await screen.findByLabelText('Chiffres clés')
    expect(text(kpis.textContent)).toContain('16,99 €')
    expect(text(kpis.textContent)).toContain('203,88 €')
    expect(text(kpis.textContent)).toContain('100 % du total')
    expect(text(kpis.textContent)).toContain('2 500,00 € / mois')
  })

  it('lists confirmed items with price change, cadence and inactive badges', async () => {
    renderPage()
    const row = await screen.findByRole('button', {
      name: 'Modifier Streamflix',
    })
    expect(text(row.textContent)).toContain('12,99 € / mois')
    expect(text(row.textContent)).toContain('+2,00 € depuis mars')
    expect(text(row.textContent)).toContain('Prochain dans 5 jours')

    const yearly = screen.getByRole('button', {
      name: 'Modifier Cotisation carte',
    })
    expect(text(yearly.textContent)).toContain('48,00 € / an')
    expect(text(yearly.textContent)).toContain('≈ 4,00 € / mois')

    const inactive = screen.getByRole('button', {
      name: 'Modifier Vidéo Exemple',
    })
    expect(inactive.textContent).toContain('Inactif')
  })

  it('shows the debits of the next 30 days', async () => {
    renderPage()
    const timeline = await screen.findByRole('list', {
      name: 'Prochains prélèvements',
    })
    expect(within(timeline).getByText('Streamflix')).toBeInTheDocument()
    // Yearly (March) and inactive items are not expected in the window.
    expect(within(timeline).queryByText('Cotisation carte')).toBeNull()
    expect(within(timeline).queryByText('Vidéo Exemple')).toBeNull()
  })

  it('confirms or dismisses a suggestion', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Confirmer Assureur Exemple' }),
    )
    await waitFor(() =>
      expect(api.recurringControllerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: 's1' },
          body: { status: 'confirmed' },
        }),
      ),
    )
    await user.click(
      screen.getByRole('button', { name: 'Ignorer Énergie Exemple' }),
    )
    await waitFor(() =>
      expect(api.recurringControllerUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          path: { id: 's2' },
          body: { status: 'dismissed' },
        }),
      ),
    )
  })

  it('confirms the high-confidence suggestions at once', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Tout confirmer (1)' }),
    )
    await waitFor(() =>
      expect(api.recurringControllerConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ body: { ids: ['s1'] } }),
      ),
    )
    expect(toast.success).toHaveBeenCalledWith('1 élément confirmé')
  })

  it('runs the detection', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Analyser mes opérations' }),
    )
    await waitFor(() =>
      expect(api.recurringControllerDetect).toHaveBeenCalledOnce(),
    )
    expect(toast.success).toHaveBeenCalledWith('2 nouvelles suggestions')
  })

  it('edits an item and links to its transactions', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Modifier Streamflix' }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('link', { name: /Voir les opérations/ }),
    ).toHaveAttribute(
      'href',
      '/transactions?month=all&q=Streamflix&account=a0000000-0000-4000-8000-000000000001',
    )
    const name = within(dialog).getByLabelText('Nom')
    await user.clear(name)
    await user.type(name, 'Streamflix Premium')
    await user.selectOptions(
      within(dialog).getByLabelText('Fréquence'),
      'yearly',
    )
    await user.click(within(dialog).getByRole('switch'))
    await user.type(within(dialog).getByLabelText('Notes'), 'Partagé')
    await user.click(
      within(dialog).getByRole('button', { name: 'Enregistrer' }),
    )
    await waitFor(() =>
      expect(api.recurringControllerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: 'i1' },
          body: {
            name: 'Streamflix Premium',
            categoryId: subscriptions.id,
            isFixedCost: false,
            cadence: 'yearly',
            notes: 'Partagé',
          },
        }),
      ),
    )
  })

  it('offers the analysis on an empty page', async () => {
    api.recurringControllerList.mockImplementation(() => ok([]))
    api.recurringControllerSummary.mockImplementation(() =>
      ok(recurringSummary()),
    )
    renderPage()
    expect(
      await screen.findByText('Aucune opération récurrente'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Analyser mes opérations' }),
    ).toBeInTheDocument()
  })
})
