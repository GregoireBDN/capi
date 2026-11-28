// Categorization rules (#531): list_rules reads the rules with their matches
// and conflicts; update_rule previews, applies once with confirm, changes
// nothing more on a repeated call. Synthetic labels and amounts only.
import { describe, expect, it } from 'vitest'
import type {
  CategorizationRuleDto,
  CategorizationRulePreviewDto,
  CategorizationRulesInsightsDto,
} from '../api/types.js'
import { checking, groceries, restaurants, salary } from '../test/fixtures.js'
import { connect, jsonError } from '../test/mock-api.js'

const NARROW = '00000000-0000-4000-8000-0000000000b1'
const BROAD = '00000000-0000-4000-8000-0000000000b2'
const SALARY = '00000000-0000-4000-8000-0000000000b3'

const narrow: CategorizationRuleDto = {
  id: NARROW,
  position: 1,
  priority: 0,
  rank: 0,
  enabled: true,
  matchType: 'contains',
  labelPattern: 'BOULANGERIE TEST',
  accountId: null,
  minAmountCents: null,
  maxAmountCents: null,
  categoryId: groceries.id,
  merchant: null,
  counterpartAccountId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const broad: CategorizationRuleDto = {
  ...narrow,
  id: BROAD,
  position: 2,
  rank: 1,
  labelPattern: 'BOULANGERIE',
  categoryId: restaurants.id,
  accountId: checking.id,
  maxAmountCents: -100,
}
const salaryRule: CategorizationRuleDto = {
  ...narrow,
  id: SALARY,
  position: 3,
  rank: 2,
  enabled: false,
  matchType: 'regex',
  labelPattern: '^VIR SALAIRE',
  categoryId: salary.id,
}

const insights: CategorizationRulesInsightsDto = {
  since: '2025-11-14',
  rules: [
    { ruleId: NARROW, matchCount: 3 },
    { ruleId: BROAD, matchCount: 8 },
    { ruleId: SALARY, matchCount: 12 },
  ],
  conflicts: [{ winnerRuleId: NARROW, loserRuleId: BROAD, count: 3 }],
}

const base = {
  '/api/categories': [groceries, restaurants, salary],
  '/api/accounts': [checking],
  'GET /api/categorization-rules': [salaryRule, broad, narrow],
  'GET /api/categorization-rules/insights': insights,
}

describe('list_rules', () => {
  it('lists the rules by category with their matches and who wins a conflict', async () => {
    const { call, writes } = await connect(base)
    const { text, isError } = await call('list_rules')
    expect(isError).toBe(false)
    expect(writes()).toHaveLength(0)
    expect(text).toContain('3 règle(s), 3 en tout')
    expect(text).toContain('depuis le 14/11/2025')
    expect(text).toContain(
      `- rang 1 · libellé contenant « BOULANGERIE TEST » → Courses · 3 correspondance(s) · id ${NARROW}`,
    )
    expect(text).toContain(
      `- rang 2 · libellé contenant « BOULANGERIE », compte Compte courant, jusqu’à -1,00 € → Restaurants · 8 correspondance(s)`,
    )
    expect(text).toContain(
      '- rang 3 [désactivée] · libellé correspondant à /^VIR SALAIRE/ → Salaire',
    )
    expect(text).toContain('Salaire (revenu')
    // Categories in alphabetical order.
    expect(text.indexOf('Courses (')).toBeLessThan(
      text.indexOf('Restaurants ('),
    )
    expect(text).toContain(
      '- 3 opération(s) : « BOULANGERIE TEST » → Courses (gagne) sur « BOULANGERIE » → Restaurants.',
    )
  })

  it('keeps one category and the conflicts it takes part in', async () => {
    const { call } = await connect(base)
    const { text } = await call('list_rules', { category: 'restaurants' })
    expect(text).toContain('1 règle(s) donnant Restaurants, 3 en tout')
    expect(text).not.toContain('VIR SALAIRE')
    expect(text).toContain('(gagne) sur « BOULANGERIE » → Restaurants')

    const salaryOnly = await call('list_rules', { category: 'Salaire' })
    expect(salaryOnly.text).toContain('Aucun conflit')
  })

  it('says when a category has no rule', async () => {
    const { call } = await connect({
      ...base,
      'GET /api/categorization-rules': [narrow],
    })
    const { text } = await call('list_rules', { category: 'Salaire' })
    expect(text).toBe('Aucune règle ne donne la catégorie Salaire.')
  })
})

describe('update_rule', () => {
  const preview: CategorizationRulePreviewDto = {
    matched: 2,
    leavingReview: 0,
    released: 1,
    changed: 3,
    transactions: [
      {
        id: '00000000-0000-4000-8000-0000000000a1',
        bookingDate: '2026-11-02',
        accountId: checking.id,
        rawLabel: 'CB BOULANGERIE TEST 02/11',
        merchant: null,
        amountCents: -450,
        categoryId: groceries.id,
        kind: 'expense',
        nextCategoryId: restaurants.id,
        nextKind: 'expense',
      },
    ],
    conflicts: [{ winnerRuleId: NARROW, loserRuleId: BROAD, count: 2 }],
  }
  const routes = (rules = [salaryRule, broad, narrow]) => ({
    ...base,
    'GET /api/categorization-rules': rules,
    'POST /api/categorization-rules/preview': preview,
    [`PATCH /api/categorization-rules/${NARROW}`]: {
      ...narrow,
      categoryId: restaurants.id,
    },
    'POST /api/categorization-rules/apply': {
      scanned: 10,
      matched: 4,
      unmatched: 6,
      updated: 3,
      manualSkipped: 1,
    },
  })

  it('previews before → after through the read-only preview, writing nothing', async () => {
    const { call, calls, writes } = await connect(routes())
    const { text } = await call('update_rule', {
      rule: NARROW,
      category: 'Restaurants',
    })
    expect(writes()).toHaveLength(0)
    const sent = calls.find((c) => c.url.pathname.endsWith('/preview'))?.body
    expect(sent).toMatchObject({
      ruleId: NARROW,
      labelPattern: 'BOULANGERIE TEST',
      categoryId: restaurants.id,
      priority: 0,
    })
    expect(text).toContain('APERÇU')
    expect(text).toContain(
      '- Avant : libellé contenant « BOULANGERIE TEST » → Courses',
    )
    expect(text).toContain(
      '- Après : libellé contenant « BOULANGERIE TEST » → Restaurants (dépense)',
    )
    expect(text).toContain('réappliquer les règles en changerait 3')
    expect(text).toContain('CB BOULANGERIE TEST 02/11 : Courses → Restaurants')
    expect(text).toContain(
      '« BOULANGERIE TEST » → Restaurants (gagne) sur « BOULANGERIE » → Restaurants',
    )
    expect(text).toContain('confirm: true')
  })

  it('sends only the changed fields with confirm, then re-applies on request', async () => {
    const { call, writes } = await connect(routes())
    const { text } = await call('update_rule', {
      rule: NARROW,
      category: 'restaurants',
      enabled: true,
      applyToExisting: true,
      confirm: true,
    })
    expect(writes().map((c) => [c.method, c.url.pathname, c.body])).toEqual([
      [
        'PATCH',
        `/api/categorization-rules/${NARROW}`,
        { categoryId: restaurants.id },
      ],
      ['POST', '/api/categorization-rules/apply', {}],
    ])
    expect(text).toContain('Règle modifiée (rang 1')
    expect(text).toContain('3 opération(s) modifiée(s) sur 10')
  })

  it('changes nothing more on a repeated call', async () => {
    const { call, writes } = await connect(
      routes([salaryRule, broad, { ...narrow, categoryId: restaurants.id }]),
    )
    const { text } = await call('update_rule', {
      rule: NARROW,
      category: 'Restaurants',
      confirm: true,
    })
    expect(writes()).toHaveLength(0)
    expect(text).toContain('Rien à modifier')
  })

  it('refuses an edit that copies another rule, and an unknown id', async () => {
    const { call, writes } = await connect(routes())
    const copy = await call('update_rule', {
      rule: BROAD,
      pattern: 'BOULANGERIE TEST',
      category: 'Courses',
    })
    // The broad rule keeps its account and amount: not a copy, so it previews.
    expect(copy.isError).toBe(false)
    const same = await call('update_rule', {
      rule: SALARY,
      matchType: 'contains',
      pattern: 'BOULANGERIE TEST',
      category: 'Courses',
      confirm: true,
    })
    expect(same.isError).toBe(true)
    expect(same.text).toContain('identique existe déjà')
    const unknown = await call('update_rule', {
      rule: '00000000-0000-4000-8000-0000000000ff',
      enabled: false,
    })
    expect(unknown.isError).toBe(true)
    expect(unknown.text).toContain('Règle introuvable')
    expect(
      writes().filter((c) => c.url.pathname.endsWith(SALARY)),
    ).toHaveLength(0)
  })

  it('explains a read-only token', async () => {
    const { call } = await connect({
      ...routes(),
      [`PATCH /api/categorization-rules/${NARROW}`]: jsonError(403),
    })
    const { text, isError } = await call('update_rule', {
      rule: NARROW,
      enabled: false,
      confirm: true,
    })
    expect(isError).toBe(true)
    expect(text).toMatch(/lecture seule.*Rien n'a été modifié/s)
  })
})
