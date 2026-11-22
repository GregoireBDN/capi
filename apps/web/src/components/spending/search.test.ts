import { describe, expect, it } from 'vitest'
import { parseSpendingSearch } from './search'

const ID = 'c0000000-0000-4000-8000-000000000001'

describe('parseSpendingSearch', () => {
  it('keeps valid filters', () => {
    expect(
      parseSpendingSearch({
        month: '2026-10',
        oneOffs: true,
        account: ID,
        trend: ID,
        vue: 'revenus',
      }),
    ).toEqual({
      month: '2026-10',
      oneOffs: true,
      account: ID,
      trend: ID,
      vue: 'revenus',
    })
    expect(parseSpendingSearch({ trend: 'none', vue: 'epargne' })).toEqual({
      trend: 'none',
      vue: 'epargne',
    })
  })

  it('drops invalid or default values', () => {
    expect(
      parseSpendingSearch({
        month: '2026-13',
        oneOffs: false,
        account: 'nope',
        trend: 'groceries',
        // The average is fixed at 12 months (#410): an old link's is dropped.
        avg: 12,
        vue: 'depenses',
        other: 'x',
      }),
    ).toEqual({})
    expect(parseSpendingSearch({})).toEqual({})
  })
})
