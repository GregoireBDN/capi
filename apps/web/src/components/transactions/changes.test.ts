import { describe, expect, it } from 'vitest'
import type { CategoryDto, TransactionDto } from '#/api/types.gen'
import { applyChanges, groupByDay } from './changes'

/** Synthetic data only. */
const groceries: CategoryDto = {
  id: 'c0000000-0000-4000-8000-000000000001',
  slug: 'groceries',
  name: 'Courses',
  kind: 'expense',
  color: '#d97706',
  icon: 'shopping-cart',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  archivedAt: null,
}
const categories = new Map([[groceries.id, groceries]])

function tx(overrides: Partial<TransactionDto> = {}): TransactionDto {
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    accountId: '10000000-0000-4000-8000-000000000001',
    accountName: 'Compte test',
    paidByContactId: null,
    paidByContactName: null,
    importId: null,
    bookingDate: '2026-10-01',
    valueDate: null,
    amountCents: -1_234,
    rawLabel: 'PAIEMENT CB FAKESHOP',
    merchant: null,
    kind: 'income',
    categoryId: null,
    category: null,
    ruleId: 'r0000000-0000-4000-8000-000000000001',
    needsReview: true,
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
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('applyChanges (optimistic, mirrors the API)', () => {
  it('files by hand with the category kind and leaves review', () => {
    expect(
      applyChanges(tx(), { categoryId: groceries.id }, categories),
    ).toMatchObject({
      categoryId: groceries.id,
      category: { name: 'Courses', color: '#d97706', kind: 'expense' },
      kind: 'expense',
      ruleId: null,
      needsReview: false,
    })
  })

  it('sets a kind alone only on an uncategorized row (#368)', () => {
    expect(applyChanges(tx(), { kind: 'transfer' }, categories)).toMatchObject({
      kind: 'transfer',
    })
    const filed = tx({ kind: 'expense', categoryId: groceries.id })
    expect(applyChanges(filed, { kind: 'transfer' }, categories)).toMatchObject(
      { kind: 'expense', ruleId: filed.ruleId },
    )
    // With a category, the category's kind wins.
    expect(
      applyChanges(
        tx(),
        { categoryId: groceries.id, kind: 'transfer' },
        categories,
      ).kind,
    ).toBe('expense')
  })

  it('links a transfer to an account and unlinks it when it stops being one (#296)', () => {
    const transfer = tx({ kind: 'transfer' })
    const names = new Map([['acc-pea', 'PEA test']])
    expect(
      applyChanges(
        transfer,
        { counterpartAccountId: 'acc-pea' },
        categories,
        names,
      ),
    ).toMatchObject({
      counterpartAccountId: 'acc-pea',
      counterpartAccountName: 'PEA test',
    })
    const linked = tx({
      kind: 'transfer',
      counterpartAccountId: 'acc-pea',
      counterpartAccountName: 'PEA test',
    })
    expect(applyChanges(linked, { kind: 'expense' }, categories)).toMatchObject(
      { counterpartAccountId: null, counterpartAccountName: null },
    )
    expect(
      applyChanges(linked, { categoryId: groceries.id }, categories),
    ).toMatchObject({ counterpartAccountId: null })
  })

  it('sets flags and trims the note', () => {
    expect(
      applyChanges(
        tx(),
        { isOneOff: true, needsReview: false, note: '  cadeau ' },
        categories,
      ),
    ).toMatchObject({ isOneOff: true, needsReview: false, note: 'cadeau' })
    expect(
      applyChanges(tx({ note: 'x' }), { note: '' }, categories).note,
    ).toBeNull()
  })
})

describe('groupByDay', () => {
  it('groups consecutive days and totals them without transfers', () => {
    const groups = groupByDay([
      tx({
        id: '1',
        bookingDate: '2026-10-02',
        amountCents: -1_000,
        kind: 'expense',
      }),
      tx({ id: '2', bookingDate: '2026-10-02', amountCents: 250_000 }),
      tx({
        id: '3',
        bookingDate: '2026-10-02',
        amountCents: -50_000,
        kind: 'transfer',
      }),
      tx({
        id: '4',
        bookingDate: '2026-10-01',
        amountCents: 50_000,
        kind: 'transfer',
      }),
    ])
    expect(groups).toMatchObject([
      { date: '2026-10-02', totalCents: 249_000, hasTotal: true },
      { date: '2026-10-01', totalCents: 0, hasTotal: false },
    ])
    expect(groups[0].items.map((item) => item.id)).toEqual(['1', '2', '3'])
  })
})
