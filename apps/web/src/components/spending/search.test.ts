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
        avg: 12,
      }),
    ).toEqual({
      month: '2026-10',
      oneOffs: true,
      account: ID,
      trend: ID,
      avg: 12,
    })
    expect(parseSpendingSearch({ trend: 'none', avg: 3 })).toEqual({
      trend: 'none',
      avg: 3,
    })
  })

  it('drops invalid or default values', () => {
    expect(
      parseSpendingSearch({
        month: '2026-13',
        oneOffs: false,
        account: 'nope',
        trend: 'groceries',
        avg: 6,
        other: 'x',
      }),
    ).toEqual({})
    expect(parseSpendingSearch({})).toEqual({})
  })
})
