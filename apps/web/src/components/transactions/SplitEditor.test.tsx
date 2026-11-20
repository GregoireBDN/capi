import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CategoryDto, TransactionDto } from '#/api/types.gen'
import { SplitEditor } from './SplitEditor'

/** Synthetic data only. */
function category(
  n: number,
  name: string,
  kind: CategoryDto['kind'],
): CategoryDto {
  return {
    id: `c0000000-0000-4000-8000-00000000000${n}`,
    slug: name.toLowerCase(),
    name,
    kind,
    color: '#d97706',
    icon: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  }
}
const restaurants = category(1, 'Restaurants test', 'expense')
const refunds = category(2, 'Remboursements test', 'income')
const moves = category(3, 'Virements test', 'transfer')
const categories = [restaurants, refunds, moves]

/** 60 € received from a friend, filed in « Remboursements ». */
const payback: TransactionDto = {
  id: 'a0000000-0000-4000-8000-000000000001',
  accountId: '10000000-0000-4000-8000-000000000001',
  accountName: 'Compte test',
  paidByContactId: null,
  paidByContactName: null,
  importId: null,
  bookingDate: '2026-10-20',
  valueDate: null,
  amountCents: 6_000,
  rawLabel: 'VIR SEPA RECU AMI TEST',
  merchant: null,
  kind: 'income',
  categoryId: refunds.id,
  category: { ...refunds },
  ruleId: null,
  needsReview: false,
  isOneOff: false,
  note: null,
  manual: false,
  prepaidItemId: null,
  prepaidTermMonths: null,
  originalAmountCents: null,
  originalBookingDate: null,
  counterpartAccountId: null,
  counterpartAccountName: null,
  splits: [],
  shares: [],
  repayments: [],
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z',
}

describe('SplitEditor (#357)', () => {
  it('labels a part in an expense category of money received a refund', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <SplitEditor
        item={payback}
        categories={categories}
        onSave={onSave}
        onCancel={() => {}}
      />,
    )
    expect(screen.queryByText('Remboursement')).not.toBeInTheDocument()

    const amount1 = screen.getByLabelText('Montant de la part 1')
    await user.clear(amount1)
    await user.type(amount1, '40')
    await user.selectOptions(
      screen.getByLabelText('Catégorie de la part 2'),
      restaurants.id,
    )
    await user.type(screen.getByLabelText('Montant de la part 2'), '20')
    expect(screen.getByText('Remboursement')).toBeInTheDocument()
    expect(
      screen.getByText(/déduit des dépenses Restaurants test/),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Enregistrer la répartition' }),
    )
    expect(onSave).toHaveBeenCalledWith([
      { categoryId: refunds.id, amountCents: 4_000 },
      { categoryId: restaurants.id, amountCents: 2_000 },
    ])
  })

  it('never calls a part of money paid out a refund', async () => {
    const user = userEvent.setup()
    render(
      <SplitEditor
        item={{
          ...payback,
          amountCents: -6_000,
          kind: 'expense',
          categoryId: restaurants.id,
          category: { ...restaurants },
        }}
        categories={categories}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    )
    await user.selectOptions(
      screen.getByLabelText('Catégorie de la part 2'),
      restaurants.id,
    )
    expect(screen.queryByText('Remboursement')).not.toBeInTheDocument()
  })

  it('refuses a transfer category beside an income one', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <SplitEditor
        item={payback}
        categories={categories}
        onSave={onSave}
        onCancel={() => {}}
      />,
    )
    const amount1 = screen.getByLabelText('Montant de la part 1')
    await user.clear(amount1)
    await user.type(amount1, '40')
    await user.selectOptions(
      screen.getByLabelText('Catégorie de la part 2'),
      moves.id,
    )
    await user.type(screen.getByLabelText('Montant de la part 2'), '20')
    await user.click(
      screen.getByRole('button', { name: 'Enregistrer la répartition' }),
    )
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText(/mouvement interne/)).toBeInTheDocument()
  })
})
