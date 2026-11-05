import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from '#/categories/default-categories'
import type { TransactionKind } from '#/database/schema/domain-enums'
import {
  accountForBalanceColumn,
  type CategoryRowInput,
  DEFAULT_ACCOUNT_SPECS,
  DEFAULT_SHEET_CATEGORIES,
  mapCategory,
  parseAccountMapping,
  parseCategoryOverrides,
} from './mapping'

const KINDS: ReadonlyMap<string, TransactionKind> = new Map(
  DEFAULT_CATEGORIES.map((c) => [c.slug, c.kind]),
)

function row(overrides: Partial<CategoryRowInput>): CategoryRowInput {
  return {
    categorySlug: 'courses',
    group: 'expense',
    unknownGroup: null,
    amountCents: -1000,
    ...overrides,
  }
}

const map = (overrides: Partial<CategoryRowInput>) =>
  mapCategory(row(overrides), DEFAULT_SHEET_CATEGORIES, KINDS)

describe('DEFAULT_SHEET_CATEGORIES', () => {
  it('only targets seeded categories', () => {
    for (const mapping of Object.values(DEFAULT_SHEET_CATEGORIES)) {
      const targets = [mapping.default, ...Object.values(mapping.byGroup ?? {})]
      for (const target of targets) {
        if (target.slug !== null) expect(KINDS.has(target.slug)).toBe(true)
      }
    }
  })

  it('maps every category observed in the sheet', () => {
    for (const slug of [
      'abonnements',
      'assurances',
      'autres_depenses',
      'courses',
      'energie',
      'especes',
      'frais_bancaires',
      'loisirs',
      'loyer',
      'paypal',
      'restaurants_cafes',
      'sante',
      'shopping',
      'telecom',
      'transport',
      'virement_emis',
      'voyages',
      'famille',
    ]) {
      expect(DEFAULT_SHEET_CATEGORIES[slug]).toBeDefined()
    }
  })
})

describe('mapCategory', () => {
  it('maps a known category with its Groupe', () => {
    expect(map({})).toEqual({
      categorySlug: 'groceries',
      kind: 'expense',
      needsReview: false,
      reviewReason: null,
    })
    expect(
      map({ categorySlug: 'salaire', group: 'income', amountCents: 1 }),
    ).toMatchObject({
      categorySlug: 'salary',
      kind: 'income',
      needsReview: false,
    })
    expect(map({ categorySlug: 'epargne', group: 'transfer' })).toMatchObject({
      categorySlug: 'savings_transfer',
      kind: 'transfer',
      needsReview: false,
    })
  })

  it('lets Groupe win over the category kind', () => {
    // A refund filed under groceries: income, no review.
    expect(map({ group: 'income', amountCents: 500 })).toEqual({
      categorySlug: 'groceries',
      kind: 'income',
      needsReview: false,
      reviewReason: null,
    })
    // An expense in a transfer category: Groupe wins but it is flagged,
    // since it decides whether the row counts in stats at all.
    expect(map({ categorySlug: 'epargne', group: 'expense' })).toEqual({
      categorySlug: 'savings_transfer',
      kind: 'expense',
      needsReview: true,
      reviewReason: 'transfer_kind_mismatch',
    })
    expect(map({ categorySlug: 'courses', group: 'transfer' })).toMatchObject({
      categorySlug: 'groceries',
      kind: 'transfer',
      reviewReason: 'transfer_kind_mismatch',
    })
  })

  it('falls back to the category kind, then the amount sign, without Groupe', () => {
    expect(map({ group: null, categorySlug: 'salaire' })).toMatchObject({
      kind: 'income',
      needsReview: false,
    })
    expect(
      map({ group: null, categorySlug: null, amountCents: 700 }),
    ).toMatchObject({
      categorySlug: null,
      kind: 'income',
      needsReview: true,
      reviewReason: 'missing_category',
    })
  })

  it('maps plain transfers depending on Groupe', () => {
    expect(map({ categorySlug: 'virement_emis', group: 'transfer' })).toEqual({
      categorySlug: 'internal_transfer',
      kind: 'transfer',
      needsReview: false,
      reviewReason: null,
    })
    expect(map({ categorySlug: 'virement_emis', group: 'expense' })).toEqual({
      categorySlug: null,
      kind: 'expense',
      needsReview: true,
      reviewReason: 'ambiguous_category',
    })
    expect(
      map({ categorySlug: 'virement_recu', group: 'income', amountCents: 1 }),
    ).toEqual({
      categorySlug: 'other_income',
      kind: 'income',
      needsReview: true,
      reviewReason: 'ambiguous_category',
    })
  })

  it('flags PayPal and unknown slugs for review without failing', () => {
    expect(map({ categorySlug: 'paypal' })).toEqual({
      categorySlug: null,
      kind: 'expense',
      needsReview: true,
      reviewReason: 'ambiguous_category',
    })
    expect(map({ categorySlug: 'jamais_vue' })).toEqual({
      categorySlug: null,
      kind: 'expense',
      needsReview: true,
      reviewReason: 'unmapped_category',
    })
  })

  it('files an uncategorized transfer as internal_transfer, for review', () => {
    expect(map({ categorySlug: 'jamais_vue', group: 'transfer' })).toEqual({
      categorySlug: 'internal_transfer',
      kind: 'transfer',
      needsReview: true,
      reviewReason: 'unmapped_category',
    })
  })

  it('flags unknown Groupe values and missing target categories', () => {
    expect(map({ group: null, unknownGroup: 'Autre' })).toMatchObject({
      categorySlug: 'groceries',
      kind: 'expense',
      needsReview: true,
      reviewReason: 'unknown_group',
    })
    const withoutGroceries = new Map(KINDS)
    withoutGroceries.delete('groceries')
    expect(
      mapCategory(row({}), DEFAULT_SHEET_CATEGORIES, withoutGroceries),
    ).toMatchObject({
      categorySlug: null,
      needsReview: true,
      reviewReason: 'missing_target_category',
    })
  })
})

describe('parseCategoryOverrides', () => {
  it('merges overrides over the defaults', () => {
    const mappings = parseCategoryOverrides(
      JSON.stringify({
        paypal: 'shopping',
        'Nouvelle Catégorie': 'gifts',
        courses: null,
      }),
    )
    const mapWith = (slug: string) =>
      mapCategory(row({ categorySlug: slug }), mappings, KINDS)
    expect(mapWith('paypal')).toMatchObject({
      categorySlug: 'shopping',
      needsReview: false,
    })
    expect(mapWith('nouvelle_categorie')).toMatchObject({
      categorySlug: 'gifts',
    })
    expect(mapWith('courses')).toMatchObject({
      categorySlug: null,
      needsReview: true,
    })
    expect(mapWith('loyer')).toMatchObject({ categorySlug: 'rent' })
  })

  it('rejects invalid files', () => {
    expect(() => parseCategoryOverrides('{')).toThrow('not valid JSON')
    expect(() => parseCategoryOverrides('{"a": 1}')).toThrow(
      'Invalid category mapping',
    )
  })
})

describe('account mapping', () => {
  it('maps the default codes', () => {
    expect(DEFAULT_ACCOUNT_SPECS.map((s) => [s.code, s.name, s.type])).toEqual([
      ['CC', 'Compte courant', 'checking'],
      ['LA', 'Livret A', 'savings'],
      ['LJ', 'Livret Jeune', 'savings'],
    ])
  })

  it('merges a mapping file over the defaults', () => {
    const specs = parseAccountMapping(
      JSON.stringify({
        cc: { name: 'Compte chèques', type: 'checking' },
        PEA: { name: 'PEA', type: 'brokerage', institution: null },
      }),
    )
    expect(specs).toEqual([
      {
        code: 'CC',
        name: 'Compte chèques',
        type: 'checking',
        institution: 'CIC',
        balanceColumn: 'Compte chèques',
      },
      DEFAULT_ACCOUNT_SPECS[1],
      DEFAULT_ACCOUNT_SPECS[2],
      {
        code: 'PEA',
        name: 'PEA',
        type: 'brokerage',
        institution: null,
        balanceColumn: 'PEA',
      },
    ])
  })

  it('rejects an invalid mapping file', () => {
    expect(() => parseAccountMapping('[]')).toThrow('Invalid account mapping')
    expect(() =>
      parseAccountMapping(JSON.stringify({ CC: { name: 'X', type: 'nope' } })),
    ).toThrow('CC.type')
  })

  it('finds the account of a balance column', () => {
    expect(
      accountForBalanceColumn(DEFAULT_ACCOUNT_SPECS, 'livret a')?.code,
    ).toBe('LA')
    expect(
      accountForBalanceColumn(DEFAULT_ACCOUNT_SPECS, 'Compte Courant')?.code,
    ).toBe('CC')
    expect(
      accountForBalanceColumn(DEFAULT_ACCOUNT_SPECS, 'PEA'),
    ).toBeUndefined()
  })
})
