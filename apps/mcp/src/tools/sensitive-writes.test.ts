import { describe, expect, it } from 'vitest'
import type { ReceivableDto, RecurringItemDto } from '../api/types.js'
import { checking, restaurants } from '../test/fixtures.js'
import { type Call, connect } from '../test/mock-api.js'

const ITEM = '00000000-0000-4000-8000-0000000000e1'

const streamflix: RecurringItemDto = {
  id: '00000000-0000-4000-8000-0000000000r1',
  accountId: checking.id,
  accountName: checking.name,
  merchantKey: 'streamflix',
  searchText: 'STREAMFLIX',
  name: 'Streamflix',
  direction: 'debit',
  status: 'confirmed',
  categoryId: null,
  categorySlug: null,
  categoryName: 'Loisirs',
  categoryColor: null,
  categoryIcon: null,
  isFixedCost: false,
  isSubscription: true,
  cadence: 'monthly',
  detectedCadence: 'monthly',
  cadenceOverridden: false,
  amountType: 'fixed',
  typicalAmountCents: 1399,
  latestAmountCents: 1399,
  minAmountCents: 1199,
  maxAmountCents: 1399,
  yearlyCostCents: 16788,
  monthlyEquivalentCents: 1399,
  previousAmountCents: 1199,
  priceChangeCents: 200,
  priceChangedOn: '2026-10-05',
  confidence: 0.9,
  active: true,
  firstSeenDate: '2025-01-05',
  lastSeenDate: '2026-11-05',
  nextExpectedDate: '2026-12-05',
  occurrenceCount: 23,
  occurrences: [],
  amountRuns: [],
  notes: null,
  endedOn: null,
  ended: false,
  chargedAfterEnd: null,
  termMonths: null,
  renewalDate: null,
  renewalReminder: false,
  share: null,
  ownMonthlyEquivalentCents: 1399,
  ownYearlyCostCents: 16788,
}

const share: ReceivableDto = {
  id: ITEM,
  direction: 'owed_to_me',
  contactId: '00000000-0000-4000-8000-0000000000a1',
  contactName: 'Alex',
  transactionId: '00000000-0000-4000-8000-0000000000d1',
  splitId: null,
  bookingDate: '2026-11-08',
  label: 'PIZZERIA TEST',
  category: {
    id: restaurants.id,
    name: 'Restaurants',
    color: null,
    icon: null,
  },
  expenseCents: 9500,
  amountCents: 3167,
  billCents: null,
  repaidCents: 0,
  leftCents: 3167,
  state: 'open',
  forgivenCents: 0,
  forgivenAt: null,
  forgivenNote: null,
  note: null,
  origin: 'manual',
  recurringItemId: null,
  payments: [],
}

const writes = (calls: Call[]) =>
  calls.filter((c) => c.method !== 'GET')

describe('cancel_subscription (#597)', () => {
  it('previews without writing, then sets the end date', async () => {
    const { call, calls } = await connect({
      'GET /api/recurring': [streamflix],
      [`PATCH /api/recurring/${streamflix.id}`]: {
        ...streamflix,
        endedOn: '2026-12-01',
      },
    })
    const preview = await call('cancel_subscription', {
      subscription: 'streamflix',
      ended_on: '2026-12-01',
    })
    expect(preview.text).toContain('APERÇU')
    expect(preview.text).toContain(
      'Plus de prélèvement attendu à partir du 01/12/2026.',
    )
    expect(writes(calls)).toEqual([])

    const done = await call('cancel_subscription', {
      subscription: 'Streamflix',
      ended_on: '2026-12-01',
      confirm: true,
    })
    expect(done.text).toContain('Résilié : Streamflix')
    expect(writes(calls).map((c) => c.body)).toEqual([
      { endedOn: '2026-12-01' },
    ])
  })

  it('changes nothing when already cancelled from that day', async () => {
    const { call, calls } = await connect({
      'GET /api/recurring': [{ ...streamflix, endedOn: '2026-12-01' }],
    })
    const { text } = await call('cancel_subscription', {
      subscription: 'Streamflix',
      ended_on: '2026-12-01',
      confirm: true,
    })
    expect(text).toContain('Rien à modifier')
    expect(writes(calls)).toEqual([])
  })

  it('refuses an item that is only detected', async () => {
    const { call } = await connect({
      'GET /api/recurring': [{ ...streamflix, status: 'suggested' }],
    })
    const { text, isError } = await call('cancel_subscription', {
      subscription: 'Streamflix',
      ended_on: '2026-12-01',
      confirm: true,
    })
    expect(isError).toBe(true)
    expect(text).toContain('pas confirmé')
  })
})

describe('forgive_debt (#597)', () => {
  it('previews part of what is left, then lets it go', async () => {
    const { call, calls } = await connect({
      [`GET /api/receivables/${ITEM}`]: share,
      [`POST /api/receivables/${ITEM}/forgive`]: {
        ...share,
        forgivenCents: 1000,
        leftCents: 2167,
      },
    })
    const preview = await call('forgive_debt', { item: ITEM, amount: '10' })
    expect(preview.text).toContain('Alex vous doit 31,67 €')
    expect(preview.text).toContain(
      'Montant effacé : 10,00 € ; reste réclamé : 21,67 €.',
    )
    expect(preview.text).toContain('reviennent dans vos dépenses (Restaurants)')
    expect(writes(calls)).toEqual([])

    const done = await call('forgive_debt', {
      item: ITEM,
      amount: '10',
      confirm: true,
    })
    expect(done.text).toContain('reste 21,67 €')
    expect(writes(calls).map((c) => c.body)).toEqual([{ amountCents: 1000 }])
  })

  it('refuses more than what is left', async () => {
    const { call, calls } = await connect({
      [`GET /api/receivables/${ITEM}`]: share,
    })
    const { isError, text } = await call('forgive_debt', {
      item: ITEM,
      amount: '40',
      confirm: true,
    })
    expect(isError).toBe(true)
    expect(text).toContain('dépasse ce qui reste')
    expect(writes(calls)).toEqual([])
  })

  it('says when nothing is left', async () => {
    const { call, calls } = await connect({
      [`GET /api/receivables/${ITEM}`]: {
        ...share,
        repaidCents: 3167,
        leftCents: 0,
        state: 'repaid',
      },
    })
    const { text } = await call('forgive_debt', { item: ITEM, confirm: true })
    expect(text).toContain('Rien à effacer')
    expect(writes(calls)).toEqual([])
  })
})
