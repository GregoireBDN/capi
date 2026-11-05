import { describe, expect, it } from 'vitest'
import type { SelectCategory } from './categories.schema'
import { compareCategories } from './categories.service'

function category(kind: SelectCategory['kind'], name: string): SelectCategory {
  const now = new Date('2026-01-01T00:00:00Z')
  return {
    id: name,
    slug: name,
    name,
    kind,
    color: null,
    createdAt: now,
    updatedAt: now,
  }
}

describe('compareCategories', () => {
  it('orders by kind, then by name with French collation', () => {
    const sorted = [
      category('transfer', 'Virement interne'),
      category('transfer', 'Épargne'),
      category('income', 'Salaire'),
      category('expense', 'Loyer'),
      category('expense', 'Énergie'),
      category('expense', 'abonnements'),
    ].sort(compareCategories)

    expect(sorted.map((c) => `${c.kind}/${c.name}`)).toEqual([
      'expense/abonnements',
      'expense/Énergie',
      'expense/Loyer',
      'income/Salaire',
      'transfer/Épargne',
      'transfer/Virement interne',
    ])
  })
})
