import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { ContactDto, TransactionDto } from '#/api/types.gen'
import { draftOf, ShareFields, shareValid, sharesOf } from './ShareScreen'
import type { ShareDraft } from './ShareScreen'

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
  envelopeId: null,
  envelopeAmountCents: null,
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

/** The editor's draft (#435): what is shared, never saved here. */
function Draft({ onDraft }: { onDraft: (draft: ShareDraft) => void }) {
  const [draft, setDraft] = useState(() => draftOf(dinner))
  return (
    <ShareFields
      totalCents={-dinner.amountCents}
      draft={draft}
      onChange={(next) => {
        setDraft(next)
        onDraft(next)
      }}
      contacts={[ALEX, SAM]}
    />
  )
}

describe('ShareFields (#359, « A. Un mode pour tous »)', () => {
  it('gives each person half or an equal part, the rest to « Ma part »', async () => {
    const user = userEvent.setup()
    let last = draftOf(dinner)
    render(<Draft onDraft={(draft) => (last = draft)} />)

    await user.click(screen.getByRole('button', { name: /Alex/ }))
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
    expect(shareValid(last, 9500)).toBe(true)
    expect(sharesOf(last, 9500)).toEqual([
      { contactId: ALEX.id, amountCents: 3167 },
      { contactId: SAM.id, amountCents: 3167 },
    ])
  })

  it('shows parts above the expense in red, a draft that cannot be saved', async () => {
    const user = userEvent.setup()
    let last = draftOf(dinner)
    render(<Draft onDraft={(draft) => (last = draft)} />)
    await user.click(screen.getByRole('button', { name: /Alex/ }))
    await user.click(screen.getByRole('radio', { name: 'Montants' }))
    const field = screen.getByLabelText('Part de Alex')
    await user.clear(field)
    await user.type(field, '120')
    expect(text(screen.getByText('Ma part').parentElement!)).toContain(
      '25,00 € de trop',
    )
    expect(shareValid(last, 9500)).toBe(false)
  })
})
