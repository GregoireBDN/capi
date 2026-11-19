// Write tools (#77): preview without confirm writes nothing, confirm applies
// once, a repeated call changes nothing more, API errors are explained.
// Synthetic data only.
import { describe, expect, it } from 'vitest'
import type {
  BudgetMonthDto,
  CategorizationRuleDto,
  CategorizationRulePreviewDto,
  MonthCloseDto,
  TransactionDto,
  TransactionListDto,
} from '../api/types.js'
import {
  checking,
  groceries,
  livret,
  mealVoucher,
  pea,
  period,
  restaurants,
  salary,
  transaction,
} from '../test/fixtures.js'
import { connect, jsonError } from '../test/mock-api.js'

const accounts = [checking, livret, pea, mealVoucher]
const categories = [groceries, restaurants, salary]
const ID_1 = '00000000-0000-4000-8000-0000000000a1'
const ID_2 = '00000000-0000-4000-8000-0000000000a2'
const ID_3 = '00000000-0000-4000-8000-0000000000a3'

function tx(id: string, overrides: Partial<TransactionDto> = {}) {
  return { ...transaction, id, ...overrides }
}

const uncategorized = (id: string) =>
  tx(id, {
    categoryId: null,
    category: null,
    needsReview: true,
    rawLabel: 'CB BOULANGERIE TEST',
  })

/** `GET /api/transactions` answering the `ids` filter from `rows`. */
function listRoute(rows: TransactionDto[]) {
  return (url: URL): TransactionListDto => {
    const ids = url.searchParams.get('ids')?.split(',')
    const items = ids ? rows.filter((r) => ids.includes(r.id)) : rows
    return { items, total: items.length, page: 1, limit: 100 }
  }
}

describe('add_transaction', () => {
  const routes = (existing: TransactionDto[] = []) => ({
    '/api/accounts': accounts,
    '/api/categories': categories,
    'GET /api/transactions': listRoute(existing),
    'POST /api/transactions/manual': (_url: URL, body: unknown) => {
      const b = body as { amountCents: number; direction: string }
      return tx(ID_3, {
        manual: true,
        amountCents: b.direction === 'out' ? -b.amountCents : b.amountCents,
        rawLabel: 'Boulangerie',
        bookingDate: '2026-11-13',
      })
    },
  })

  it('previews without writing, with the resolved account, category and sign', async () => {
    const { call, writes, calls } = await connect(routes())
    const { text, isError } = await call('add_transaction', {
      amount: '12,50',
      category: 'courses',
      label: 'Boulangerie',
      date: '2026-11-13',
    })
    expect(isError).toBe(false)
    expect(text).toContain('APERÇU')
    expect(text).toContain('- 13/11/2026 · -12,50 € · Boulangerie')
    expect(text).toContain('- Compte : Compte courant')
    expect(text).toContain('- Catégorie : Courses')
    expect(text).toContain('confirm: true')
    expect(writes()).toHaveLength(0)
    const sameDay = calls.find((c) => c.url.pathname === '/api/transactions')
    expect(sameDay?.url.searchParams.get('from')).toBe('2026-11-13')
    expect(sameDay?.url.searchParams.get('accountId')).toBe(checking.id)
  })

  it('creates it once with confirm, with exactly the previewed values', async () => {
    const { call, writes } = await connect(routes())
    const { text, isError } = await call('add_transaction', {
      amount: '1 234,5',
      category: 'Salaire',
      account: 'livret',
      confirm: true,
    })
    expect(isError).toBe(false)
    expect(writes()).toHaveLength(1)
    expect(writes()[0]?.body).toEqual({
      amountCents: 123450,
      direction: 'in',
      kind: 'income',
      categoryId: salary.id,
      bookingDate: '2026-11-14',
      label: 'Salaire',
      accountId: livret.id,
      isOneOff: false,
      note: null,
    })
    expect(text).toContain('Opération ajoutée')
    expect(text).toContain('Pour annuler')
  })

  it('pays with the meal-voucher card (#298)', async () => {
    const { call, writes } = await connect(routes())
    const { isError } = await call('add_transaction', {
      amount: '14,90',
      category: 'Restaurants',
      account: 'titres',
      confirm: true,
    })
    expect(isError).toBe(false)
    expect(writes()[0]?.body).toMatchObject({
      amountCents: 1490,
      direction: 'out',
      kind: 'expense',
      categoryId: restaurants.id,
      accountId: mealVoucher.id,
    })
  })

  it('takes the sign of the amount over the default direction', async () => {
    const { call, writes } = await connect(routes())
    await call('add_transaction', {
      amount: '+20',
      category: 'groceries',
      confirm: true,
    })
    expect(writes()[0]?.body).toMatchObject({
      amountCents: 2000,
      direction: 'in',
      kind: 'expense',
    })
  })

  it('does not add a second same-day same-amount transaction unless allowed', async () => {
    const existing = tx(ID_1, {
      amountCents: -1250,
      bookingDate: '2026-11-13',
      manual: true,
    })
    const { call, writes } = await connect(routes([existing]))
    const args = {
      amount: '12,50',
      label: 'Boulangerie',
      date: '2026-11-13',
      confirm: true,
    }
    const blocked = await call('add_transaction', args)
    expect(blocked.text).toContain("Rien n'a été ajouté")
    expect(blocked.text).toContain(ID_1)
    expect(writes()).toHaveLength(0)

    await call('add_transaction', { ...args, allowDuplicate: true })
    expect(writes()).toHaveLength(1)
  })

  it.each([
    [{ amount: '12,505', label: 'x' }, /Montant « 12,505 » invalide/],
    [{ amount: 'douze', label: 'x' }, /invalide/],
    [{ amount: '0', label: 'x' }, /invalide/],
    [{ amount: '5', label: 'x', date: '2026-11-15' }, /dans le futur/],
    [{ amount: '5' }, /libellé/],
    [
      { amount: '5', label: 'x', account: 'PEA' },
      /n'est pas un compte courant/,
    ],
  ])('refuses %o before writing', async (args, message) => {
    const { call, writes } = await connect(routes())
    const { text, isError } = await call('add_transaction', {
      ...args,
      confirm: true,
    })
    expect(isError).toBe(true)
    expect(text).toMatch(message)
    expect(writes()).toHaveLength(0)
  })
})

describe('categorize_transactions', () => {
  const rows = [
    uncategorized(ID_1),
    uncategorized(ID_2),
    tx(ID_3), // already in Courses
  ]
  const routes = {
    '/api/categories': categories,
    'GET /api/transactions': listRoute(rows),
    [`PATCH /api/transactions/${ID_1}`]: tx(ID_1),
    'POST /api/transactions/bulk-update': { updated: 2 },
  }

  it('previews each change and skips those already right, writing nothing', async () => {
    const { call, writes, calls } = await connect(routes)
    const { text } = await call('categorize_transactions', {
      ids: [ID_1, ID_2, ID_3],
      category: 'Courses',
    })
    expect(text).toContain('APERÇU')
    expect(text).toContain('2 opération(s) changeraient')
    expect(text).toContain(
      `CB BOULANGERIE TEST · Compte courant (id ${ID_1}) : sans catégorie → Courses (n’est plus à revoir)`,
    )
    expect(text).toContain('Déjà dans Courses, rien à faire : 1 opération(s).')
    expect(writes()).toHaveLength(0)
    expect(
      calls
        .find((c) => c.url.pathname === '/api/transactions')
        ?.url.searchParams.get('ids'),
    ).toBe([ID_1, ID_2, ID_3].join(','))
  })

  it('applies in bulk with confirm, only to the transactions that change, with an undo', async () => {
    const { call, writes } = await connect(routes)
    const { text } = await call('categorize_transactions', {
      ids: [ID_1, ID_2, ID_3],
      category: 'courses',
      confirm: true,
    })
    expect(writes()).toHaveLength(1)
    expect(writes()[0]?.url.pathname).toBe('/api/transactions/bulk-update')
    expect(writes()[0]?.body).toEqual({
      categoryId: groceries.id,
      ids: [ID_1, ID_2],
    })
    expect(text).toContain('2 opération(s) modifiée(s)')
    expect(text).toContain(
      `categorize_transactions ids ["${ID_1}","${ID_2}"], category "uncategorized", kind "expense"`,
    )
  })

  it('warns when a category would turn an internal transfer into an expense', async () => {
    const { call } = await connect({
      ...routes,
      'GET /api/transactions': listRoute([
        tx(ID_1, { kind: 'transfer', categoryId: null, category: null }),
      ]),
    })
    const { text } = await call('categorize_transactions', {
      ids: [ID_1],
      category: 'Courses',
    })
    expect(text).toContain('virement interne → dépense')
    expect(text).toContain('kind "transfer" le garde en virement')
  })

  it('uses PATCH for one transaction and passes an explicit kind', async () => {
    const { call, writes } = await connect(routes)
    const { text } = await call('categorize_transactions', {
      ids: [ID_1],
      category: 'Courses',
      kind: 'transfer',
      confirm: true,
    })
    expect(writes()).toHaveLength(1)
    expect(writes()[0]?.method).toBe('PATCH')
    expect(writes()[0]?.url.pathname).toBe(`/api/transactions/${ID_1}`)
    expect(writes()[0]?.body).toEqual({
      categoryId: groceries.id,
      kind: 'transfer',
    })
    expect(text).toContain('dépense → virement interne')
  })

  it('writes nothing when everything is already right (idempotent)', async () => {
    const { call, writes } = await connect(routes)
    const { text } = await call('categorize_transactions', {
      ids: [ID_3],
      category: 'Courses',
      confirm: true,
    })
    expect(text).toContain('Rien à modifier')
    expect(writes()).toHaveLength(0)
  })

  it('stops on unknown ids before writing', async () => {
    const missing = '00000000-0000-4000-8000-0000000000ff'
    const { call, writes } = await connect(routes)
    const { text, isError } = await call('categorize_transactions', {
      ids: [ID_1, missing],
      category: 'Courses',
      confirm: true,
    })
    expect(isError).toBe(true)
    expect(text).toContain(missing)
    expect(writes()).toHaveLength(0)
  })

  it('rejects malformed ids at the schema', async () => {
    const { call, writes } = await connect(routes)
    const { isError } = await call('categorize_transactions', {
      ids: ['nope'],
      category: 'Courses',
    })
    expect(isError).toBe(true)
    expect(writes()).toHaveLength(0)
  })
})

describe('mark_one_off and set_transaction_note', () => {
  const rows = [
    tx(ID_1),
    tx(ID_2, { isOneOff: true }),
    tx(ID_3, { note: 'ancienne note' }),
  ]
  const routes = {
    'GET /api/transactions': listRoute(rows),
    [`PATCH /api/transactions/${ID_1}`]: tx(ID_1),
    [`PATCH /api/transactions/${ID_3}`]: tx(ID_3),
    'POST /api/transactions/bulk-update': { updated: 1 },
  }

  it('marks only what is not one-off yet, and previews first', async () => {
    const { call, writes } = await connect(routes)
    const preview = await call('mark_one_off', { ids: [ID_1, ID_2] })
    expect(preview.text).toContain('1 opération(s) deviendraient ponctuelle(s)')
    expect(writes()).toHaveLength(0)

    const done = await call('mark_one_off', {
      ids: [ID_1, ID_2],
      confirm: true,
    })
    expect(writes()).toHaveLength(1)
    expect(writes()[0]?.url.pathname).toBe(`/api/transactions/${ID_1}`)
    expect(writes()[0]?.body).toEqual({ isOneOff: true })
    expect(done.text).toContain(
      `mark_one_off ids ["${ID_1}"], oneOff false, confirm: true`,
    )
  })

  it('replaces a note with confirm and gives the previous one back as undo', async () => {
    const { call, writes } = await connect(routes)
    const preview = await call('set_transaction_note', {
      id: ID_3,
      note: 'cadeau',
    })
    expect(preview.text).toContain('Note actuelle : « ancienne note »')
    expect(preview.text).toContain('Nouvelle note : « cadeau »')
    expect(writes()).toHaveLength(0)

    const done = await call('set_transaction_note', {
      id: ID_3,
      note: 'cadeau',
      confirm: true,
    })
    expect(writes()[0]?.body).toEqual({ note: 'cadeau' })
    expect(done.text).toContain(
      `set_transaction_note id "${ID_3}", note "ancienne note", confirm: true`,
    )
  })

  it('does nothing when the note is already that text', async () => {
    const { call, writes } = await connect(routes)
    const { text } = await call('set_transaction_note', {
      id: ID_3,
      note: ' ancienne note ',
      confirm: true,
    })
    expect(text).toContain('Rien à modifier')
    expect(writes()).toHaveLength(0)
  })
})

describe('create_rule', () => {
  const rule: CategorizationRuleDto = {
    id: '00000000-0000-4000-8000-0000000000b1',
    position: 4,
    priority: 0,
    rank: 4,
    enabled: true,
    matchType: 'contains',
    labelPattern: 'BOULANGERIE TEST',
    accountId: null,
    minAmountCents: null,
    maxAmountCents: null,
    categoryId: groceries.id,
    kind: null,
    merchant: null,
    counterpartAccountId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const preview: CategorizationRulePreviewDto = {
    matched: 3,
    leavingReview: 2,
    released: 0,
    changed: 2,
    transactions: [
      {
        id: ID_1,
        bookingDate: '2026-11-02',
        accountId: checking.id,
        rawLabel: 'CB BOULANGERIE TEST',
        merchant: null,
        amountCents: -350,
        categoryId: null,
        kind: 'expense',
        nextCategoryId: groceries.id,
        nextKind: 'expense',
      },
    ],
    conflicts: [],
  }
  const broadRule: CategorizationRuleDto = {
    ...rule,
    id: '00000000-0000-4000-8000-0000000000b2',
    labelPattern: 'BOULANGERIE',
    categoryId: restaurants.id,
    rank: 7,
  }
  const routes = (existing: CategorizationRuleDto[] = []) => ({
    '/api/categories': categories,
    'GET /api/categorization-rules': existing,
    'POST /api/categorization-rules/preview': preview,
    'POST /api/categorization-rules': rule,
    'POST /api/categorization-rules/apply': {
      scanned: 10,
      matched: 4,
      unmatched: 6,
      updated: 2,
      manualSkipped: 1,
    },
  })

  it('previews the matches through the read-only preview route', async () => {
    const { call, writes, calls } = await connect(routes())
    const { text } = await call('create_rule', {
      pattern: 'BOULANGERIE TEST',
      category: 'Courses',
      applyToExisting: true,
    })
    expect(text).toContain('APERÇU')
    expect(text).toContain('contenant « BOULANGERIE TEST »')
    expect(text).toContain(
      'Opérations existantes correspondant au libellé : 3.',
    )
    expect(text).toContain('2 opération(s) changeraient de catégorie')
    expect(text).toContain('CB BOULANGERIE TEST : sans catégorie → Courses')
    expect(writes()).toHaveLength(0)
    expect(
      calls.find((c) => c.url.pathname.endsWith('/preview'))?.body,
    ).toEqual({
      matchType: 'contains',
      labelPattern: 'BOULANGERIE TEST',
      categoryId: groceries.id,
      kind: null,
      accountId: null,
    })
  })

  it('shows the conflicts with existing rules in the preview', async () => {
    const { call } = await connect({
      ...routes([broadRule]),
      'POST /api/categorization-rules/preview': {
        ...preview,
        conflicts: [
          {
            winnerRuleId: '00000000-0000-0000-0000-000000000000',
            loserRuleId: broadRule.id,
            count: 3,
          },
        ],
      },
    })
    const { text } = await call('create_rule', {
      pattern: 'BOULANGERIE TEST',
      category: 'Courses',
    })
    expect(text).toContain('Conflits avec des règles existantes')
    expect(text).toContain(
      '3 opération(s) aussi reconnue(s) par la règle « BOULANGERIE » → Restaurants',
    )
  })

  it('creates the rule and re-applies the rules with confirm', async () => {
    const { call, writes } = await connect(routes())
    const { text } = await call('create_rule', {
      pattern: 'BOULANGERIE TEST',
      category: 'Courses',
      applyToExisting: true,
      confirm: true,
    })
    expect(writes().map((c) => c.url.pathname)).toEqual([
      '/api/categorization-rules',
      '/api/categorization-rules/apply',
    ])
    expect(text).toContain("Règle créée (rang 5 dans l'ordre d'évaluation")
    expect(text).toContain('2 opération(s) modifiée(s) sur 10')
    expect(text).toContain('page Règles')
  })

  it('does not create an identical rule twice', async () => {
    const { call, writes } = await connect(routes([rule]))
    const { text } = await call('create_rule', {
      pattern: 'boulangerie test',
      category: 'groceries',
      confirm: true,
    })
    expect(text).toContain(
      "une règle identique existe déjà (rang 5 dans l'ordre d'évaluation)",
    )
    expect(writes()).toHaveLength(0)
  })
})

describe('set_budget_targets', () => {
  const budget: BudgetMonthDto = {
    month: '2026-12',
    period: period({ month: '2026-12', status: 'empty' }),
    items: [
      {
        categoryId: groceries.id,
        slug: 'groceries',
        name: 'Courses',
        color: null,
        icon: null,
        targetCents: 40000,
        effectiveFrom: '2026-09',
        note: null,
        tracked: true,
        spentCents: 0,
        spentExcludingOneOffsCents: 0,
        remainingCents: 40000,
        percentUsed: 0,
        status: 'ok',
      },
    ],
    totals: {
      targetCents: 40000,
      spentCents: 0,
      spentExcludingOneOffsCents: 0,
      remainingCents: 40000,
      percentUsed: 0,
      status: 'ok',
      budgetCount: 1,
      overCount: 0,
      warningCount: 0,
    },
    unbudgeted: { totalCents: 0, categoryCount: 0, top: [] },
  } as BudgetMonthDto
  const put = (_url: URL, body: unknown) => ({ id: 'b', ...(body as object) })
  const routes = {
    '/api/categories': categories,
    'GET /api/budgets': budget,
    [`PUT /api/budgets/${groceries.id}`]: put,
    [`PUT /api/budgets/${restaurants.id}`]: put,
  }

  it('previews several categories at once, writing nothing', async () => {
    const { call, writes, calls } = await connect(routes)
    const { text } = await call('set_budget_targets', {
      month: '2026-12',
      targets: [
        { category: 'Courses', amount: '420' },
        { category: 'restaurants', amount: '150,50', tracked: true },
      ],
    })
    expect(
      calls
        .find((c) => c.url.pathname === '/api/budgets')
        ?.url.searchParams.get('month'),
    ).toBe('2026-12')
    expect(text).toContain('à partir de décembre 2026')
    expect(text).toContain('- Courses : 400,00 € → 420,00 €')
    expect(text).toContain(
      '- Restaurants : pas de cible → 150,50 €, suivie pendant le mois',
    )
    expect(text).toContain('Total des cibles demandées : 570,50 € par mois.')
    expect(writes()).toHaveLength(0)
  })

  it('applies only the targets that differ, from the month, with an undo', async () => {
    const { call, writes } = await connect(routes)
    const { text } = await call('set_budget_targets', {
      month: '2026-12',
      targets: [
        { category: 'Courses', amount: '400' }, // unchanged
        { category: 'restaurants', amount: '150,50' },
      ],
      confirm: true,
    })
    expect(writes()).toHaveLength(1)
    expect(writes()[0]?.url.pathname).toBe(`/api/budgets/${restaurants.id}`)
    expect(writes()[0]?.body).toEqual({
      monthlyTargetCents: 15050,
      effectiveFrom: '2026-12',
    })
    expect(text).toContain('Déjà à cette cible, rien à faire : Courses.')
    expect(text).toContain("arrêtez le budget dans l'application")

    const again = await connect(routes)
    const changed = await again.call('set_budget_targets', {
      month: '2026-12',
      targets: [{ category: 'Courses', amount: '420' }],
      confirm: true,
    })
    expect(changed.text).toContain(
      'set_budget_targets month "2026-12", targets [{"category":"groceries","amount":"400,00"}], confirm: true',
    )
  })

  it('refuses income categories and duplicates before writing', async () => {
    const { call, writes } = await connect(routes)
    const income = await call('set_budget_targets', {
      targets: [{ category: 'Salaire', amount: '10' }],
      confirm: true,
    })
    expect(income.isError).toBe(true)
    expect(income.text).toContain("n'est pas une catégorie de dépenses")
    const twice = await call('set_budget_targets', {
      targets: [
        { category: 'Courses', amount: '10' },
        { category: 'groceries', amount: '20' },
      ],
      confirm: true,
    })
    expect(twice.text).toContain('apparaît deux fois')
    expect(writes()).toHaveLength(0)
  })

  it('reports what was applied when a later target fails', async () => {
    const { call, writes } = await connect({
      ...routes,
      [`PUT /api/budgets/${restaurants.id}`]: jsonError(
        429,
        {},
        {
          'retry-after': '30',
        },
      ),
    })
    const { text } = await call('set_budget_targets', {
      month: '2026-12',
      targets: [
        { category: 'Courses', amount: '420' },
        { category: 'Restaurants', amount: '100' },
      ],
      confirm: true,
    })
    expect(writes()).toHaveLength(2)
    expect(text).toContain('Erreur après 1 cible(s)')
    expect(text).toContain('Réessayez dans 30 s')
    expect(text).toContain('Non appliquées : Restaurants.')
  })
})

describe('write errors', () => {
  it.each([
    [401, /Token refusé/],
    [403, /lecture seule.*Rien n'a été modifié/s],
    [409, /Conflit : Month is closed\. Rien n'a été modifié/],
    [429, /Trop de requêtes.*dans 12 s/],
  ])('explains a %i on confirm', async (status, message) => {
    const { call } = await connect({
      'GET /api/transactions': listRoute([tx(ID_1)]),
      [`PATCH /api/transactions/${ID_1}`]: jsonError(
        status,
        { message: 'Month is closed' },
        { 'retry-after': '12' },
      ),
    })
    const { text, isError } = await call('mark_one_off', {
      ids: [ID_1],
      confirm: true,
    })
    expect(isError).toBe(true)
    expect(text).toMatch(message)
  })
})

describe('month-end review', () => {
  it('lists the prompt and fills in the previous month by default', async () => {
    const { client } = await connect({})
    const { prompts } = await client.listPrompts()
    expect(prompts.map((p) => p.name)).toContain('revue_du_mois')
    expect(prompts.find((p) => p.name === 'revue_du_mois')?.title).toBe(
      'Revue du mois',
    )

    const result = await client.getPrompt({ name: 'revue_du_mois' })
    const text = (result.messages[0]?.content as { text: string }).text
    expect(text).toContain("revue du mois d'octobre 2026 (2026-10)")
    expect(text).toContain('month_close_status (month 2026-10)')
    expect(text).toContain('set_budget_targets (month 2026-11)')
    expect(text).toContain('confirm: true')

    const chosen = await client.getPrompt({
      name: 'revue_du_mois',
      arguments: { month: '2026-01' },
    })
    expect((chosen.messages[0]?.content as { text: string }).text).toContain(
      'Budget de février 2026',
    )
  })

  it('month_close_status shows each step and what is left', async () => {
    const close = {
      month: '2026-10',
      nextMonth: '2026-11',
      period: period({
        month: '2026-10',
        status: 'complete',
        throughDay: null,
      }),
      closable: true,
      status: 'open',
      closedAt: null,
      notes: null,
      acknowledged: ['budget'],
      steps: [
        { key: 'imports', done: false },
        { key: 'review_queue', done: false },
        { key: 'recurring', done: true },
        { key: 'budget', done: true },
        { key: 'savings', done: false },
        { key: 'investments', done: false },
        { key: 'close', done: false },
      ],
      imports: {
        accounts: [
          {
            id: livret.id,
            name: 'Livret A',
            type: 'savings',
            lastDate: '2026-10-20',
            upToDate: false,
            missingDays: 11,
          },
        ],
        gaps: [],
      },
      reviewQueue: { count: 4 },
      recurring: { suggestedCount: 0, priceChanges: [], chargedAfterEnd: [] },
      budget: {
        budgetCount: 0,
        targetCents: 0,
        spentCents: 0,
        remainingCents: 0,
        unbudgetedCents: 0,
        over: [],
        under: [],
      },
      savings: {
        netCents: 50000,
        targetCents: 60000,
        gapCents: -10000,
        goals: [],
      },
      investments: {
        accounts: [
          {
            id: pea.id,
            name: 'PEA',
            type: 'brokerage',
            group: 'investments',
            lastDate: '2026-09-30',
          },
        ],
      },
      report: {},
      closedReport: null,
      changes: [],
    } as unknown as MonthCloseDto
    const { call, calls } = await connect({
      '/api/month-close/2026-10': close,
    })
    const { text } = await call('month_close_status')
    expect(calls[0]?.url.pathname).toBe('/api/month-close/2026-10')
    expect(text).toContain('Étapes faites : 2/7.')
    expect(text).toContain(
      "- Livret A (épargne) : données jusqu'au 20/10/2026, 11 jour(s) manquant(s)",
    )
    expect(text).toContain('4 opération(s) du mois à revoir')
    expect(text).toContain(
      'PEA (PEA / compte-titres) : pas de valeur à la fin du mois (dernière au 30/09/2026)',
    )
  })

  it('review_queue lists transactions with their ids', async () => {
    const { call, calls } = await connect({
      '/api/transactions': listRoute([uncategorized(ID_1)]),
    })
    const { text } = await call('review_queue', { month: '2026-11' })
    expect(calls[0]?.url.searchParams.get('needsReview')).toBe('true')
    expect(text).toContain('1 opération(s) à revoir en novembre 2026')
    expect(text).toContain(`id ${ID_1}`)
    expect(text).toContain('Opérations, filtre « À revoir »')
  })

  it('budget_suggestions reads the suggestions without saving', async () => {
    const { call, calls, writes } = await connect({
      'POST /api/budgets/suggest': {
        month: '2026-12',
        months: ['2026-09', '2026-10', '2026-11'],
        monthsWithData: 3,
        items: [
          {
            categoryId: groceries.id,
            slug: 'groceries',
            name: 'Courses',
            color: null,
            suggestedCents: 41000,
            averageCents: 40987,
            currentTargetCents: 40000,
          },
        ],
      },
    })
    const { text } = await call('budget_suggestions', { month: '2026-12' })
    expect(calls[0]?.url.searchParams.get('month')).toBe('2026-12')
    expect(writes()).toHaveLength(0)
    expect(text).toContain(
      '- Courses (groceries) : 410,00 € (moyenne 409,87 €) · cible actuelle 400,00 €',
    )
  })
})
