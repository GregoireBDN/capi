import { describe, expect, it } from 'vitest'
import {
  COINBASE_2025,
  COINBASE_HOLDER,
  COINBASE_USER_ID,
  coinbaseCsv,
} from '../testing/crypto-fixtures'
import { parseCoinbaseCsv } from './coinbase.parser'
import { parseCryptoExport, UnsupportedCryptoExportError } from './detect'

describe('parseCoinbaseCsv', () => {
  it('skips the preamble and reads every line', () => {
    const result = parseCoinbaseCsv(coinbaseCsv(COINBASE_2025))
    expect(result.format).toBe('coinbase_csv')
    expect(result.issues).toEqual([])
    expect(result.movements).toHaveLength(COINBASE_2025.length)
    expect(result.movements[1]).toEqual({
      lineNumber: 5,
      occurredAt: '2025-03-01T10:05:00Z',
      wallet: null,
      operation: 'Buy',
      kind: 'buy',
      known: true,
      asset: 'BTC',
      quantity: '0.001',
      eurCents: 5099,
      sourceRef: 'cb0002',
    })
  })

  it('never keeps the account holder of the preamble', () => {
    const result = parseCoinbaseCsv(coinbaseCsv(COINBASE_2025))
    const text = JSON.stringify(result)
    expect(text).not.toContain(COINBASE_HOLDER)
    expect(text).not.toContain(COINBASE_USER_ID)
    expect(text).not.toContain('synthetic note')
  })

  it('maps the transaction types and their signs', () => {
    const { movements } = parseCoinbaseCsv(coinbaseCsv(COINBASE_2025))
    expect(
      movements.map((m) => [m.operation, m.kind, m.quantity, m.eurCents]),
    ).toEqual([
      ['Deposit', 'deposit', '100', 10000],
      ['Buy', 'buy', '0.001', 5099],
      ['Convert', 'convert', '-0.0005', 2500],
      ['Convert', 'convert', '0.01', 2490],
      ['Retail Simple Price Improvement', 'income', '0.000001', 5],
      ['Staking Income', 'income', '0.0001', 25],
      ['Send', 'withdrawal', '-0.005', 1200],
      ['Sell', 'sell', '-0.0002', 980],
      ['Receive', 'deposit', '2', 30000],
      ['Mystery Airdrop', 'other', '5', 0],
    ])
    expect(movements.at(-1)!.known).toBe(false)
  })

  it('signs the quantities of older, unsigned exports', () => {
    const { movements } = parseCoinbaseCsv(
      coinbaseCsv([
        ['a1', '2023-01-01T10:00:00Z', 'Sell', 'ETH', '0.5', '€500', '€495'],
        ['a2', '2023-01-02T10:00:00Z', 'Send', 'ETH', '0.1', '€100', '€100'],
        ['a3', '2023-01-03T10:00:00Z', 'Advanced Trade Buy', 'ETH', '-1', '€1', '€1'],
      ]),
    )
    expect(movements.map((m) => m.quantity)).toEqual(['-0.5', '-0.1', '1'])
    expect(movements[0].occurredAt).toBe('2023-01-01T10:00:00Z')
  })

  it('keeps no EUR amount for another price currency', () => {
    const csv = coinbaseCsv([
      ['u1', '2025-01-01 00:00:00 UTC', 'Buy', 'BTC', '0.1', '€1', '€1'],
    ]).replace(',EUR,', ',USD,')
    expect(parseCoinbaseCsv(csv).movements[0].eurCents).toBeNull()
  })

  it('reports bad lines and keeps going', () => {
    const { movements, issues } = parseCoinbaseCsv(
      coinbaseCsv([
        ['b1', 'yesterday', 'Buy', 'BTC', '0.1', '€1', '€1'],
        ['b2', '2025-01-01 00:00:00 UTC', 'Buy', 'BTC', '', '€1', '€1'],
        ['b3', '2025-01-01 00:00:00 UTC', 'Buy', 'BTC', '0.1', '€1', '€1'],
      ]),
    )
    expect(movements).toHaveLength(1)
    expect(issues).toEqual([
      { lineNumber: 4, message: 'Date illisible' },
      { lineNumber: 5, message: 'Quantité illisible' },
    ])
  })

  it('is detected from its headers, other files refused', () => {
    expect(
      parseCryptoExport(Buffer.from(coinbaseCsv(COINBASE_2025))).format,
    ).toBe('coinbase_csv')
    expect(() =>
      parseCryptoExport(Buffer.from('Date;Libellé;Débit;Crédit\n')),
    ).toThrow(UnsupportedCryptoExportError)
  })
})
