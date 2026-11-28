// The savings target of set_budget_targets and the transfer links of
// categorize_transactions (#530): preview, confirm once, idempotent, refused
// before writing. Synthetic data only.
import { describe, expect, it } from 'vitest'
import type {
  AccountPerformanceDto,
  BudgetMonthDto,
  CategoryDto,
  TransactionDto,
  TransactionListDto,
} from '../api/types.js'
import {
  checking,
  groceries,
  livret,
  pea,
  period,
  transaction,
} from '../test/fixtures.js'
import { connect, jsonError } from '../test/mock-api.js'

const ID_1 = '00000000-0000-4000-8000-0000000000b1'
const ID_2 = '00000000-0000-4000-8000-0000000000b2'

const peaTransfer: CategoryDto = {
  ...groceries,
  id: '00000000-0000-4000-8000-0000000000c8',
  slug: 'investment_transfer',
  name: 'Virement placement',
  kind: 'transfer',
}

describe('set_budget_targets savingsTarget', () => {
  const budget = {
    month: '2026-11',
    period: period({ month: '2026-11', status: 'partial' }),
    items: [],
    income: { items: [] },
  } as unknown as BudgetMonthDto
  const routes = (target: number | null, put: unknown = { ok: true }) => ({
    '/api/categories': [groceries],
    'GET /api/budgets': budget,
    'GET /api/savings/overview': { monthlyTargetCents: target },
    'PUT /api/savings/target': put,
  })

  it('previews the target change, then sets it once with an undo', async () => {
    const { call, writes } = await connect(routes(30000))
    const preview = await call('set_budget_targets', { savingsTarget: '400' })
    expect(preview.isError).toBe(false)
    expect(preview.text).toContain('APERÇU')
    expect(preview.text).toContain(
      "Cible d'épargne : 300,00 € → 400,00 € par mois.",
    )
    expect(writes()).toHaveLength(0)

    const applied = await call('set_budget_targets', {
      savingsTarget: '400',
      confirm: true,
    })
    expect(writes()).toHaveLength(1)
    expect(writes()[0]?.method).toBe('PUT')
    expect(writes()[0]?.url.pathname).toBe('/api/savings/target')
    expect(writes()[0]?.body).toEqual({ monthlyTargetCents: 40000 })
    expect(applied.text).toContain(
      'set_budget_targets savingsTarget "300,00", confirm: true',
    )
  })

  it('writes nothing when the target is already in place (idempotent)', async () => {
    const { call, writes } = await connect(routes(40000))
    const { text } = await call('set_budget_targets', {
      savingsTarget: '400,00',
      confirm: true,
    })
    expect(text).toContain('Rien à modifier')
    expect(writes()).toHaveLength(0)
  })

  it('refuses a missing, negative or zero target before any request', async () => {
    const { call, calls } = await connect(routes(null))
    for (const args of [{}, { savingsTarget: '-10' }, { savingsTarget: '0' }]) {
      const { isError } = await call('set_budget_targets', args)
      expect(isError).toBe(true)
    }
    expect(calls).toHaveLength(0)
  })

  it('says a read token cannot change it', async () => {
    const { call } = await connect(routes(null, jsonError(403)))
    const { text, isError } = await call('set_budget_targets', {
      savingsTarget: '400',
      confirm: true,
    })
    expect(isError).toBe(true)
    expect(text).toContain('lecture seule')
  })
})

describe('categorize_transactions counterpart', () => {
  const transfer = (id: string, overrides: Partial<TransactionDto> = {}) => ({
    ...transaction,
    id,
    kind: 'transfer' as const,
    categoryId: peaTransfer.id,
    category: { ...transaction.category!, ...peaTransfer },
    amountCents: -30000,
    rawLabel: 'VIR PEA TEST',
    ...overrides,
  })
  const rows = [
    transfer(ID_1, { bookingDate: '2026-10-05' }),
    transfer(ID_2, { bookingDate: '2026-08-05' }),
  ]
  const performance = {
    contributionsCents: 500000,
    contributionsDate: '2026-09-30',
    contributionsSource: 'base',
  } as AccountPerformanceDto
  const routes = (items: TransactionDto[] = rows) => ({
    '/api/accounts': [checking, livret, pea],
    '/api/categories': [groceries, peaTransfer],
    'GET /api/transactions': (url: URL): TransactionListDto => {
      const ids = url.searchParams.get('ids')?.split(',') ?? []
      const found = items.filter((r) => ids.includes(r.id))
      return { items: found, total: found.length, page: 1, limit: 100 }
    },
    [`/api/accounts/${pea.id}/performance`]: performance,
    'POST /api/transactions/bulk-update': { updated: 2 },
    [`PATCH /api/transactions/${ID_1}`]: transfer(ID_1),
  })

  it('previews « → PEA » and the effect on its invested amount, writing nothing', async () => {
    const { call, writes } = await connect(routes())
    const { text, isError } = await call('categorize_transactions', {
      ids: [ID_1, ID_2],
      counterpart: 'PEA',
    })
    expect(isError).toBe(false)
    expect(text).toContain('APERÇU')
    expect(text).toContain(`VIR PEA TEST · Compte courant (id ${ID_1}) : → PEA`)
    expect(text).toContain(
      'Montant investi de PEA : +300,00 € (actuellement 5 000,00 €).',
    )
    expect(text).toContain('1 virement(s) du 30/09/2026 ou avant')
    expect(writes()).toHaveLength(0)
  })

  it('links in one request with confirm, keeping the category, then changes nothing more', async () => {
    const { call, writes } = await connect(routes())
    const { text } = await call('categorize_transactions', {
      ids: [ID_1, ID_2],
      counterpart: 'PEA',
      confirm: true,
    })
    expect(writes()).toHaveLength(1)
    expect(writes()[0]?.url.pathname).toBe('/api/transactions/bulk-update')
    expect(writes()[0]?.body).toEqual({
      counterpartAccountId: pea.id,
      ids: [ID_1, ID_2],
    })
    expect(text).toContain("il se retire dans l'application")

    const linked = rows.map((r) => ({
      ...r,
      counterpartAccountId: pea.id,
      counterpartAccountName: pea.name,
    }))
    const again = await connect(routes(linked))
    const repeat = await again.call('categorize_transactions', {
      ids: [ID_1, ID_2],
      counterpart: 'PEA',
      confirm: true,
    })
    expect(repeat.text).toContain('Rien à modifier')
    expect(again.writes()).toHaveLength(0)
  })

  it('sets a transfer category and the link together, with the previous link as undo', async () => {
    const before = transfer(ID_1, {
      kind: 'expense',
      categoryId: groceries.id,
      category: transaction.category,
      counterpartAccountId: null,
    })
    const relinked = transfer(ID_2, {
      counterpartAccountId: livret.id,
      counterpartAccountName: livret.name,
    })
    const { call, writes } = await connect(routes([before, relinked]))
    const { text } = await call('categorize_transactions', {
      ids: [ID_1, ID_2],
      category: 'Virement placement',
      counterpart: 'PEA',
      confirm: true,
    })
    expect(writes()[0]?.body).toEqual({
      categoryId: peaTransfer.id,
      counterpartAccountId: pea.id,
      ids: [ID_1, ID_2],
    })
    expect(text).toContain('Courses → Virement placement')
    expect(text).toContain('→ PEA (était lié à Livret A)')
    expect(text).toContain(
      `categorize_transactions ids ["${ID_2}"], counterpart "Livret A"`,
    )
  })

  it('refuses a counterpart on a row that is not a transfer before writing', async () => {
    const { call, writes, calls } = await connect(routes())
    const kind = await call('categorize_transactions', {
      ids: [ID_1],
      category: 'uncategorized',
      kind: 'expense',
      counterpart: 'PEA',
    })
    expect(kind.isError).toBe(true)
    expect(kind.text).toContain('Seul un virement interne')
    expect(calls).toHaveLength(0)

    const category = await call('categorize_transactions', {
      ids: [ID_1],
      category: 'Courses',
      counterpart: 'PEA',
      confirm: true,
    })
    expect(category.isError).toBe(true)
    expect(category.text).toContain('Seul un virement interne')

    const expense = await connect(
      routes([transfer(ID_1, { kind: 'expense' })]),
    )
    const row = await expense.call('categorize_transactions', {
      ids: [ID_1],
      counterpart: 'PEA',
      confirm: true,
    })
    expect(row.isError).toBe(true)
    expect(row.text).toContain(`(id ${ID_1})`)
    expect(writes()).toHaveLength(0)
    expect(expense.writes()).toHaveLength(0)
  })

  it('refuses the transaction’s own account and a call without category or counterpart', async () => {
    const { call, writes } = await connect(routes())
    const own = await call('categorize_transactions', {
      ids: [ID_1],
      counterpart: 'Compte courant',
      confirm: true,
    })
    expect(own.isError).toBe(true)
    expect(own.text).toContain("un virement se lie à l'autre compte")
    const none = await call('categorize_transactions', { ids: [ID_1] })
    expect(none.isError).toBe(true)
    expect(writes()).toHaveLength(0)
  })

  it('says a read token cannot link', async () => {
    const { call } = await connect({
      ...routes(),
      [`PATCH /api/transactions/${ID_1}`]: jsonError(403),
    })
    const { text, isError } = await call('categorize_transactions', {
      ids: [ID_1],
      counterpart: 'PEA',
      confirm: true,
    })
    expect(isError).toBe(true)
    expect(text).toContain('lecture seule')
  })
})
