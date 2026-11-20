import { describe, expect, it } from 'vitest'
import {
  aggregatePortfolio,
  changeOverDay,
  type PortfolioLine,
  sumDecimals,
} from './portfolio'

/** A valued line, priced at `priceEur` (synthetic figures). */
function line(
  assetId: string,
  symbol: string,
  quantity: string,
  valueCents: number | null,
  extra: Partial<PortfolioLine> = {},
): PortfolioLine {
  return {
    assetId,
    symbol,
    name: symbol,
    quantity,
    investedCents: null,
    priceEur: valueCents === null ? null : '100',
    priceSource: valueCents === null ? null : 'provider',
    priceFetchedAt: valueCents === null ? null : '2026-11-19T09:00:00.000Z',
    priceStale: false,
    priceChange24hPercent: null,
    valueCents,
    ...extra,
  }
}

describe('sumDecimals', () => {
  it('adds exact decimals of different scales', () => {
    expect(sumDecimals(['0.1', '0.2'])).toBe('0.3')
    expect(sumDecimals(['0.000000000000000001', '1'])).toBe(
      '1.000000000000000001',
    )
    expect(sumDecimals(['12', '0.5', '7.25'])).toBe('19.75')
  })
})

describe('changeOverDay', () => {
  it('reads what the value moved from the price change', () => {
    // 1 100 € after +10 %: it was 1 000 €.
    expect(changeOverDay(110_000, '10')).toBe(10_000)
    // 900 € after −10 %: it was 1 000 €.
    expect(changeOverDay(90_000, '-10')).toBe(-10_000)
    expect(changeOverDay(50_000, '0')).toBe(0)
  })

  it('has no previous value for a change of −100 %', () => {
    expect(changeOverDay(0, '-100')).toBeNull()
  })
})

describe('aggregatePortfolio', () => {
  it('sums the same asset held on two accounts', () => {
    const { assets, totals } = aggregatePortfolio([
      {
        accountId: 'exchange',
        name: 'Plateforme',
        lines: [
          line('bitcoin', 'BTC', '0.0225', 185_625, { investedCents: 120_000 }),
          line('ethereum', 'ETH', '0.3', 88_500, {
            investedCents: 70_000,
            priceChange24hPercent: '-1.8',
          }),
        ],
      },
      {
        accountId: 'ledger',
        name: 'Ledger',
        lines: [
          line('bitcoin', 'BTC', '0.06', 495_000, { investedCents: 292_000 }),
          // Same asset at two locations of one account: one place.
          line('ethereum', 'ETH', '0.9', 265_500, {
            investedCents: 200_000,
            priceChange24hPercent: '-1.8',
          }),
          line('ethereum', 'ETH', '0.15', 44_250, {
            investedCents: 81_000,
            priceChange24hPercent: '-1.8',
          }),
        ],
      },
    ])
    expect(assets.map((asset) => asset.symbol)).toEqual(['BTC', 'ETH'])
    const [btc, eth] = assets
    expect(btc).toMatchObject({
      quantity: '0.0825',
      valueCents: 680_625,
      investedCents: 412_000,
      gainCents: 268_625,
      priceable: true,
    })
    expect(btc.places).toEqual([
      {
        accountId: 'ledger',
        name: 'Ledger',
        quantity: '0.06',
        valueCents: 495_000,
      },
      {
        accountId: 'exchange',
        name: 'Plateforme',
        quantity: '0.0225',
        valueCents: 185_625,
      },
    ])
    expect(eth.quantity).toBe('1.35')
    expect(eth.valueCents).toBe(398_250)
    expect(eth.places.map((place) => place.quantity)).toEqual(['1.05', '0.3'])
    // The price's change applies to the whole asset.
    expect(eth.change24hPercent).toBe('-1.8')
    expect(eth.change24hCents).toBe(changeOverDay(398_250, '-1.8'))
    expect(totals).toMatchObject({
      valueCents: 1_078_875,
      investedCents: 763_000,
      gainCents: 315_875,
      withoutInvestedCount: 0,
      missingPriceCount: 0,
      change24hCents: eth.change24hCents,
    })
  })

  it('keeps a token without a price last, out of the totals', () => {
    const { assets, totals } = aggregatePortfolio([
      {
        accountId: 'ledger',
        name: 'Ledger',
        lines: [
          line(
            'erc20.42161.0x0000000000000000000000000000000000000001',
            'DEMO',
            '15000',
            null,
          ),
          line('solana', 'SOL', '12', 154_080),
          line('waiting-coin', 'WAIT', '3', null),
        ],
      },
    ])
    expect(assets.map((asset) => [asset.symbol, asset.priceable])).toEqual([
      ['SOL', true],
      ['DEMO', false],
      ['WAIT', true],
    ])
    expect(assets[1]).toMatchObject({
      valueCents: null,
      gainCents: null,
      change24hCents: null,
    })
    expect(totals).toMatchObject({
      valueCents: 154_080,
      // SOL's cost is unknown: no invested amount to show.
      investedCents: null,
      gainCents: null,
      withoutInvestedCount: 1,
      // The contract token waits for no price; WAIT does.
      missingPriceCount: 1,
      change24hCents: null,
    })
  })

  it('leaves fiat out', () => {
    const { assets, totals } = aggregatePortfolio([
      {
        accountId: 'exchange',
        name: 'Plateforme',
        lines: [
          line('euro', 'EUR', '250', 25_000),
          line('bitcoin', 'BTC', '0.01', 82_500),
        ],
      },
    ])
    expect(assets.map((asset) => asset.symbol)).toEqual(['BTC'])
    expect(totals.valueCents).toBe(82_500)
  })

  it('counts the gain over the assets whose cost is known', () => {
    const { totals } = aggregatePortfolio([
      {
        accountId: 'a',
        name: 'A',
        lines: [
          line('bitcoin', 'BTC', '0.01', 82_500, { investedCents: 50_000 }),
          // Half of ETH's lines without a cost: ETH's cost is unknown.
          line('ethereum', 'ETH', '1', 295_000, { investedCents: 200_000 }),
        ],
      },
      {
        accountId: 'b',
        name: 'B',
        lines: [line('ethereum', 'ETH', '0.1', 29_500)],
      },
    ])
    expect(totals).toMatchObject({
      investedCents: 50_000,
      gainCents: 32_500,
      withoutInvestedCount: 1,
    })
  })

  it('counts a wallet whose cost is known as a whole (#358)', () => {
    const { assets, totals } = aggregatePortfolio([
      {
        accountId: 'ledger',
        name: 'Ledger',
        // Synced lines have no cost; the wallet's invested base gives it.
        lines: [
          line('bitcoin', 'BTC', '0.02', 200_000),
          line('ethereum', 'ETH', '0.5', 100_000),
        ],
        investedCents: 500_000,
      },
      {
        accountId: 'exchange',
        name: 'Plateforme',
        lines: [
          line('bitcoin', 'BTC', '0.01', 100_000, { investedCents: 60_000 }),
          line('solana', 'SOL', '2', 30_000),
        ],
      },
    ])
    expect(totals).toMatchObject({
      valueCents: 430_000,
      investedCents: 560_000,
      // Wallet: 3 000 − 5 000; exchange BTC: 1 000 − 600.
      gainCents: -160_000,
      withoutInvestedCount: 1,
      withoutInvestedSymbols: ['SOL'],
    })
    // Per asset, only the lines say what was paid.
    expect(assets.find((asset) => asset.symbol === 'BTC')?.investedCents).toBe(
      null,
    )
  })

  it('returns nothing for no account', () => {
    expect(aggregatePortfolio([])).toEqual({
      assets: [],
      totals: {
        valueCents: 0,
        change24hCents: null,
        investedCents: null,
        gainCents: null,
        withoutInvestedCount: 0,
        withoutInvestedSymbols: [],
        missingPriceCount: 0,
        staleCount: 0,
      },
    })
  })
})
