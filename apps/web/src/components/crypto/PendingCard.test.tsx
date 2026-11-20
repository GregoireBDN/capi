import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CryptoPendingDto, CryptoPendingItemDto } from '#/api/types.gen'
import { PendingCard } from './PendingCard'
import { costLines } from './pending-text'

const api = vi.hoisted(() => ({
  cryptoPendingControllerList: vi.fn(),
  cryptoPendingControllerAnswer: vi.fn(),
  cryptoPendingControllerClear: vi.fn(),
  cryptoPendingControllerUnlink: vi.fn(),
  cryptoMovementsControllerLink: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)

vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast }))

/** Testing Library collapses the narrow no-break spaces `Intl` emits. */
const text = (value: string | null) => (value ?? '').replace(/\s/g, ' ')

/** Synthetic data only. */
const ACCOUNT_ID = 'a0000000-0000-4000-8000-000000000031'
const WITHDRAWAL = 'm0000000-0000-4000-8000-000000000001'

function item(overrides: Partial<CryptoPendingItemDto>): CryptoPendingItemDto {
  return {
    movementId: 'm0000000-0000-4000-8000-000000000010',
    type: 'arrival',
    assetId: 'bitcoin',
    symbol: 'BTC',
    quantity: '0.1',
    from: '2026-02-03T08:00:00.000Z',
    at: '2026-02-10T08:00:00.000Z',
    candidates: [],
    ...overrides,
  }
}

const PENDING: CryptoPendingDto = {
  accountId: ACCOUNT_ID,
  items: [
    item({
      candidates: [
        {
          movementId: WITHDRAWAL,
          accountId: 'a0000000-0000-4000-8000-000000000032',
          accountName: 'Plateforme test',
          kind: 'withdrawal',
          quantity: '0.1',
          at: '2026-02-04T10:00:00.000Z',
        },
      ],
    }),
    item({
      movementId: 'm0000000-0000-4000-8000-000000000011',
      type: 'departure',
      quantity: '0.05',
      from: '2026-03-01T08:00:00.000Z',
      at: '2026-03-01T08:00:00.000Z',
    }),
  ],
  answered: [
    {
      movementId: 'm0000000-0000-4000-8000-000000000012',
      type: 'arrival',
      assetId: 'bitcoin',
      symbol: 'BTC',
      quantity: '0.02',
      at: '2026-01-10T08:00:00.000Z',
      answer: 'gift',
      costCents: 0,
      counterpartAccountName: null,
    },
  ],
}

function ok<T>(data: T, status = 200) {
  return Promise.resolve({ data, response: new Response(null, { status }) })
}

function renderCard(writable = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <PendingCard accountId={ACCOUNT_ID} writable={writable} />
    </QueryClientProvider>,
  )
}

describe('PendingCard (« À préciser », #373)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Days are written without their year in the current one.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-20T10:00:00Z'))
    api.cryptoPendingControllerList.mockImplementation(() => ok(PENDING))
    api.cryptoPendingControllerAnswer.mockImplementation(() =>
      ok({ ...PENDING, items: [] }),
    )
    api.cryptoPendingControllerClear.mockImplementation(() => ok(PENDING))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('asks one question per movement, with when it happened', async () => {
    renderCard()
    const card = await screen.findByRole('region', { name: 'À préciser' })
    expect(text(card.textContent)).toContain('2 mouvements')
    const rows = within(card).getAllByRole('button', { name: /\?/ })
    expect(rows.map((row) => text(row.getAttribute('aria-label')))).toEqual([
      'D’où viennent ces 0,1 BTC ? Arrivés entre le 3 févr. et le 10 févr.',
      'Où sont partis ces 0,05 BTC ? Partis le 1er mars',
    ])
  })

  it('links an arrival to the withdrawal it came from', async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(
      await screen.findByRole('button', { name: /D’où viennent ces 0,1 BTC/ }),
    )
    await user.click(
      screen.getByRole('button', { name: /Depuis une plateforme/ }),
    )
    await user.click(
      screen.getByRole('button', { name: /Plateforme test · 0,1 BTC/ }),
    )
    await waitFor(() =>
      expect(api.cryptoPendingControllerAnswer).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: PENDING.items[0].movementId },
          body: { answer: 'transfer', counterpartMovementId: WITHDRAWAL },
        }),
      ),
    )
    expect(toast.success).toHaveBeenCalledWith(
      'Arrivée reliée à son envoi',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Annuler' }),
      }),
    )
  })

  it('takes the cost of coins bought elsewhere, or 0 for a gift', async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(
      await screen.findByRole('button', { name: /D’où viennent ces 0,1 BTC/ }),
    )
    await user.click(screen.getByRole('button', { name: /Achetés ailleurs/ }))
    const save = screen.getByRole('button', { name: 'Enregistrer' })
    expect(save).toBeDisabled()
    await user.type(
      screen.getByRole('textbox', { name: /Ce que vous ont coûté/ }),
      '3 000',
    )
    await user.click(save)
    await waitFor(() =>
      expect(api.cryptoPendingControllerAnswer).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { answer: 'bought', costCents: 300_000 },
        }),
      ),
    )
  })

  it('lets a departure go as sold or given, and takes an answer back', async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(
      await screen.findByRole('button', {
        name: /Où sont partis ces 0,05 BTC/,
      }),
    )
    // No other account received them: no « Vers une plateforme ».
    expect(
      screen.queryByRole('button', { name: /Vers une plateforme/ }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Vendus ou donnés/ }))
    await waitFor(() =>
      expect(api.cryptoPendingControllerAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ body: { answer: 'disposed' } }),
      ),
    )

    await user.click(screen.getByText('Réponses données (1)'))
    await user.click(
      screen.getByRole('button', {
        name: 'Annuler : 0,02 BTC reçus gratuitement',
      }),
    )
    await waitFor(() =>
      expect(api.cryptoPendingControllerClear).toHaveBeenCalled(),
    )
  })

  it('stays hidden with nothing to say, and read only on an archived account', async () => {
    api.cryptoPendingControllerList.mockImplementation(() =>
      ok({ accountId: ACCOUNT_ID, items: [], answered: [] }),
    )
    renderCard()
    await waitFor(() =>
      expect(api.cryptoPendingControllerList).toHaveBeenCalled(),
    )
    expect(screen.queryByRole('region', { name: 'À préciser' })).toBeNull()
  })
})

describe('costLines (« Prix de revient »)', () => {
  it('says what the coins cost and those of unknown cost', () => {
    expect(
      costLines({
        assetId: 'bitcoin',
        symbol: 'BTC',
        quantity: '0.6',
        costCents: 1_500_000,
        unknownQuantity: '0.1',
        valueCents: 4_950_000,
        gainCents: 2_625_000,
      }).map(text),
    ).toEqual([
      'Prix de revient 15 000,00 € · résultat +26 250,00 €',
      'dont 0,1 BTC sans coût connu',
    ])
    expect(
      costLines({
        assetId: 'bitcoin',
        symbol: 'BTC',
        quantity: '0.1',
        costCents: 0,
        unknownQuantity: '0.1',
        valueCents: 825_000,
        gainCents: null,
      }),
    ).toEqual(['Prix de revient inconnu : à préciser'])
  })
})
