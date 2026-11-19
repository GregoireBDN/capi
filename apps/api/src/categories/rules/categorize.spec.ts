import { describe, expect, it } from 'vitest'
import type {
  SelectCategorizationRule,
  SelectCategory,
} from '#/categories/categories.schema'
import {
  type CategorizableTransaction,
  categorize,
  defaultKind,
  matchingRules,
  sortRules,
  validateRulePattern,
} from './categorize'

// Synthetic fixtures only: fake labels, amounts and ids.
const ACCOUNT_CHECKING = '00000000-0000-4000-8000-00000000000a'
const ACCOUNT_SAVINGS = '00000000-0000-4000-8000-00000000000b'

const NOW = new Date('2026-01-01T00:00:00Z')

function category(
  id: string,
  kind: SelectCategory['kind'],
  slug = id,
): SelectCategory {
  return {
    id,
    slug,
    name: slug,
    kind,
    color: null,
    icon: null,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

const CATEGORIES = [
  category('cat-groceries', 'expense'),
  category('cat-restaurants', 'expense'),
  category('cat-salary', 'income'),
  category('cat-savings', 'transfer'),
  category('cat-refunds', 'income'),
]
const categoriesById = new Map(CATEGORIES.map((c) => [c.id, c]))

let nextRule = 0
function rule(
  overrides: Partial<SelectCategorizationRule>,
): SelectCategorizationRule {
  nextRule++
  return {
    id: `rule-${String(nextRule).padStart(3, '0')}`,
    position: nextRule,
    priority: 0,
    enabled: true,
    matchType: 'contains',
    labelPattern: 'TESTSHOP',
    accountId: null,
    minAmountCents: null,
    maxAmountCents: null,
    categoryId: 'cat-groceries',
    kind: null,
    merchant: null,
    counterpartAccountId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function tx(
  overrides: Partial<CategorizableTransaction> = {},
): CategorizableTransaction {
  return {
    accountId: ACCOUNT_CHECKING,
    rawLabel: 'PAIEMENT CB 1501 TESTVILLE TESTSHOP CARTE 4XXXXXXXXXXX0000',
    merchant: null,
    amountCents: -2_345,
    ...overrides,
  }
}

describe('categorize', () => {
  describe('ordering', () => {
    it('lets the rule with the lowest position win', () => {
      const late = rule({ position: 20, categoryId: 'cat-restaurants' })
      const early = rule({ position: 10, categoryId: 'cat-groceries' })

      const result = categorize(tx(), [late, early], categoriesById)

      expect(result).toEqual({
        categoryId: 'cat-groceries',
        kind: 'expense',
        ruleId: early.id,
        merchant: null,
        counterpartAccountId: null,
      })
    })

    it('gives a transfer the rule’s destination account (#296)', () => {
      const toPea = rule({
        categoryId: 'cat-savings',
        counterpartAccountId: 'account-pea',
      })
      expect(
        categorize(tx(), [toPea], categoriesById)?.counterpartAccountId,
      ).toBe('account-pea')
    })

    it('never links a non-transfer or a transaction to its own account', () => {
      const asExpense = rule({
        categoryId: 'cat-savings',
        kind: 'expense',
        counterpartAccountId: 'account-pea',
      })
      expect(
        categorize(tx(), [asExpense], categoriesById)?.counterpartAccountId,
      ).toBeNull()
      const toSelf = rule({
        categoryId: 'cat-savings',
        counterpartAccountId: ACCOUNT_CHECKING,
      })
      expect(
        categorize(tx(), [toSelf], categoriesById)?.counterpartAccountId,
      ).toBeNull()
    })

    it('ignores array order and breaks position ties by id', () => {
      const b = rule({
        id: 'rule-b',
        position: 5,
        categoryId: 'cat-restaurants',
      })
      const a = rule({ id: 'rule-a', position: 5, categoryId: 'cat-groceries' })

      expect(categorize(tx(), [b, a], categoriesById)?.ruleId).toBe('rule-a')
      expect(categorize(tx(), [a, b], categoriesById)?.ruleId).toBe('rule-a')
    })

    it('falls through to the next rule when an earlier one does not match', () => {
      const other = rule({ position: 1, labelPattern: 'OTHERSHOP' })
      const match = rule({ position: 2, categoryId: 'cat-restaurants' })

      expect(categorize(tx(), [other, match], categoriesById)?.ruleId).toBe(
        match.id,
      )
    })

    it('skips disabled rules', () => {
      const disabled = rule({ position: 1, enabled: false })
      const enabled = rule({ position: 2, categoryId: 'cat-restaurants' })

      expect(
        categorize(tx(), [disabled, enabled], categoriesById),
      ).toMatchObject({ ruleId: enabled.id, categoryId: 'cat-restaurants' })
      expect(categorize(tx(), [disabled], categoriesById)).toBeNull()
    })

    it('skips a rule whose category is unknown', () => {
      const orphan = rule({ position: 1, categoryId: 'cat-missing' })
      const valid = rule({ position: 2 })

      expect(categorize(tx(), [orphan, valid], categoriesById)?.ruleId).toBe(
        valid.id,
      )
    })
  })

  describe('computed order (#299)', () => {
    const order = (rules: SelectCategorizationRule[]) =>
      sortRules(rules).map((r) => r.labelPattern)

    it('puts the longer pattern first, whatever the creation order', () => {
      const uber = rule({ position: 1, labelPattern: 'UBER' })
      const eats = rule({ position: 2, labelPattern: 'UBER EATS' })
      const t = tx({ rawLabel: 'PAIEMENT CB 0101 UBER EATS PARIS' })

      expect(order([uber, eats])).toEqual(['UBER EATS', 'UBER'])
      expect(categorize(t, [uber, eats], categoriesById)?.ruleId).toBe(eats.id)
    })

    it('compares folded patterns, so spacing and case do not weigh', () => {
      const spaced = rule({ position: 1, labelPattern: 'uber   eats' })
      const plain = rule({ position: 2, labelPattern: 'UBER EATS' })

      expect(sortRules([plain, spaced]).map((r) => r.id)).toEqual([
        spaced.id,
        plain.id,
      ])
    })

    it('puts a regex before any contains pattern', () => {
      const long = rule({ position: 1, labelPattern: 'TESTSHOP CARTE 4XXX' })
      const regex = rule({
        position: 2,
        matchType: 'regex',
        labelPattern: 'SHOP',
      })

      expect(order([long, regex])).toEqual(['SHOP', 'TESTSHOP CARTE 4XXX'])
    })

    it('breaks a pattern tie with the account and amount conditions', () => {
      const bare = rule({ position: 1 })
      const account = rule({ position: 2, accountId: ACCOUNT_CHECKING })
      const both = rule({
        position: 3,
        accountId: ACCOUNT_CHECKING,
        maxAmountCents: -1_000,
      })

      expect(sortRules([bare, account, both]).map((r) => r.id)).toEqual([
        both.id,
        account.id,
        bare.id,
      ])
    })

    it('lets a higher priority win over a more specific rule', () => {
      const specific = rule({
        position: 1,
        labelPattern: 'TESTSHOP CARTE',
        categoryId: 'cat-restaurants',
      })
      const preferred = rule({ position: 2, priority: 1 })

      expect(
        categorize(tx(), [specific, preferred], categoriesById)?.ruleId,
      ).toBe(preferred.id)
    })

    it('lists every enabled matching rule in order', () => {
      const eats = rule({ labelPattern: 'TESTSHOP CARTE' })
      const shop = rule({ labelPattern: 'TESTSHOP' })
      const off = rule({ labelPattern: 'TESTSHOP CARTE 4X', enabled: false })
      const other = rule({ labelPattern: 'ELSEWHERE' })

      expect(
        matchingRules(tx(), [shop, other, off, eats], categoriesById).map(
          (r) => r.id,
        ),
      ).toEqual([eats.id, shop.id])
    })
  })

  describe('contains', () => {
    it('ignores case and accents on both sides', () => {
      const r = rule({ labelPattern: 'café du côté' })
      const t = tx({ rawLabel: 'PAIEMENT CB 0302 CAFE DU COTE CARTE 4XXX' })

      expect(categorize(t, [r], categoriesById)?.ruleId).toBe(r.id)
      expect(
        categorize(
          tx({ rawLabel: 'PAIEMENT CB 0302 CAFÉ DU CÔTÉ' }),
          [rule({ labelPattern: 'CAFE DU COTE' })],
          categoriesById,
        ),
      ).not.toBeNull()
    })

    it('ignores spacing and punctuation differences', () => {
      const r = rule({ labelPattern: 'test-shop.fr' })

      expect(
        categorize(
          tx({ rawLabel: 'PRLV SEPA TEST SHOP/FR REF 42' }),
          [r],
          categoriesById,
        ),
      ).not.toBeNull()
    })

    it('matches the merchant when the label does not contain the pattern', () => {
      const r = rule({ labelPattern: 'Boulangerie Test' })
      const t = tx({
        rawLabel: 'PAIEMENT CB 0101 XYZ*1234',
        merchant: 'Boulangerie Test',
      })

      expect(categorize(t, [r], categoriesById)?.ruleId).toBe(r.id)
    })

    it('does not match a substring that is absent', () => {
      expect(
        categorize(
          tx(),
          [rule({ labelPattern: 'TESTSHOPPING' })],
          categoriesById,
        ),
      ).toBeNull()
    })

    it('never matches a pattern without letters or digits', () => {
      expect(
        categorize(tx(), [rule({ labelPattern: ' / ' })], categoriesById),
      ).toBeNull()
    })
  })

  describe('regex', () => {
    it('matches case-insensitively against the raw label', () => {
      const r = rule({
        matchType: 'regex',
        labelPattern: '^paiement cb \\d{4} testville',
      })

      expect(categorize(tx(), [r], categoriesById)?.ruleId).toBe(r.id)
    })

    it('matches against the merchant too', () => {
      const r = rule({
        matchType: 'regex',
        labelPattern: '^fake (market|store)$',
      })

      expect(
        categorize(
          tx({ rawLabel: 'CB 0101 ABC', merchant: 'Fake Store' }),
          [r],
          categoriesById,
        ),
      ).not.toBeNull()
    })

    it('treats an invalid stored regex as no match instead of throwing', () => {
      const broken = rule({ matchType: 'regex', labelPattern: '(unclosed' })
      const fallback = rule({ categoryId: 'cat-restaurants' })

      expect(() => categorize(tx(), [broken], categoriesById)).not.toThrow()
      expect(categorize(tx(), [broken, fallback], categoriesById)?.ruleId).toBe(
        fallback.id,
      )
    })
  })

  describe('amount range', () => {
    const between = (min: number | null, max: number | null) =>
      rule({ minAmountCents: min, maxAmountCents: max })

    it('is inclusive on both bounds of the signed amount', () => {
      const r = between(-5_000, -1_000)

      expect(
        categorize(tx({ amountCents: -5_000 }), [r], categoriesById),
      ).not.toBeNull()
      expect(
        categorize(tx({ amountCents: -1_000 }), [r], categoriesById),
      ).not.toBeNull()
      expect(
        categorize(tx({ amountCents: -5_001 }), [r], categoriesById),
      ).toBeNull()
      expect(
        categorize(tx({ amountCents: -999 }), [r], categoriesById),
      ).toBeNull()
    })

    it('tells money in from money out', () => {
      const outOnly = between(null, -1)
      const inOnly = rule({
        minAmountCents: 1,
        maxAmountCents: null,
        categoryId: 'cat-refunds',
      })

      expect(
        categorize(
          tx({ amountCents: -2_345 }),
          [inOnly, outOnly],
          categoriesById,
        )?.ruleId,
      ).toBe(outOnly.id)
      expect(
        categorize(
          tx({ amountCents: 2_345 }),
          [outOnly, inOnly],
          categoriesById,
        ),
      ).toMatchObject({ ruleId: inOnly.id, kind: 'income' })
    })

    it('supports a lower bound only', () => {
      const r = between(10_000, null)

      expect(
        categorize(tx({ amountCents: 10_000 }), [r], categoriesById),
      ).not.toBeNull()
      expect(
        categorize(tx({ amountCents: 9_999 }), [r], categoriesById),
      ).toBeNull()
    })
  })

  describe('account filter', () => {
    it('only matches transactions of the rule account', () => {
      const r = rule({ accountId: ACCOUNT_SAVINGS })

      expect(
        categorize(tx({ accountId: ACCOUNT_SAVINGS }), [r], categoriesById),
      ).not.toBeNull()
      expect(
        categorize(tx({ accountId: ACCOUNT_CHECKING }), [r], categoriesById),
      ).toBeNull()
    })

    it('matches every account when the rule has none', () => {
      const r = rule({ accountId: null })

      expect(
        categorize(tx({ accountId: ACCOUNT_SAVINGS }), [r], categoriesById),
      ).not.toBeNull()
      expect(
        categorize(tx({ accountId: ACCOUNT_CHECKING }), [r], categoriesById),
      ).not.toBeNull()
    })
  })

  describe('kind', () => {
    it('defaults to the category kind', () => {
      const r = rule({
        categoryId: 'cat-salary',
        labelPattern: 'VIR SEPA RECU',
      })

      expect(
        categorize(
          tx({
            rawLabel: 'VIR SEPA RECU /DE FAKE EMPLOYER SAS',
            amountCents: 250_000,
          }),
          [r],
          categoriesById,
        )?.kind,
      ).toBe('income')
    })

    it('uses the rule override, so an internal transfer is never income or expense', () => {
      // A move from checking to the user's own savings account, filed under
      // an expense-group category but overridden as a transfer.
      const transferRule = rule({
        labelPattern: 'VIR LIVRET TEST',
        categoryId: 'cat-groceries',
        kind: 'transfer',
      })

      const out = categorize(
        tx({ rawLabel: 'VIR LIVRET TEST 0000000', amountCents: -50_000 }),
        [transferRule],
        categoriesById,
      )
      const incoming = categorize(
        tx({ rawLabel: 'VIR LIVRET TEST 0000000', amountCents: 50_000 }),
        [transferRule],
        categoriesById,
      )

      expect(out?.kind).toBe('transfer')
      expect(incoming?.kind).toBe('transfer')
    })

    it('keeps a transfer category as transfer whatever the sign', () => {
      const r = rule({
        labelPattern: 'EPARGNE TEST',
        categoryId: 'cat-savings',
      })

      for (const amountCents of [-10_000, 10_000]) {
        expect(
          categorize(
            tx({ rawLabel: 'VIR EPARGNE TEST', amountCents }),
            [r],
            categoriesById,
          )?.kind,
        ).toBe('transfer')
      }
    })
  })

  describe('merchant', () => {
    it('keeps the transaction merchant when the rule has none', () => {
      const r = rule({})

      expect(
        categorize(tx({ merchant: 'Testshop' }), [r], categoriesById)?.merchant,
      ).toBe('Testshop')
    })

    it('uses the rule merchant when set', () => {
      const r = rule({ merchant: 'Test Shop SAS' })

      expect(
        categorize(tx({ merchant: 'Testshop' }), [r], categoriesById)?.merchant,
      ).toBe('Test Shop SAS')
      expect(
        categorize(tx({ merchant: null }), [r], categoriesById)?.merchant,
      ).toBe('Test Shop SAS')
    })
  })

  it('returns null when no rule matches', () => {
    expect(
      categorize(
        tx(),
        [rule({ labelPattern: 'NOTHING LIKE IT' })],
        categoriesById,
      ),
    ).toBeNull()
    expect(categorize(tx(), [], categoriesById)).toBeNull()
  })
})

describe('defaultKind', () => {
  it('files money out as expense and money in as income', () => {
    expect(defaultKind(-1)).toBe('expense')
    expect(defaultKind(1)).toBe('income')
    expect(defaultKind(0)).toBe('expense')
  })
})

describe('validateRulePattern', () => {
  it('accepts a valid regex and rejects an invalid one with the reason', () => {
    expect(validateRulePattern('regex', '^TEST (A|B)$')).toBeNull()

    const error = validateRulePattern('regex', '(unclosed')
    expect(error).toMatch(/^labelPattern is not a valid regular expression: /)
    expect(error).not.toContain('(unclosed')
  })

  it('rejects a contains pattern without letters or digits', () => {
    expect(validateRulePattern('contains', 'TESTSHOP')).toBeNull()
    expect(validateRulePattern('contains', ' -/ ')).toMatch(/letter or digit/)
  })
})
