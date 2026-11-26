import { describe, expect, it } from 'vitest'
import type { TransactionDto } from '#/api/types.gen'
import { editBody, editDraftOf, fieldsOf, undoBody } from './edit-draft'
import type { EditDraft, EditFields } from './edit-draft'

/** Synthetic data only. */
const ACCOUNT = 'a0000000-0000-4000-8000-000000000001'
const SAVINGS = 'a0000000-0000-4000-8000-000000000002'
const OUTINGS = 'c0000000-0000-4000-8000-000000000001'
const GROCERIES = 'c0000000-0000-4000-8000-000000000002'
const ALEX = 'd0000000-0000-4000-8000-000000000001'
const RULE = 'e0000000-0000-4000-8000-000000000001'

const base: TransactionDto = {
  id: 't0000000-0000-4000-8000-000000000001',
  accountId: ACCOUNT,
  accountName: 'Compte test',
  paidByContactId: null,
  paidByContactName: null,
  importId: 'i0000000-0000-4000-8000-000000000001',
  bookingDate: '2026-11-08',
  valueDate: null,
  amountCents: -6_000,
  rawLabel: 'CB CONCERT FICTIF',
  merchant: null,
  kind: 'expense',
  counterpartAccountId: null,
  counterpartAccountName: null,
  categoryId: GROCERIES,
  category: {
    id: GROCERIES,
    name: 'Courses',
    slug: 'groceries',
    kind: 'expense',
    icon: null,
    color: null,
  },
  ruleId: RULE,
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

/** `editBody` of `item` after `fields` and `draft` changed. */
function bodyOf(
  item: TransactionDto,
  fields: Partial<EditFields> = {},
  draft: Partial<EditDraft> = {},
) {
  const was = fieldsOf(item)
  const initial = editDraftOf(item)
  return editBody({
    item,
    was,
    fields: { ...was, ...fields },
    initial,
    draft: { ...initial, ...draft },
  })
}

describe('editBody (#435)', () => {
  it('is empty while nothing changed', () => {
    expect(bodyOf(base)).toEqual({})
    expect(bodyOf({ ...base, manual: true, importId: null })).toEqual({})
  })

  it('sends a bank row’s category, flags and note as one set of changes', () => {
    expect(
      bodyOf(base, {
        categoryId: OUTINGS,
        isOneOff: true,
        needsReview: true,
        note: ' Concert ',
      }),
    ).toEqual({
      changes: {
        categoryId: OUTINGS,
        isOneOff: true,
        needsReview: true,
        note: 'Concert',
      },
    })
    // « Sans catégorie » with the kind chosen (#368).
    expect(bodyOf(base, { categoryId: '', kind: 'transfer' })).toEqual({
      changes: { categoryId: null, kind: 'transfer' },
    })
  })

  it('sends a manual row’s fields, its review flag beside them', () => {
    const manual = { ...base, manual: true, importId: null }
    expect(
      bodyOf(manual, { amount: '65,5', date: '2026-11-07', needsReview: true }),
    ).toEqual({
      manual: {
        amountCents: 6_550,
        direction: 'out',
        bookingDate: '2026-11-07',
      },
      changes: { needsReview: true },
    })
  })

  it('sends a transfer’s other account only while it stays a transfer', () => {
    const transfer = {
      ...base,
      kind: 'transfer' as const,
      categoryId: null,
      category: null,
    }
    expect(bodyOf(transfer, {}, { counterpartAccountId: SAVINGS })).toEqual({
      changes: { counterpartAccountId: SAVINGS },
    })
    expect(
      bodyOf(
        transfer,
        { kind: 'expense', categoryId: GROCERIES },
        { counterpartAccountId: SAVINGS },
      ),
    ).toEqual({ changes: { categoryId: GROCERIES } })
  })

  it('sends the split, its end, the prepaid term, the bank values', () => {
    const parts = [
      { categoryId: GROCERIES, amountCents: -4_000 },
      { categoryId: OUTINGS, amountCents: -2_000 },
    ]
    // Typed as text, sent in signed cents; « 40,00 » is still 40 €.
    expect(
      bodyOf(
        base,
        {},
        {
          splits: [
            { categoryId: GROCERIES, amount: '40,00' },
            { categoryId: OUTINGS, amount: '20' },
          ],
        },
      ),
    ).toEqual({ split: { parts } })
    const split = {
      ...base,
      splits: parts.map((part, index) => ({
        ...part,
        id: `s${index}`,
        kind: 'expense' as const,
        category: base.category!,
      })),
    }
    expect(bodyOf(split, {}, { splits: [] })).toEqual({ split: null })
    expect(bodyOf(base, {}, { prepaidTermMonths: 12 })).toEqual({
      prepaidTermMonths: 12,
    })
    expect(bodyOf(base, {}, { restoreBank: true })).toEqual({
      restoreBankValues: true,
    })
  })

  it('sends the shares when they change, following an amount split in half', () => {
    const shared: TransactionDto = {
      ...base,
      manual: true,
      importId: null,
      shares: [
        {
          id: 'r1',
          direction: 'owed_to_me',
          contactId: ALEX,
          contactName: 'Alex',
          splitId: null,
          amountCents: 3_000,
          repaidCents: 0,
          forgivenCents: 0,
          billCents: null,
          state: 'open',
        },
      ],
    }
    // Half of 60 €: unchanged.
    expect(bodyOf(shared)).toEqual({})
    // Half of 80 € once the amount changes.
    expect(bodyOf(shared, { amount: '80' })).toEqual({
      manual: { amountCents: 8_000, direction: 'out' },
      shares: { shares: [{ contactId: ALEX, amountCents: 4_000 }] },
    })
    // Nobody any more.
    expect(
      bodyOf(shared, {}, { share: { people: [], mode: 'equal', texts: [] } }),
    ).toEqual({ shares: { shares: [] } })
  })

  it('sends the repayments to unlink and to link', () => {
    expect(
      bodyOf(
        base,
        {},
        {
          repayment: {
            unlink: ['p1'],
            link: {
              items: [
                {
                  receivableId: 'r2',
                  amountCents: 1_500,
                  contactName: 'Alex',
                  label: 'Ciné',
                },
              ],
            },
          },
        },
      ),
    ).toEqual({
      repayments: {
        unlink: ['p1'],
        link: { items: [{ receivableId: 'r2', amountCents: 1_500 }] },
      },
    })
  })
})

describe('undoBody (#435)', () => {
  it('puts back what the save changed, a rule’s category with its rule', () => {
    const saved = { ...base, categoryId: OUTINGS, ruleId: null, note: 'x' }
    expect(
      undoBody(base, { changes: { categoryId: OUTINGS, note: 'x' } }, saved),
    ).toEqual({
      changes: {
        categoryId: GROCERIES,
        ruleId: RULE,
        needsReview: false,
        note: '',
      },
    })
  })

  it('puts back a manual row’s fields and its split', () => {
    const manual = { ...base, manual: true, importId: null, ruleId: null }
    expect(
      undoBody(
        manual,
        { manual: { amountCents: 7_000, direction: 'out', label: 'Autre' } },
        manual,
      ),
    ).toEqual({
      manual: { amountCents: 6_000, direction: 'out', label: base.rawLabel },
    })
    const parts = [
      { categoryId: GROCERIES, amountCents: -4_000 },
      { categoryId: OUTINGS, amountCents: -2_000 },
    ]
    // A new split filed it in its largest part's category: both put back.
    expect(undoBody(manual, { split: { parts } }, manual)).toEqual({
      changes: { categoryId: GROCERIES, needsReview: false },
      split: null,
    })
  })

  it('links back what was unlinked and unlinks what was linked', () => {
    const repayment = {
      id: 'p1',
      receivableId: 'r1',
      direction: 'owed_to_me' as const,
      contactId: ALEX,
      contactName: 'Alex',
      splitId: null,
      amountCents: 1_000,
    }
    const before = { ...base, amountCents: 2_000, repayments: [repayment] }
    const after = {
      ...before,
      repayments: [{ ...repayment, id: 'p2', receivableId: 'r2' }],
    }
    expect(
      undoBody(
        before,
        {
          repayments: {
            unlink: ['p1'],
            link: { items: [{ receivableId: 'r2', amountCents: 1_000 }] },
          },
        },
        after,
      ),
    ).toEqual({
      repayments: {
        unlink: ['p2'],
        link: { items: [{ receivableId: 'r1', amountCents: 1_000 }] },
      },
    })
  })

  it('cannot undo the bank values put back or a prepaid item declared', () => {
    expect(undoBody(base, { restoreBankValues: true }, base)).toBeNull()
    expect(undoBody(base, { prepaidTermMonths: 12 }, base)).toBeNull()
    const prepaid = { ...base, prepaidItemId: 'x', prepaidTermMonths: 12 }
    expect(undoBody(prepaid, { prepaidTermMonths: 24 }, prepaid)).toEqual({
      prepaidTermMonths: 12,
    })
  })
})
