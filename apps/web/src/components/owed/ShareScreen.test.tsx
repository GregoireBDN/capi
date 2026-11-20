import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContactDto, TransactionDto } from '#/api/types.gen'
import { ok, renderWithClient } from '#/components/import/test-fixtures'
import { ShareScreen } from './ShareScreen'

const api = vi.hoisted(() => ({
  contactsControllerList: vi.fn(),
  owedLinksControllerReplaceShares: vi.fn(),
}))
vi.mock('#/api', () => api)

/** Synthetic data only. */
const contact = (id: string, name: string): ContactDto => ({
  id,
  name,
  matchLabels: [],
  repaymentDay: null,
  archivedAt: null,
  owedToMeCents: 0,
  iOweCents: 0,
})
const ALEX = contact('a0000000-0000-4000-8000-000000000001', 'Alex')
const SAM = contact('a0000000-0000-4000-8000-000000000002', 'Sam')

/** A 95 € dinner paid from the checking account. */
const dinner: TransactionDto = {
  id: 't0000000-0000-4000-8000-000000000001',
  accountId: 'c0000000-0000-4000-8000-000000000001',
  accountName: 'Compte test',
  paidByContactId: null,
  paidByContactName: null,
  importId: null,
  bookingDate: '2026-11-08',
  valueDate: null,
  amountCents: -9500,
  rawLabel: 'CB PIZZERIA TEST',
  merchant: null,
  kind: 'expense',
  counterpartAccountId: null,
  counterpartAccountName: null,
  categoryId: null,
  category: null,
  ruleId: null,
  needsReview: false,
  isOneOff: false,
  note: null,
  manual: false,
  prepaidItemId: null,
  prepaidTermMonths: null,
  originalAmountCents: null,
  originalBookingDate: null,
  splits: [],
  shares: [],
  repayments: [],
  createdAt: '2026-11-08T00:00:00.000Z',
  updatedAt: '2026-11-08T00:00:00.000Z',
}

/** Testing Library collapses the narrow no-break spaces `Intl` emits. */
function text(element: HTMLElement) {
  return element.textContent.replace(/\s/g, ' ')
}

describe('ShareScreen (#359, « A. Un mode pour tous »)', () => {
  beforeEach(() => {
    api.contactsControllerList.mockResolvedValue(ok([ALEX, SAM]))
    api.owedLinksControllerReplaceShares.mockResolvedValue(ok(dinner))
  })

  it('gives each person half or an equal part, the rest to « Ma part », and saves', async () => {
    const user = userEvent.setup()
    renderWithClient(<ShareScreen item={dinner} />)

    await user.click(await screen.findByRole('button', { name: /Alex/ }))
    expect(screen.getByRole('radio', { name: 'Moitié' })).toBeInTheDocument()
    expect(text(screen.getByText('Ma part').parentElement!)).toContain(
      '47,50 € sur 95,00 €',
    )

    await user.click(screen.getByRole('button', { name: /Sam/ }))
    expect(
      screen.getByRole('radio', { name: 'Parts égales' }),
    ).toBeInTheDocument()
    // 95 € between three: 31,67 € each, the rounding on the owner.
    expect(text(screen.getByText('Ma part').parentElement!)).toContain(
      '31,66 € sur 95,00 €',
    )

    await waitFor(
      () =>
        expect(api.owedLinksControllerReplaceShares).toHaveBeenCalledWith(
          expect.objectContaining({
            path: { id: dinner.id },
            body: {
              shares: [
                { contactId: ALEX.id, amountCents: 3167 },
                { contactId: SAM.id, amountCents: 3167 },
              ],
            },
          }),
        ),
      { timeout: 2000 },
    )
  })

  it('shows parts above the expense in red and never saves them', async () => {
    const user = userEvent.setup()
    renderWithClient(<ShareScreen item={dinner} />)
    await user.click(await screen.findByRole('button', { name: /Alex/ }))
    await user.click(screen.getByRole('radio', { name: 'Montants' }))
    const field = screen.getByLabelText('Part de Alex')
    await user.clear(field)
    await user.type(field, '120')
    expect(text(screen.getByText('Ma part').parentElement!)).toContain(
      '25,00 € de trop',
    )
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(api.owedLinksControllerReplaceShares).not.toHaveBeenCalledWith(
      expect.objectContaining({
        body: { shares: [{ contactId: ALEX.id, amountCents: 12000 }] },
      }),
    )
  })
})
