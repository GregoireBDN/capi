import { describe, expect, it } from 'vitest'
import type {
  SelectCategorizationRule,
  SelectCategory,
  TransactionKind,
} from '#/database/schema'
import { proposeRules, type RuleBootstrapRow } from './bootstrap-rules'

/** Synthetic data only. */

const EPOCH = new Date(0)

function category(
  id: string,
  kind: TransactionKind = 'expense',
): SelectCategory {
  return {
    id,
    slug: id,
    name: id,
    kind,
    color: null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
  }
}

const CATEGORIES = new Map(
  [
    category('groceries'),
    category('restaurants'),
    category('refunds', 'income'),
  ].map((c) => [c.id, c]),
)

function rows(
  merchant: string,
  count: number,
  overrides: Partial<RuleBootstrapRow> = {},
): RuleBootstrapRow[] {
  return Array.from({ length: count }, (_, i) => ({
    accountId: 'account',
    rawLabel: `PAIEMENT PSC ${String(i + 10).padStart(4, '0')} TESTVILLE - ${merchant.toUpperCase()}`,
    merchant,
    merchantKey: merchant.toUpperCase(),
    amountCents: -100 - i,
    categoryId: 'groceries',
    kind: 'expense',
    needsReview: false,
    ...overrides,
  }))
}

function rule(
  labelPattern: string,
  overrides: Partial<SelectCategorizationRule> = {},
): SelectCategorizationRule {
  return {
    id: `rule-${labelPattern}`,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    position: 0,
    enabled: true,
    matchType: 'contains',
    labelPattern,
    accountId: null,
    minAmountCents: null,
    maxAmountCents: null,
    categoryId: 'restaurants',
    kind: null,
    merchant: null,
    ...overrides,
  }
}

describe('proposeRules', () => {
  it('proposes a rule from 3 consistent rows, not from 2', () => {
    const result = proposeRules(
      [...rows('Epicerie Fictive', 3), ...rows('Cafe Fictif', 2)],
      [],
      CATEGORIES,
    )
    expect(result.proposed).toEqual([
      {
        merchantKey: 'EPICERIE FICTIVE',
        labelPattern: 'EPICERIE FICTIVE',
        categoryId: 'groceries',
        kind: null,
        occurrences: 3,
        agreeing: 3,
      },
    ])
  })

  it('requires 90 % of the rows in the same category and kind', () => {
    const nineOfTen = [
      ...rows('Epicerie Fictive', 9),
      ...rows('Epicerie Fictive', 1, { categoryId: 'restaurants' }),
    ]
    expect(proposeRules(nineOfTen, [], CATEGORIES).proposed).toHaveLength(1)

    const eightOfTen = [
      ...rows('Epicerie Fictive', 8),
      ...rows('Epicerie Fictive', 2, { categoryId: 'restaurants' }),
    ]
    expect(proposeRules(eightOfTen, [], CATEGORIES).proposed).toEqual([])

    const otherKind = [
      ...rows('Epicerie Fictive', 8),
      ...rows('Epicerie Fictive', 2, { kind: 'income', amountCents: 100 }),
    ]
    expect(proposeRules(otherKind, [], CATEGORIES).proposed).toEqual([])
  })

  it('never lets uncategorized or flagged rows vote', () => {
    const flagged = rows('Boutique Fictive', 5, { needsReview: true })
    const uncategorized = rows('Autre Boutique', 5, { categoryId: null })
    expect(
      proposeRules([...flagged, ...uncategorized], [], CATEGORIES).proposed,
    ).toEqual([])
  })

  it('overrides the kind only when it differs from the category', () => {
    const refunds = rows('Remboursement Fictif', 3, {
      categoryId: 'groceries',
      kind: 'income',
      amountCents: 500,
    })
    expect(proposeRules(refunds, [], CATEGORIES).proposed[0]).toMatchObject({
      categoryId: 'groceries',
      kind: 'income',
    })
  })

  it('skips merchants already covered by an existing rule', () => {
    const result = proposeRules(
      rows('Epicerie Fictive', 4),
      [rule('epicerie')],
      CATEGORIES,
    )
    expect(result.proposed).toEqual([])
    expect(result.skippedCovered).toBe(1)

    // A disabled rule covers nothing.
    expect(
      proposeRules(
        rows('Epicerie Fictive', 4),
        [rule('epicerie', { enabled: false })],
        CATEGORIES,
      ).proposed,
    ).toHaveLength(1)
  })

  it('skips a key shadowed by a key proposed before it', () => {
    const result = proposeRules(
      [...rows('Fictif', 6), ...rows('Fictif Plus', 3)],
      [],
      CATEGORIES,
    )
    expect(result.proposed.map((p) => p.merchantKey)).toEqual(['FICTIF'])
    expect(result.skippedCovered).toBe(1)
  })

  it('skips a pattern that would catch rows filed differently', () => {
    const result = proposeRules(
      [
        ...rows('Gare', 3, { categoryId: 'groceries' }),
        ...rows('Cafe de la Gare', 2, { categoryId: 'restaurants' }),
      ],
      [],
      CATEGORIES,
    )
    expect(result.proposed).toEqual([])
    expect(result.skippedTooBroad).toBe(1)
  })

  it('ignores merchant keys that are too short', () => {
    expect(proposeRules(rows('Ab', 5), [], CATEGORIES).proposed).toEqual([])
  })
})
