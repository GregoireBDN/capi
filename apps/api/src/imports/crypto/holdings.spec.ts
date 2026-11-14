import { describe, expect, it } from 'vitest'
import { knownAsset } from './assets'
import type { ParsedMovement } from './crypto-import.types'
import { computeHoldings, type HoldingMovement } from './holdings'
import { parseBinanceCsv } from './parsers/binance.parser'
import { parseCoinbaseCsv } from './parsers/coinbase.parser'
import {
  BINANCE_EARLY,
  BINANCE_EARLY_BALANCES,
  binanceCsv,
  COINBASE_2025,
  COINBASE_2025_BALANCES,
  coinbaseCsv,
} from './testing/crypto-fixtures'

const byAsset = (movements: HoldingMovement[]) =>
  Object.fromEntries(
    computeHoldings(movements, knownAsset).map((holding) => [
      holding.assetId ?? holding.symbol,
      holding,
    ]),
  )

const line = (
  occurredAt: string,
  kind: ParsedMovement['kind'],
  asset: string,
  quantity: string,
  eurCents: number | null = null,
): HoldingMovement => ({
  occurredAt: `2025-01-01T${occurredAt}Z`,
  kind,
  asset,
  quantity,
  eurCents,
})

describe('computeHoldings', () => {
  it('matches the Binance balances of the fixture, EUR left out', () => {
    const holdings = byAsset(
      parseBinanceCsv(binanceCsv(BINANCE_EARLY)).movements,
    )
    expect(
      Object.fromEntries(
        Object.entries(holdings).map(([id, holding]) => [id, holding.quantity]),
      ),
    ).toEqual(BINANCE_EARLY_BALANCES)
    expect(holdings.EUR).toBeUndefined()
  })

  it('computes the Binance invested amounts, fees included', () => {
    const holdings = byAsset(
      parseBinanceCsv(binanceCsv(BINANCE_EARLY)).movements,
    )
    // 200 € bought 0.003992 BTC; the conversion took 0.001 (50.10 €) to ETH,
    // the withdrawal another 0.001 (50.10 €).
    expect(holdings.bitcoin.investedCents).toBe(9980)
    // ETH carries 50.10 €, half of it sold.
    expect(holdings.ethereum.investedCents).toBe(2505)
    // A Crypto Box comes at no cost; the transfers don't move it.
    expect(holdings.tether.investedCents).toBe(0)
    // Deposited from elsewhere, unknown operation: cost unknown.
    expect(holdings['render-token']).toMatchObject({
      symbol: 'RENDER',
      tickers: ['RNDR'],
      investedCents: null,
      status: 'ok',
    })
    expect(holdings.binancecoin.investedCents).toBeNull()
  })

  it('matches the Coinbase balances and costs of the fixture', () => {
    const holdings = byAsset(
      parseCoinbaseCsv(coinbaseCsv(COINBASE_2025)).movements,
    )
    for (const [id, quantity] of Object.entries(COINBASE_2025_BALANCES)) {
      expect(holdings[id].quantity).toBe(quantity)
    }
    // 50.99 € bought 0.001 BTC; half converted to ETH (25.50 € carried over),
    // 0.0002 of the 0.000501 left sold.
    expect(holdings.bitcoin.investedCents).toBe(1531)
    expect(holdings.ethereum.investedCents).toBe(1288)
    expect(holdings.solana.investedCents).toBeNull()
    expect(holdings.XYZ).toMatchObject({
      assetId: null,
      quantity: '5',
      status: 'unmapped',
    })
  })

  it('merges renamed tickers: a swap cancels out, a rename keeps its quantity', () => {
    const holdings = byAsset([
      line('10:00:00', 'buy', 'AGIX', '100', 5000),
      line('11:00:00', 'convert', 'AGIX', '-100'),
      line('11:00:00', 'convert', 'FET', '43.335'),
      line('12:00:00', 'deposit', 'FTM', '10'),
      line('13:00:00', 'income', 'S', '1'),
    ])
    expect(holdings['fetch-ai']).toMatchObject({
      quantity: '43.335',
      investedCents: 5000,
      tickers: ['AGIX', 'FET'],
    })
    expect(holdings['sonic-3']).toMatchObject({ quantity: '11', symbol: 'S' })
  })

  it('flags a negative balance (history missing) and leaves zeroes out', () => {
    const holdings = byAsset([
      line('10:00:00', 'withdrawal', 'ETH', '-1'),
      line('10:00:00', 'buy', 'BTC', '1', 100),
      line('11:00:00', 'sell', 'BTC', '-1'),
    ])
    expect(holdings.ethereum).toMatchObject({
      quantity: '-1',
      status: 'negative',
      investedCents: null,
    })
    expect(holdings.bitcoin).toBeUndefined()
  })

  it('starts afresh once an asset is emptied', () => {
    const holdings = byAsset([
      line('10:00:00', 'deposit', 'BTC', '1'),
      line('11:00:00', 'withdrawal', 'BTC', '-1'),
      line('12:00:00', 'buy', 'BTC', '0.5', 2000),
    ])
    expect(holdings.bitcoin.investedCents).toBe(2000)
  })

  it('counts unknown operations and keeps the cost unknown', () => {
    const holdings = byAsset([
      line('10:00:00', 'buy', 'BTC', '1', 100),
      line('11:00:00', 'other', 'BTC', '0.5'),
    ])
    expect(holdings.bitcoin).toMatchObject({
      quantity: '1.5',
      investedCents: null,
    })
  })
})
