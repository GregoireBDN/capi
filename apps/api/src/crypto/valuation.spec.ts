import { describe, expect, it } from 'vitest'
import { type Quote, valuateHoldings } from './valuation'

/** Synthetic quantities and prices only. */
const NOW = new Date('2026-11-05T10:00:00Z')
const TTL = 10 * 60_000
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000)

const quote = (
  priceEur: string,
  minutes = 1,
  source: Quote['source'] = 'provider',
): Quote => ({ priceEur, fetchedAt: minutesAgo(minutes), source })

describe('valuateHoldings', () => {
  it('values quantity × price and sums the account', () => {
    const result = valuateHoldings(
      [
        {
          id: 'h1',
          assetId: 'bitcoin',
          quantity: '0.12345678',
          investedCents: 500_000,
        },
        {
          id: 'h2',
          assetId: 'bitcoin',
          quantity: '0.5',
          investedCents: 2_000_000,
        },
        {
          id: 'h3',
          assetId: 'tiny',
          quantity: '1234567.89',
          investedCents: 1_000,
        },
      ],
      new Map([
        ['bitcoin', quote('61234.56')],
        ['tiny', quote('0.0000123456')],
      ]),
      NOW,
      TTL,
    )
    // 0.12345678 × 61234.56 × 100 = 755982.16… → 755982
    expect(result.holdings.map((h) => h.valueCents)).toEqual([
      755_982, 3_061_728, 1_524,
    ])
    expect(result.holdings.map((h) => h.gainCents)).toEqual([
      255_982, 1_061_728, 524,
    ])
    expect(result.totals).toEqual({
      valueCents: 755_982 + 3_061_728 + 1_524,
      investedCents: 2_501_000,
      gainCents: 755_982 + 3_061_728 + 1_524 - 2_501_000,
      missingPriceCount: 0,
      staleCount: 0,
      withoutInvestedCount: 0,
    })
    expect(result.complete).toBe(true)
  })

  it('flags stale provider prices but keeps manual ones fresh', () => {
    const result = valuateHoldings(
      [
        { id: 'h1', assetId: 'a', quantity: '2', investedCents: null },
        { id: 'h2', assetId: 'b', quantity: '3', investedCents: 100 },
      ],
      new Map([
        ['a', quote('10', 11)],
        ['b', quote('1', 60 * 24, 'manual')],
      ]),
      NOW,
      TTL,
    )
    expect(result.holdings.map((h) => h.priceStale)).toEqual([true, false])
    expect(result.totals).toMatchObject({
      valueCents: 2_300,
      investedCents: null,
      gainCents: null,
      staleCount: 1,
      withoutInvestedCount: 1,
    })
    expect(result.holdings[1].gainCents).toBe(200)
  })

  it('is incomplete when an asset has no price', () => {
    const result = valuateHoldings(
      [
        { id: 'h1', assetId: 'a', quantity: '1', investedCents: 100 },
        { id: 'h2', assetId: 'unknown', quantity: '1', investedCents: 100 },
      ],
      new Map([['a', quote('5')]]),
      NOW,
      TTL,
    )
    expect(result.complete).toBe(false)
    expect(result.holdings[1]).toMatchObject({ valueCents: null, quote: null })
    expect(result.totals).toMatchObject({
      valueCents: 500,
      investedCents: 200,
      gainCents: null,
      missingPriceCount: 1,
    })
  })

  it('has no invested total without holdings', () => {
    expect(valuateHoldings([], new Map(), NOW, TTL).totals).toMatchObject({
      valueCents: 0,
      investedCents: null,
    })
  })
})
