// Money owed (#359): owed_to_me reads both lists, share_expense and
// link_repayment preview without writing, save with confirm, change nothing
// on a re-run and refuse in French what goes past the expense or the item.
// Synthetic names and amounts only.
import { describe, expect, it } from 'vitest'
import type {
  ContactDto,
  OwedSummaryDto,
  ReceivableDto,
  RepaymentOptionsDto,
  TransactionDto,
  TransactionListDto,
} from '../api/types.js'
import { restaurants, salary, transaction } from '../test/fixtures.js'
import { connect } from '../test/mock-api.js'
import { itemLine } from './owed.js'
import { divideHalfEven, shareOf } from './owed-writes.js'

const DINNER = '00000000-0000-4000-8000-0000000000d1'
const TRANSFER = '00000000-0000-4000-8000-0000000000d2'
const ALEX = '00000000-0000-4000-8000-0000000000e1'
const SAM = '00000000-0000-4000-8000-0000000000e2'
const ITEM = '00000000-0000-4000-8000-0000000000f1'

const contact = (id: string, name: string, owed = 0): ContactDto => ({
  id,
  name,
  matchLabels: [],
  repaymentDay: null,
  archivedAt: null,
  owedToMeCents: owed,
  iOweCents: 0,
})

/** A 95 € dinner paid by the owner. */
const dinner: TransactionDto = {
  ...transaction,
  id: DINNER,
  bookingDate: '2026-11-08',
  amountCents: -9500,
  rawLabel: 'CB PIZZERIA TEST',
  merchant: 'PIZZERIA TEST',
  categoryId: restaurants.id,
  category: {
    id: restaurants.id,
    slug: restaurants.slug,
    name: restaurants.name,
    color: null,
    icon: null,
    kind: 'expense',
  },
}

const sharedDinner: TransactionDto = {
  ...dinner,
  shares: [ALEX, SAM].map((id, index) => ({
    id: `00000000-0000-4000-8000-00000000009${index}`,
    direction: 'owed_to_me' as const,
    contactId: id,
    contactName: id === ALEX ? 'Alex' : 'Sam',
    splitId: null,
    amountCents: 3167,
    repaidCents: 0,
    forgivenCents: 0,
    billCents: null,
    state: 'open' as const,
  })),
}

/** 40 € received from Alex, filed in income. */
const transfer: TransactionDto = {
  ...transaction,
  id: TRANSFER,
  bookingDate: '2026-11-12',
  amountCents: 4000,
  rawLabel: 'VIR ALEX TEST',
  merchant: null,
  kind: 'income',
  categoryId: salary.id,
  category: {
    id: salary.id,
    slug: salary.slug,
    name: 'Remboursements',
    color: null,
    icon: null,
    kind: 'income',
  },
}

const item: ReceivableDto = {
  id: ITEM,
  direction: 'owed_to_me',
  contactId: ALEX,
  contactName: 'Alex',
  transactionId: DINNER,
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

const options: RepaymentOptionsDto = {
  transactionId: TRANSFER,
  splitId: null,
  direction: 'owed_to_me',
  amountCents: 4000,
  linkedCents: 0,
  availableCents: 4000,
  contacts: [{ id: ALEX, name: 'Alex', owedCents: 3167, matched: true }],
  contactId: ALEX,
  items: [item],
  suggestion: [{ receivableId: ITEM, amountCents: 3167 }],
  exact: false,
}

function routes(current: TransactionDto, contacts: ContactDto[]) {
  return {
    'GET /api/transactions': (): TransactionListDto => ({
      items: [current],
      total: 1,
      page: 1,
      limit: 100,
    }),
    'GET /api/contacts': contacts,
    'POST /api/receivables': sharedDinner,
    'GET /api/receivables/repayment-options': options,
    'POST /api/receivables/payments': {
      payments: [],
      linkedCents: 3167,
      restCents: 833,
    },
  }
}

describe('share arithmetic', () => {
  it('rounds half to even, the remainder on the owner', () => {
    expect(divideHalfEven(9500, 3)).toBe(3167)
    expect(shareOf('parts égales', 10000, 2)).toBe(3333)
    expect(shareOf('moitié', 9000, 1)).toBe(4500)
    expect(shareOf('30', 9000, 2)).toBe(3000)
  })
})

describe('itemLine (#437)', () => {
  it('shows the part let go beside what was received', () => {
    // 60 €, 20 € repaid, 20 € let go: 20 € still owed.
    const partly = {
      ...item,
      amountCents: 6000,
      repaidCents: 2000,
      forgivenCents: 2000,
      leftCents: 2000,
      forgivenAt: '2026-11-10T10:00:00.000Z',
    }
    expect(itemLine(partly)).toContain(
      'reste 20,00 € (reçu 20,00 €, abandonné 20,00 €)',
    )
    expect(
      itemLine({
        ...partly,
        repaidCents: 4000,
        leftCents: 0,
        state: 'forgiven',
      }),
    ).toContain('abandonné (reçu 40,00 €, abandonné 20,00 €)')
    expect(
      itemLine({
        ...partly,
        repaidCents: 0,
        forgivenCents: 6000,
        leftCents: 0,
        state: 'forgiven',
      }),
    ).toContain(' · abandonné · ')
  })
})

describe('owed_to_me', () => {
  it('lists both directions apart, never netted', async () => {
    const summary: OwedSummaryDto = {
      today: '2026-11-14',
      month: '2026-11',
      owedToMe: {
        totalCents: 7500,
        contacts: [
          {
            contactId: SAM,
            name: 'Sam',
            owedCents: 7500,
            openCount: 2,
            oldestOpenDate: '2026-10-05',
            oldestOpenDays: 40,
          },
        ],
        settled: [
          {
            contactId: ALEX,
            name: 'Alex',
            owedCents: 0,
            openCount: 0,
            oldestOpenDate: null,
            oldestOpenDays: null,
          },
        ],
      },
      iOwe: {
        totalCents: 3000,
        contacts: [
          {
            contactId: SAM,
            name: 'Sam',
            owedCents: 3000,
            openCount: 1,
            oldestOpenDate: '2026-11-02',
            oldestOpenDays: 12,
          },
        ],
        settled: [],
      },
      expected: [],
    }
    const { call } = await connect({ 'GET /api/owed': summary })
    const { text, isError } = await call('owed_to_me')
    expect(isError).toBe(false)
    expect(text).toContain('Ce qu’on me doit : 75,00 €')
    expect(text).toContain('- Sam : 75,00 € (2 dépenses')
    expect(text).toContain('Tout réglé : Alex')
    expect(text).toContain('Ce que je dois : 30,00 €')
    expect(text).toContain('- Sam : 30,00 € (1 dépense')
  })
})

describe('share_expense', () => {
  it('previews equal parts and the owner’s part, writing nothing', async () => {
    const { call, writes } = await connect(
      routes(dinner, [contact(ALEX, 'Alex', 1000)]),
    )
    const { text, isError } = await call('share_expense', {
      id: DINNER,
      contacts: ['alex', 'Sam'],
      share: 'parts égales',
    })
    expect(isError).toBe(false)
    expect(text).toContain('APERÇU')
    expect(text).toContain('- Alex : 31,67 € · lui doit 10,00 € → 41,67 €')
    expect(text).toContain('- Sam (nouveau contact) : 31,67 €')
    expect(text).toContain('Ma part : 31,66 € sur 95,00 €')
    expect(text).toContain('Restaurants 95,00 € → 31,66 €')
    expect(writes()).toHaveLength(0)
  })

  it('saves with confirm, then a re-run changes nothing', async () => {
    const { call, writes } = await connect(
      routes(dinner, [contact(ALEX, 'Alex')]),
    )
    const saved = await call('share_expense', {
      id: DINNER,
      contacts: ['Alex', 'Sam'],
      share: 'parts égales',
      confirm: true,
    })
    expect(saved.isError).toBe(false)
    expect(writes()).toHaveLength(1)
    expect(writes()[0]?.body).toEqual({
      transactionId: DINNER,
      shares: [
        { contactId: ALEX, amountCents: 3167 },
        { contactName: 'Sam', amountCents: 3167 },
      ],
    })

    const again = await connect(routes(sharedDinner, [contact(ALEX, 'Alex')]))
    const rerun = await again.call('share_expense', {
      id: DINNER,
      contacts: ['Alex', 'Sam'],
      share: 'parts égales',
      confirm: true,
    })
    expect(rerun.text).toContain('Rien à modifier')
    expect(again.writes()).toHaveLength(0)
  })

  it('refuses shares above the expense in French', async () => {
    const { call, writes } = await connect(routes(dinner, []))
    const { text, isError } = await call('share_expense', {
      id: DINNER,
      contacts: ['Alex', 'Sam'],
      share: '50',
      confirm: true,
    })
    expect(isError).toBe(true)
    expect(text).toContain('ne peuvent pas la dépasser')
    expect(writes()).toHaveLength(0)
  })
})

describe('link_repayment', () => {
  it('previews the suggestion and what stays in the category', async () => {
    const { call, writes } = await connect(routes(transfer, []))
    const { text, isError } = await call('link_repayment', {
      id: TRANSFER,
      items: 'auto',
    })
    expect(isError).toBe(false)
    expect(text).toContain('APERÇU')
    expect(text).toContain('→ 31,67 €')
    expect(text).toContain('reste dans Remboursements : 8,33 €')
    expect(text).toContain('Alex vous doit 31,67 € → 0,00 €')
    expect(writes()).toHaveLength(0)
  })

  it('links with confirm, and a re-run changes nothing', async () => {
    const { call, writes } = await connect(routes(transfer, []))
    const saved = await call('link_repayment', {
      id: TRANSFER,
      items: 'auto',
      confirm: true,
    })
    expect(saved.isError).toBe(false)
    expect(writes()[0]?.body).toEqual({
      transactionId: TRANSFER,
      items: [{ receivableId: ITEM, amountCents: 3167 }],
    })

    const linked: TransactionDto = {
      ...transfer,
      repayments: [
        {
          id: '00000000-0000-4000-8000-0000000000b1',
          receivableId: ITEM,
          direction: 'owed_to_me',
          contactId: ALEX,
          contactName: 'Alex',
          splitId: null,
          amountCents: 3167,
        },
      ],
    }
    const again = await connect({
      ...routes(linked, []),
      'GET /api/receivables/repayment-options': {
        ...options,
        linkedCents: 3167,
        availableCents: 833,
        items: [],
        suggestion: [],
      },
    })
    const rerun = await again.call('link_repayment', {
      id: TRANSFER,
      items: 'auto',
      confirm: true,
    })
    expect(rerun.isError).toBe(false)
    expect(rerun.text).toContain('Rien à modifier')
    expect(again.writes()).toHaveLength(0)
  })

  it('refuses a repayment above what is still owed, in French', async () => {
    const { call, writes } = await connect(routes(transfer, []))
    const { text, isError } = await call('link_repayment', {
      id: TRANSFER,
      items: [{ item: ITEM, amount: '35' }],
      confirm: true,
    })
    expect(isError).toBe(true)
    expect(text).toContain('dépasse ce qui reste dû')
    expect(writes()).toHaveLength(0)
  })
})
