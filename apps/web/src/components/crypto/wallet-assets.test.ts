import { describe, expect, it } from 'vitest'
import type { SnapshotDto, ValuedHoldingDto } from '#/api/types.gen'
import {
  chartRanges,
  groupHoldings,
  monthsBefore,
  shareText,
  splitParts,
} from './wallet-assets'

let id = 0
function line(overrides: Partial<ValuedHoldingDto>): ValuedHoldingDto {
  id += 1
  return {
    id: `h-${id}`,
    accountId: 'a-1',
    assetId: 'bitcoin',
    symbol: 'BTC',
    name: 'Bitcoin',
    quantity: '0.5',
    location: 'Bitcoin',
    investedCents: null,
    note: null,
    origin: 'sync',
    priceEur: '60000',
    priceSource: 'provider',
    priceFetchedAt: '2026-11-19T08:00:00.000Z',
    priceStale: false,
    priceChange24hPercent: null,
    valueCents: 3_000_000,
    gainCents: null,
    ...overrides,
  }
}

const eth = { assetId: 'ethereum', symbol: 'ETH', name: 'Ethereum' }

describe('groupHoldings', () => {
  it('sums one asset across its chains, exactly, largest line first', () => {
    const [asset] = groupHoldings([
      line({
        ...eth,
        location: 'Arbitrum',
        quantity: '0.15',
        valueCents: 44250,
      }),
      line({
        ...eth,
        location: 'Ethereum',
        quantity: '0.9',
        valueCents: 265500,
      }),
    ])
    expect(asset.quantity).toBe('1.05')
    expect(asset.valueCents).toBe(309750)
    expect(asset.lines.map((l) => l.location)).toEqual(['Ethereum', 'Arbitrum'])
  })

  it('orders priced assets by value, then those without a price', () => {
    const assets = groupHoldings([
      line({
        assetId: 'erc20.42161.0x1111111111111111111111111111111111111111',
        symbol: 'DEMO',
        name: 'Demo',
        priceEur: null,
        priceFetchedAt: null,
        valueCents: null,
      }),
      line({ ...eth, valueCents: 100 }),
      line({ valueCents: 500 }),
    ])
    expect(
      assets.map((a) => [a.symbol, a.valueCents, a.priced?.symbol]),
    ).toEqual([
      ['BTC', 500, 'BTC'],
      ['ETH', 100, 'ETH'],
      ['DEMO', null, undefined],
    ])
  })
})

describe('splitParts', () => {
  it('keeps the four largest assets and sums the rest as « Autres »', () => {
    const assets = groupHoldings(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((symbol, index) =>
        line({
          assetId: symbol,
          symbol: symbol.toUpperCase(),
          valueCents: 600 - index * 100,
        }),
      ),
    )
    const parts = splitParts(assets)
    expect(parts.map((p) => [p.label, p.valueCents])).toEqual([
      ['A', 600],
      ['B', 500],
      ['C', 400],
      ['D', 300],
      ['Autres', 300],
    ])
    expect(parts.at(-1)?.color).toBe('var(--chart-other)')
  })

  it('gives a coin its own colour, the others the palette in turn', () => {
    const assets = groupHoldings([
      line({ assetId: 'bitcoin', symbol: 'BTC', valueCents: 500 }),
      line({ assetId: 'x', symbol: 'XYZ', valueCents: 400 }),
      line({ assetId: 'ethereum', symbol: 'ETH', valueCents: 300 }),
      line({ assetId: 'polygon', symbol: 'MATIC', valueCents: 200 }),
      line({ assetId: 'pol', symbol: 'POL', valueCents: 100 }),
    ])
    expect(splitParts(assets).map((p) => [p.label, p.color])).toEqual([
      ['BTC', '#F7931A'],
      ['XYZ', 'var(--chart-1)'],
      ['ETH', '#627EEA'],
      ['MATIC', '#8247E5'],
      // The same colour twice would read as one part.
      ['POL', 'var(--chart-2)'],
    ])
  })

  it('shows five assets as they are, and leaves out those without a value', () => {
    const assets = groupHoldings([
      ...['a', 'b', 'c', 'd', 'e'].map((symbol) =>
        line({ assetId: symbol, symbol, valueCents: 100 }),
      ),
      line({ assetId: 'z', symbol: 'Z', valueCents: 0 }),
    ])
    expect(splitParts(assets).map((p) => p.label)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ])
  })
})

describe('shareText', () => {
  it('rounds shares and says « < 1 % » for a tiny one', () => {
    expect(shareText(429000, 777112)).toBe('55 %')
    expect(shareText(1, 777112)).toBe('< 1 %')
    expect(shareText(0, 777112)).toBe('0 %')
  })
})

describe('chart ranges', () => {
  const snapshot = (date: string): SnapshotDto => ({
    id: date,
    date,
    valueCents: 100,
    contributionsCents: null,
    note: null,
  })

  it('goes back by calendar months, clamped to the month end', () => {
    expect(monthsBefore('2026-11-19', 6)).toBe('2026-05-19')
    expect(monthsBefore('2026-08-31', 6)).toBe('2026-02-28')
    expect(monthsBefore('2026-01-15', 12)).toBe('2025-01-15')
  })

  it('offers only the ranges that show more than the shorter one', () => {
    const today = '2026-11-19'
    expect(chartRanges([], today)).toEqual([])
    expect(chartRanges([snapshot('2026-09-01')], today)).toEqual([])
    expect(chartRanges([snapshot('2026-03-01')], today)).toEqual(['6m', 'all'])
    expect(chartRanges([snapshot('2025-01-01')], today)).toEqual([
      '6m',
      '1y',
      'all',
    ])
  })
})
