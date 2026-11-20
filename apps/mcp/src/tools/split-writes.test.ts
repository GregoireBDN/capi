// split_transaction (#357): preview writes nothing, confirm saves the split,
// the same parts again change nothing, parts that don't add up are refused.
// Synthetic data only.
import { describe, expect, it } from 'vitest'
import type {
  BudgetMonthDto,
  CategoryDto,
  TransactionDto,
  TransactionListDto,
} from '../api/types.js'
import {
  groceries,
  period,
  restaurants,
  salary,
  transaction,
} from '../test/fixtures.js'
import { connect, jsonError } from '../test/mock-api.js'

const refunds: CategoryDto = {
  ...salary,
  id: '00000000-0000-4000-8000-0000000000c9',
  slug: 'refunds',
  name: 'Remboursements',
}
const ownMoves: CategoryDto = {
  ...salary,
  id: '00000000-0000-4000-8000-0000000000c8',
  slug: 'own_moves',
  name: 'Virements internes',
  kind: 'transfer',
}
const categories = [groceries, restaurants, salary, refunds, ownMoves]
const ID = '00000000-0000-4000-8000-0000000000a1'

const categoryRef = (c: CategoryDto) => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  color: null,
  icon: null,
  kind: c.kind,
})

/** 60 € received from a friend, filed in « Remboursements ». */
const payback: TransactionDto = {
  ...transaction,
  id: ID,
  bookingDate: '2026-10-20',
  amountCents: 6000,
  rawLabel: 'VIR SEPA RECU AMI TEST',
  merchant: null,
  kind: 'income',
  categoryId: refunds.id,
  category: categoryRef(refunds),
}

const splitPayback: TransactionDto = {
  ...payback,
  splits: [
    {
      id: 's1',
      categoryId: restaurants.id,
      category: categoryRef(restaurants),
      amountCents: 2000,
      kind: 'expense',
    },
    {
      id: 's2',
      categoryId: refunds.id,
      category: categoryRef(refunds),
      amountCents: 4000,
      kind: 'income',
    },
  ],
}

const budget: BudgetMonthDto = {
  month: '2026-10',
  period: period({ month: '2026-10', status: 'complete' }),
  items: [
    {
      categoryId: restaurants.id,
      slug: 'restaurants',
      name: 'Restaurants',
      color: null,
      icon: null,
      targetCents: 15000,
      effectiveFrom: '2026-09',
      note: null,
      tracked: true,
      spentCents: 12000,
      spentExcludingOneOffsCents: 12000,
      prepaid: [],
      remainingCents: 3000,
      percentUsed: 80,
      status: 'warning',
    },
  ],
  totals: {
    targetCents: 15000,
    spentCents: 12000,
    spentExcludingOneOffsCents: 12000,
    remainingCents: 3000,
    percentUsed: 80,
    status: 'warning',
    budgetCount: 1,
    overCount: 0,
    warningCount: 1,
  },
  unbudgeted: { totalCents: 0, categoryCount: 0, top: [] },
  income: {
    items: [
      {
        categoryId: refunds.id,
        slug: 'refunds',
        name: 'Remboursements',
        color: null,
        icon: null,
        plannedCents: 5000,
        effectiveFrom: '2026-09',
        note: null,
        receivedCents: 6000,
        expectedByNowCents: null,
        expectedOn: null,
        status: 'received',
      },
    ],
    totals: {
      plannedCents: 5000,
      receivedCents: 6000,
      unplannedCents: 0,
      lineCount: 1,
    },
  },
  plan: {
    plannedIncomeCents: 5000,
    budgetedExpensesCents: 15000,
    toSaveCents: -10000,
  },
} satisfies BudgetMonthDto

function routes(current: TransactionDto) {
  return {
    '/api/categories': categories,
    'GET /api/transactions': (): TransactionListDto => ({
      items: [current],
      total: 1,
      page: 1,
      limit: 100,
    }),
    'GET /api/budgets': budget,
    [`PUT /api/transactions/${ID}/splits`]: splitPayback,
  }
}

const PARTS = [
  { category: 'restaurants', amount: '20' },
  { category: 'Remboursements', amount: '40,00' },
]

describe('split_transaction', () => {
  it('previews the parts, their kind and the budget effect, writing nothing', async () => {
    const { call, writes, calls } = await connect(routes(payback))
    const { text, isError } = await call('split_transaction', {
      id: ID,
      parts: PARTS,
    })
    expect(isError).toBe(false)
    expect(text).toContain('APERÇU')
    expect(text).toContain('20,00 € · remboursement de Restaurants')
    expect(text).toContain('40,00 € · revenu Remboursements')
    expect(text).toContain("Effet sur le budget d'octobre 2026")
    expect(text).toContain(
      '- Restaurants : dépensé 120,00 € → 100,00 € sur 150,00 €',
    )
    expect(text).toContain(
      '- Remboursements : reçu 60,00 € → 40,00 € (prévu 50,00 €)',
    )
    expect(text).toContain('confirm: true')
    expect(writes()).toHaveLength(0)
    const read = calls.find((c) => c.url.pathname === '/api/budgets')
    expect(read?.url.searchParams.get('month')).toBe('2026-10')
  })

  it('saves the split with confirm, with signed parts in cents', async () => {
    const { call, writes } = await connect(routes(payback))
    const { text, isError } = await call('split_transaction', {
      id: ID,
      parts: PARTS,
      confirm: true,
    })
    expect(isError).toBe(false)
    expect(writes()).toHaveLength(1)
    expect(writes()[0]?.method).toBe('PUT')
    expect(writes()[0]?.url.pathname).toBe(`/api/transactions/${ID}/splits`)
    expect(writes()[0]?.body).toEqual({
      parts: [
        { categoryId: restaurants.id, amountCents: 2000 },
        { categoryId: refunds.id, amountCents: 4000 },
      ],
    })
    expect(text).toContain('Opération répartie')
    expect(text).toContain('remboursement de Restaurants')
    expect(text).toContain(
      `categorize_transactions ids ["${ID}"], category "refunds", confirm: true`,
    )
  })

  it('changes nothing when the transaction is already split that way', async () => {
    const { call, writes } = await connect(routes(splitPayback))
    const { text, isError } = await call('split_transaction', {
      id: ID,
      parts: PARTS,
      confirm: true,
    })
    expect(isError).toBe(false)
    expect(text).toContain('Rien à modifier')
    expect(writes()).toHaveLength(0)
  })

  it('refuses parts that do not add up, in French, writing nothing', async () => {
    const { call, writes } = await connect(routes(payback))
    const short = await call('split_transaction', {
      id: ID,
      parts: [
        { category: 'restaurants', amount: '20' },
        { category: 'refunds', amount: '30' },
      ],
      confirm: true,
    })
    expect(short.isError).toBe(true)
    expect(short.text).toContain(
      "Les parts font 50,00 € alors que l'opération fait 60,00 € : il reste 10,00 € à répartir",
    )
    const over = await call('split_transaction', {
      id: ID,
      parts: [
        { category: 'restaurants', amount: '25' },
        { category: 'refunds', amount: '40' },
      ],
    })
    expect(over.isError).toBe(true)
    expect(over.text).toContain('il y a 5,00 € de trop')
    expect(writes()).toHaveLength(0)
  })

  it('refuses a sign against the transaction and a transfer category mixed in', async () => {
    const { call, writes } = await connect(routes(payback))
    const signed = await call('split_transaction', {
      id: ID,
      parts: [
        { category: 'restaurants', amount: '-20' },
        { category: 'refunds', amount: '40' },
      ],
    })
    expect(signed.isError).toBe(true)
    expect(signed.text).toContain('sans signe')
    const mixed = await call('split_transaction', {
      id: ID,
      parts: [
        { category: 'restaurants', amount: '20' },
        { category: 'own_moves', amount: '40' },
      ],
    })
    expect(mixed.isError).toBe(true)
    expect(mixed.text).toContain('virement interne ne peut pas être mêlée')
    expect(writes()).toHaveLength(0)
  })

  it('gives the previous split back as undo when replacing one', async () => {
    const { call } = await connect(routes(splitPayback))
    const { text } = await call('split_transaction', {
      id: ID,
      parts: [
        { category: 'restaurants', amount: '30' },
        { category: 'refunds', amount: '30' },
      ],
      confirm: true,
    })
    expect(text).toContain(
      `split_transaction id "${ID}", parts [{"category":"restaurants","amount":"20,00"},{"category":"refunds","amount":"40,00"}], confirm: true`,
    )
  })

  it('explains a read-only token', async () => {
    const { call } = await connect({
      ...routes(payback),
      [`PUT /api/transactions/${ID}/splits`]: jsonError(403, 'Forbidden'),
    })
    const { text, isError } = await call('split_transaction', {
      id: ID,
      parts: PARTS,
      confirm: true,
    })
    expect(isError).toBe(true)
    expect(text).toContain('lecture seule')
  })
})
