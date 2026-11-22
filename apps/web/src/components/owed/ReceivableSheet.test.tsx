import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReceivableDto } from '#/api/types.gen'
import { ok, renderWithClient } from '#/components/import/test-fixtures'
import { ReceivableSheet } from './ReceivableSheet'

const api = vi.hoisted(() => ({
  receivablesControllerForgive: vi.fn(),
  receivablesControllerUnforgive: vi.fn(),
  transactionsControllerList: vi.fn(),
}))
vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

/** A 90 € dinner, Sam's share 60 €, 20 € repaid. Synthetic. */
const item: ReceivableDto = {
  id: 'a0000000-0000-4000-8000-000000000010',
  direction: 'owed_to_me',
  contactId: 'a0000000-0000-4000-8000-000000000002',
  contactName: 'Sam',
  transactionId: 'a0000000-0000-4000-8000-000000000020',
  splitId: null,
  bookingDate: '2026-10-05',
  label: 'Restaurant fictif',
  category: null,
  expenseCents: 9000,
  amountCents: 6000,
  billCents: null,
  repaidCents: 2000,
  leftCents: 4000,
  state: 'open',
  forgivenCents: 0,
  forgivenAt: null,
  forgivenNote: null,
  note: null,
  origin: 'manual',
  recurringItemId: null,
  payments: [
    {
      id: 'a0000000-0000-4000-8000-000000000030',
      receivableId: 'a0000000-0000-4000-8000-000000000010',
      transactionId: 'a0000000-0000-4000-8000-000000000040',
      amountCents: 2000,
      paidOn: '2026-10-10',
      note: null,
      label: 'VIR SAM FICTIF',
    },
  ],
}

function text(element: HTMLElement) {
  return element.textContent.replace(/\s/g, ' ')
}

describe('ReceivableSheet, letting part go (#437)', () => {
  beforeEach(() => {
    api.receivablesControllerForgive.mockReset()
    api.receivablesControllerForgive.mockResolvedValue(ok(item))
  })

  it('asks how much, everything left by default, and lets 20 € go', async () => {
    const user = userEvent.setup()
    renderWithClient(<ReceivableSheet item={item} onOpenChange={vi.fn()} />)
    await user.click(
      screen.getByRole('button', { name: 'Je ne me fais pas rembourser' }),
    )
    const field = screen.getByLabelText('Montant abandonné')
    expect(field).toHaveValue('40')
    expect(screen.getByRole('button', { name: 'Tout' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.clear(field)
    await user.type(field, '20')
    expect(text(document.body)).toContain('Sam vous doit encore 20,00 €')
    await user.click(screen.getByRole('button', { name: /^Abandonner 20,00/ }))
    expect(api.receivablesControllerForgive).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: item.id },
        body: { amountCents: 2000, note: null },
      }),
    )
  })

  it('refuses more than what is left', async () => {
    const user = userEvent.setup()
    renderWithClient(<ReceivableSheet item={item} onOpenChange={vi.fn()} />)
    await user.click(
      screen.getByRole('button', { name: 'Je ne me fais pas rembourser' }),
    )
    const field = screen.getByLabelText('Montant abandonné')
    await user.clear(field)
    await user.type(field, '41')
    expect(
      screen.getByText(/^Plus que ce qui reste dû \(40,00/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^Abandonner 41,00/ }),
    ).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Tout' }))
    expect(field).toHaveValue('40')
  })

  it('shows what was let go beside the repayments, and « Réclamer » on it while some is still claimed', () => {
    renderWithClient(
      <ReceivableSheet
        item={{
          ...item,
          forgivenCents: 2000,
          forgivenAt: '2026-10-21T10:00:00.000Z',
          forgivenNote: 'sa part du vin',
          leftCents: 2000,
        }}
        onOpenChange={vi.fn()}
      />,
    )
    const history = screen.getByRole('list')
    expect(text(history)).toContain('VIR SAM FICTIF')
    expect(text(history)).toContain('« sa part du vin »')
    expect(text(history)).toContain('20,00 € abandonnés')
    expect(screen.getByRole('button', { name: 'Réclamer' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Lier un remboursement' }),
    ).toBeInTheDocument()
  })
})
