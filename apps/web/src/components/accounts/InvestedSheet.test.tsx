import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountDto } from '#/api/types.gen'
import { InvestedSheet } from './InvestedSheet'

const api = vi.hoisted(() => ({
  accountSnapshotsControllerSetInvestedBase: vi.fn(),
  accountSnapshotsControllerClearInvestedBase: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)

vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast }))

/** Synthetic data only. */
const ID = 'b0000000-0000-4000-8000-000000000360'

function account(overrides: Partial<AccountDto> = {}): AccountDto {
  return {
    id: ID,
    name: 'PEA test',
    type: 'brokerage',
    institution: 'Banque test',
    position: 0,
    archivedAt: null,
    balanceCents: null,
    balanceDate: null,
    cryptoSource: null,
    cryptoProvider: null,
    cryptoSyncedAt: null,
    investedBaseCents: null,
    investedBaseOn: null,
    openedOn: null,
    createdAt: '2026-11-06T10:00:00.000Z',
    updatedAt: '2026-11-06T10:00:00.000Z',
    ...overrides,
  }
}

function ok<T>(data: T) {
  return Promise.resolve({
    data,
    response: new Response(null, { status: 200 }),
  })
}

function renderSheet(props: {
  account: AccountDto
  contributionsCents?: number | null
  onOpenChange?: (open: boolean) => void
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <InvestedSheet
        open
        onOpenChange={props.onOpenChange ?? vi.fn()}
        account={props.account}
        performance={{
          contributionsCents: props.contributionsCents ?? null,
          valueDate: '2026-10-31',
        }}
      />
    </QueryClientProvider>,
  )
}

describe('InvestedSheet', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-06T10:00:00Z'))
    for (const fn of Object.values(api)) fn.mockReset()
    for (const fn of [toast, toast.success, toast.error]) fn.mockReset()
    api.accountSnapshotsControllerSetInvestedBase.mockImplementation(() =>
      ok({}),
    )
    api.accountSnapshotsControllerClearInvestedBase.mockImplementation(() =>
      ok({}),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('takes the amount, then the day, with « Annuler » (#360)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onOpenChange = vi.fn()
    renderSheet({ account: account(), onOpenChange })

    // Step 1: greyed out until an amount is typed.
    expect(screen.getByRole('button', { name: '1. Montant' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    const next = screen.getByRole('button', { name: 'Suivant' })
    expect(next).toBeDisabled()
    await user.type(
      screen.getByRole('textbox', { name: 'Montant investi' }),
      '13 800',
    )
    await user.click(next)

    // Step 2: the latest value's day by default, today or another.
    expect(screen.getByRole('button', { name: '2. Date' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(
      screen.getByRole('radio', { name: 'Dernière valeur, 31 oct. 2026' }),
    ).toBeChecked()
    expect(screen.getByText(/au 31 oct\. 2026/)).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Autre' }))
    const day = screen.getByLabelText('Investi au')
    await user.clear(day)
    await user.type(day, '2026-01-02')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(
        api.accountSnapshotsControllerSetInvestedBase,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: ID },
          body: { amountCents: 1_380_000, on: '2026-01-02' },
        }),
      ),
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(toast.success).toHaveBeenCalledWith(
      'Montant investi enregistré',
      expect.anything(),
    )
    // « Annuler » removes it again: there was none.
    const [, options] = toast.success.mock.calls[0] as [
      string,
      { action: { onClick: () => void } },
    ]
    options.action.onClick()
    await waitFor(() =>
      expect(
        api.accountSnapshotsControllerClearInvestedBase,
      ).toHaveBeenCalled(),
    )
  })

  it('starts from the current base and can remove it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderSheet({
      account: account({
        type: 'life_insurance',
        investedBaseCents: 500_000,
        investedBaseOn: '2026-06-30',
        openedOn: null,
      }),
      contributionsCents: 520_000,
    })

    expect(
      screen.getByRole('textbox', { name: 'Montant investi' }),
    ).toHaveValue('5000')
    expect(screen.getByText(/versements nets/)).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Retirer le montant investi' }),
    )
    await waitFor(() =>
      expect(
        api.accountSnapshotsControllerClearInvestedBase,
      ).toHaveBeenCalled(),
    )
    expect(toast.success).toHaveBeenCalledWith(
      'Montant investi retiré',
      expect.anything(),
    )
  })
})
