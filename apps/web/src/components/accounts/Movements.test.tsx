import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountDto, InvestmentMovementDto } from '#/api/types.gen'
import { formatQuantity, MovementsCard } from './Movements'

const api = vi.hoisted(() => ({
  investmentsControllerListMovements: vi.fn(),
  cryptoMovementsControllerLink: vi.fn(),
  accountsControllerList: vi.fn(),
}))
vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

/** Synthetic data only. */
const CHECKING = { id: 'acc-checking', name: 'Compte test', type: 'checking' }
const EXCHANGE = { id: 'acc-exchange', name: 'Plateforme test', type: 'crypto' }
const LEDGER = { id: 'acc-ledger', name: 'Ledger test', type: 'crypto' }

function ok<T>(data: T) {
  return Promise.resolve({ data, response: { ok: true, status: 200 } })
}

const movements: InvestmentMovementDto[] = [
  {
    id: 'm-withdrawal',
    source: 'crypto',
    date: '2026-10-20',
    from: EXCHANGE,
    to: null,
    amountCents: 80_000,
    asset: 'BTC',
    quantity: '0.011700000000000000',
    cryptoKind: 'withdrawal',
    linkable: true,
  },
  {
    id: 't-transfer',
    source: 'bank',
    date: '2026-10-04',
    from: CHECKING,
    to: EXCHANGE,
    amountCents: 30_000,
    asset: null,
    quantity: null,
    cryptoKind: null,
    linkable: false,
  },
] as InvestmentMovementDto[]

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <MovementsCard accountId={EXCHANGE.id} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.investmentsControllerListMovements.mockImplementation(() =>
    ok({ from: '2024-12-01', to: '2026-11-05', items: movements }),
  )
  api.accountsControllerList.mockImplementation(() =>
    ok([CHECKING, EXCHANGE, LEDGER] as AccountDto[]),
  )
  api.cryptoMovementsControllerLink.mockImplementation(() =>
    ok({ ...movements[0], to: LEDGER }),
  )
})

describe('formatQuantity', () => {
  it('writes exact quantities with a decimal comma', () => {
    expect(formatQuantity('0.011700000000000000')).toBe('0,0117')
    expect(formatQuantity('2.000000000000000000')).toBe('2')
  })
})

describe('MovementsCard (#296)', () => {
  it('lists bank transfers and withdrawals, and links one to the Ledger', async () => {
    const user = userEvent.setup()
    renderCard()

    const rows = await screen.findAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Plateforme test')
    expect(rows[0]).toHaveTextContent('à lier')
    expect(rows[0]).toHaveTextContent('0,0117 BTC')
    expect(rows[0]).toHaveTextContent('coût 800,00 €')
    expect(rows[1]).toHaveTextContent('Compte test')
    expect(within(rows[1]).queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText(/Un mouvement est à lier/)).toBeInTheDocument()

    const select = within(rows[0]).getByRole('combobox')
    // Other crypto accounts only, never the exchange itself.
    await waitFor(() =>
      expect(
        within(select)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['Vers : à choisir', 'Vers : Ledger test']),
    )
    await user.selectOptions(select, LEDGER.id)
    await waitFor(() =>
      expect(api.cryptoMovementsControllerLink).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: 'm-withdrawal' },
          body: { counterpartAccountId: LEDGER.id },
        }),
      ),
    )
  })
})
