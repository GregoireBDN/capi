import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
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
import type { AccountDto } from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import { ForecastPage } from './ForecastPage'
import { forecast, FORECAST_CHECKING_ID, forecastItem } from './test-fixtures'
import { THRESHOLD_STORAGE_KEY } from './threshold'

const api = vi.hoisted(() => ({
  forecastControllerForecast: vi.fn(),
  accountsControllerList: vi.fn(),
}))

vi.mock('#/api', () => api)
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

/** Testing Library collapses the narrow no-break spaces `Intl` emits. */
const euros = (cents: number) => formatCents(cents).replace(/\s/g, ' ')

/** Synthetic data only. */
function account(overrides: Partial<AccountDto>): AccountDto {
  return {
    id: FORECAST_CHECKING_ID,
    name: 'Compte test',
    type: 'checking',
    institution: null,
    position: 0,
    archivedAt: null,
    balanceCents: 100_000,
    balanceDate: '2026-11-27',
    cryptoSource: null,
    cryptoProvider: null,
    cryptoSyncedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
const SAVINGS_ID = '10000000-0000-4000-8000-000000000002'

function ok<T>(data: T) {
  return Promise.resolve({ data, response: { ok: true, status: 200 } })
}

function lastQuery() {
  return api.forecastControllerForecast.mock.lastCall?.[0]?.query as Record<
    string,
    unknown
  >
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ForecastPage />
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
  api.forecastControllerForecast.mockImplementation(() => ok(forecast()))
  api.accountsControllerList.mockImplementation(() =>
    ok([
      account({}),
      account({ id: SAVINGS_ID, name: 'Livret test', type: 'savings' }),
      account({
        id: '10000000-0000-4000-8000-000000000003',
        name: 'PEA test',
        type: 'brokerage',
      }),
    ]),
  )
})

afterEach(() => {
  window.localStorage.clear()
})

describe('ForecastPage', () => {
  it('shows the projection, the expected items and the estimate', async () => {
    renderPage()

    const tiles = await screen.findByRole('region', { name: 'Chiffres clés' })
    const tile = (label: string) =>
      within(tiles).getByText(label).closest('[data-slot="stat-card"]')
    expect(tile('Solde prévu fin de mois')).toHaveTextContent(euros(267_000))
    expect(tile('Point bas')).toHaveTextContent('180 €')
    expect(
      within(tiles).getByText(/Point bas le dim\. 29 nov\./),
    ).toBeInTheDocument()
    // It says from which date it projects (#215).
    expect(
      within(tiles).getByText(
        /solde connu au ven\. 27 nov\., prévision à partir du sam\. 28 nov\./,
      ),
    ).toBeInTheDocument()
    expect(tile('À payer')).toHaveTextContent('830 €')
    expect(tile('À recevoir')).toHaveTextContent('2 500 €')
    expect(lastQuery()).toEqual({
      accountIds: undefined,
      threshold: 0,
      includeVariable: true,
    })

    const items = screen.getByRole('list', { name: 'Opérations attendues' })
    expect(within(items).getByText('Loyer test')).toBeInTheDocument()
    expect(within(items).getByText(`+${euros(250_000)}`)).toBeInTheDocument()
    expect(screen.getByText('estimation')).toBeInTheDocument()
    expect(screen.getByText(`~ ${euros(-3_000)}`)).toBeInTheDocument()
    // The chart's data table: one row per day, after the header.
    const table = screen.getByRole('table', {
      name: /Solde prévu par jour/,
      hidden: true,
    })
    expect(within(table).getAllByRole('row', { hidden: true })).toHaveLength(4)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('warns when the projection goes under the threshold', async () => {
    api.forecastControllerForecast.mockImplementation(() =>
      ok(
        forecast({
          thresholdCents: 50_000,
          belowThreshold: { date: '2026-11-29', balanceCents: 18_000 },
        }),
      ),
    )
    renderPage()
    expect(
      await screen.findByText(`Solde sous ${euros(50_000)} le dim. 29 nov.`),
    ).toBeInTheDocument()
  })

  it('calls a forecast on old data indicative and offers to update it', async () => {
    api.forecastControllerForecast.mockImplementation(() =>
      ok(
        forecast({
          knownUntil: '2026-10-31',
          projectedFrom: '2026-11-01',
          stale: true,
          belowThreshold: null,
        }),
      ),
    )
    renderPage()
    expect(await screen.findByText('Prévision indicative')).toBeInTheDocument()
    expect(
      screen.getByText(/Vos relevés s’arrêtent au sam\. 31 oct\./),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Importer un relevé' }),
    ).toHaveAttribute('href', '/import')
    expect(
      screen.getByRole('button', { name: 'Ajouter une dépense' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Solde sous/)).not.toBeInTheDocument()
  })

  it('saves the threshold on this device and sends it in cents', async () => {
    const user = userEvent.setup()
    renderPage()
    const input = await screen.findByLabelText('Seuil d’alerte')

    await user.clear(input)
    await user.type(input, 'abc{Enter}')
    expect(await screen.findByText(/Montant invalide/)).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, '-150,5{Enter}')
    await waitFor(() => expect(lastQuery().threshold).toBe(-15_050))
    expect(window.localStorage.getItem(THRESHOLD_STORAGE_KEY)).toBe('-15050')
    // Typed unsigned, the « - » turned into the sign (#326).
    expect(input).toHaveValue('150,50')
    const sign = screen.getByRole('button', { name: 'Montant négatif' })
    expect(sign).toHaveAttribute('aria-pressed', 'true')
    await user.click(sign)
    await waitFor(() => expect(lastQuery().threshold).toBe(15_050))
  })

  it('reads the saved threshold', async () => {
    window.localStorage.setItem(THRESHOLD_STORAGE_KEY, '20000')
    renderPage()
    expect(await screen.findByLabelText('Seuil d’alerte')).toHaveValue('200')
    expect(lastQuery().threshold).toBe(20_000)
  })

  it('toggles the estimate and chooses the accounts', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('switch', {
        name: 'Inclure les dépenses courantes estimées',
      }),
    )
    await waitFor(() => expect(lastQuery().includeVariable).toBe(false))

    // Investment accounts are not offered; the last account stays selected.
    const checking = screen.getByRole('checkbox', { name: 'Compte test' })
    expect(checking).toBeChecked()
    expect(checking).toBeDisabled()
    expect(
      screen.queryByRole('checkbox', { name: 'PEA test' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Livret test' }))
    await waitFor(() =>
      expect(lastQuery().accountIds).toBe(
        `${FORECAST_CHECKING_ID},${SAVINGS_ID}`,
      ),
    )
  })

  it('tells a late occurrence and a variable amount apart', async () => {
    api.forecastControllerForecast.mockImplementation(() =>
      ok(
        forecast({
          items: [
            forecastItem({
              name: 'Énergie test',
              date: '2026-11-28',
              expectedDate: '2026-11-26',
              amountType: 'variable',
              amountCents: -6_000,
            }),
          ],
        }),
      ),
    )
    renderPage()
    expect(
      await screen.findByText('Prévu le jeu. 26 nov., pas encore importé'),
    ).toBeInTheDocument()
    expect(screen.getByText(`~ ${euros(-6_000)}`)).toBeInTheDocument()
  })

  it('invites to confirm subscriptions without recurring items', async () => {
    api.forecastControllerForecast.mockImplementation(() =>
      ok(forecast({ recurringItemCount: 0, items: [], estimate: null })),
    )
    renderPage()
    expect(
      await screen.findByRole('link', { name: 'Confirmer mes abonnements' }),
    ).toHaveAttribute('href', '/subscriptions')
  })

  it('invites to import without a checking account', async () => {
    api.forecastControllerForecast.mockImplementation(() =>
      ok(forecast({ accounts: [], recurringItemCount: 0, items: [] })),
    )
    renderPage()
    expect(
      await screen.findByRole('link', { name: 'Importer un relevé' }),
    ).toHaveAttribute('href', '/import')
    expect(
      screen.queryByRole('region', { name: 'Chiffres clés' }),
    ).not.toBeInTheDocument()
  })
})
