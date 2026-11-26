import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render as baseRender, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { CategoryDto, TransactionDto } from '#/api/types.gen'
import {
  categoryField,
  chooseCategory,
  pickCategory,
} from '#/test/category-picker'
import type { SplitPartDraft } from './edit-draft'
import { SplitEditor } from './SplitEditor'

/** With a query client: the category picker reads the most used. */
function render(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return baseRender(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  )
}

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
  envelopeId: null,
  envelopeAmountCents: null,
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

/** The editor's draft (#435): every change goes into it. */
function Draft({
  item,
  onDraft = () => {},
  showError = false,
  initial = [],
}: {
  item: TransactionDto
  onDraft?: (parts: SplitPartDraft[]) => void
  showError?: boolean
  initial?: SplitPartDraft[]
}) {
  const [parts, setParts] = useState<SplitPartDraft[]>(initial)
  return (
    <SplitEditor
      item={item}
      parts={parts}
      categories={categories}
      showError={showError}
      onChange={(next) => {
        setParts(next)
        onDraft(next)
      }}
      onReset={
        JSON.stringify(parts) !== JSON.stringify(initial)
          ? () => setParts(initial)
          : undefined
      }
    />
  )
}

describe('SplitEditor (#357)', () => {
  it('labels a part in an expense category of money received a refund, each change in the draft', async () => {
    const user = userEvent.setup()
    const onDraft = vi.fn()
    render(<Draft item={payback} onDraft={onDraft} />)
    expect(screen.queryByText('Remboursement')).not.toBeInTheDocument()
    // Nothing to validate here: no « Annuler », no « Valider » (#435).
    expect(
      screen.queryByRole('button', { name: /Valider|Annuler/ }),
    ).not.toBeInTheDocument()

    const amount1 = screen.getByLabelText('Montant de la part 1')
    await user.clear(amount1)
    await user.type(amount1, '40')
    await chooseCategory(
      user,
      categoryField('Catégorie de la part 2'),
      restaurants.name,
    )
    await user.type(screen.getByLabelText('Montant de la part 2'), '20')
    expect(screen.getByText('Remboursement')).toBeInTheDocument()
    expect(
      screen.getByText(/déduit des dépenses Restaurants test/),
    ).toBeInTheDocument()
    expect(onDraft).toHaveBeenLastCalledWith([
      { categoryId: refunds.id, amount: '40' },
      { categoryId: restaurants.id, amount: '20' },
    ])
  })

  it('puts the parts back as they were with « Réinitialiser »', async () => {
    const user = userEvent.setup()
    render(<Draft item={payback} />)
    expect(
      screen.queryByRole('button', { name: 'Réinitialiser' }),
    ).not.toBeInTheDocument()
    const amount1 = screen.getByLabelText('Montant de la part 1')
    await user.clear(amount1)
    await user.type(amount1, '40')
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }))
    // Not split yet: back to the whole amount in its category.
    expect(screen.getByLabelText('Montant de la part 1')).toHaveValue('60')
    expect(
      screen.queryByRole('button', { name: 'Réinitialiser' }),
    ).not.toBeInTheDocument()
  })

  it('never calls a part of money paid out a refund', async () => {
    const user = userEvent.setup()
    render(
      <Draft
        item={{
          ...payback,
          amountCents: -6_000,
          kind: 'expense',
          categoryId: restaurants.id,
          category: { ...restaurants },
        }}
      />,
    )
    await chooseCategory(
      user,
      categoryField('Catégorie de la part 2'),
      restaurants.name,
    )
    expect(screen.queryByText('Remboursement')).not.toBeInTheDocument()
  })

  it('says a transfer category cannot go beside an income one, once ✓ was tried', async () => {
    const user = userEvent.setup()
    render(
      <Draft
        item={payback}
        showError
        initial={[
          { categoryId: refunds.id, amount: '40' },
          { categoryId: '', amount: '20' },
        ]}
      />,
    )
    // The picker opens on the part's kind: the transfers are a tile away.
    await user.click(categoryField('Catégorie de la part 2'))
    await user.click(screen.getByRole('radio', { name: 'Virement' }))
    await pickCategory(user, moves.name)
    expect(screen.getByText(/mouvement interne/)).toBeInTheDocument()
  })
})
