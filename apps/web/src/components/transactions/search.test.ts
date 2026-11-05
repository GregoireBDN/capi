import { describe, expect, it } from 'vitest'
import {
  activeFilterCount,
  isDefaultSearch,
  parseTransactionsSearch,
  toFilters,
} from './search'

const ACCOUNT = '10000000-0000-4000-8000-000000000001'
const CATEGORY = 'c0000000-0000-4000-8000-000000000001'

describe('transactions search params', () => {
  it('keeps valid params', () => {
    expect(
      parseTransactionsSearch({
        month: '2026-02',
        account: ACCOUNT,
        category: CATEGORY,
        kind: 'transfer',
        q: '  fakemart ',
        review: true,
        oneOff: true,
        sort: 'amount_asc',
      }),
    ).toEqual({
      month: '2026-02',
      account: ACCOUNT,
      category: CATEGORY,
      kind: 'transfer',
      q: 'fakemart',
      review: true,
      oneOff: true,
      sort: 'amount_asc',
    })
    expect(parseTransactionsSearch({ month: 'all', category: 'none' })).toEqual(
      { month: 'all', category: 'none' },
    )
  })

  it('drops invalid or meaningless params instead of failing', () => {
    expect(
      parseTransactionsSearch({
        month: '2026-13',
        account: 'nope',
        category: 'groceries',
        kind: 'refund',
        q: '   ',
        review: false,
        oneOff: 'yes',
        sort: 'random',
        page: 3,
      }),
    ).toEqual({})
  })

  it('reads a numeric search back as text', () => {
    // The router JSON-parses `?q=1234`.
    expect(parseTransactionsSearch({ q: 1234 })).toEqual({ q: '1234' })
  })

  it('maps the search to API filters', () => {
    expect(toFilters({}, '2026-11')).toEqual({ month: '2026-11' })
    expect(toFilters({ month: 'all' }, '2026-11')).toEqual({})
    expect(
      toFilters(
        {
          month: '2026-02',
          account: ACCOUNT,
          category: 'none',
          kind: 'expense',
          q: 'cafe',
          review: true,
          oneOff: true,
          sort: 'date_asc',
        },
        '2026-11',
      ),
    ).toEqual({
      month: '2026-02',
      accountId: ACCOUNT,
      uncategorized: true,
      kind: 'expense',
      q: 'cafe',
      needsReview: true,
      isOneOff: true,
    })
    expect(toFilters({ category: CATEGORY }, '2026-11')).toEqual({
      month: '2026-11',
      categoryId: CATEGORY,
    })
  })

  it('counts active filters', () => {
    expect(activeFilterCount({ month: '2026-01', sort: 'date_asc' })).toBe(0)
    expect(activeFilterCount({ q: 'x', review: true })).toBe(2)
    expect(isDefaultSearch({})).toBe(true)
    expect(isDefaultSearch({ sort: 'date_asc' })).toBe(false)
  })
})
