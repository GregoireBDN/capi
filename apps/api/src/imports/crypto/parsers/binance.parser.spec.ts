import { describe, expect, it } from 'vitest'
import {
  BINANCE_EARLY,
  BINANCE_EN_HEADER,
  binanceCsv,
} from '../testing/crypto-fixtures'
import { parseBinanceCsv } from './binance.parser'
import { parseCryptoExport } from './detect'

describe('parseBinanceCsv', () => {
  it('reads the French ledger: BOM, trailing spaces, signed quantities', () => {
    const { format, movements, issues } = parseBinanceCsv(
      binanceCsv(BINANCE_EARLY),
    )
    expect(format).toBe('binance_csv')
    expect(issues).toEqual([])
    expect(movements).toHaveLength(BINANCE_EARLY.length)
    expect(movements[0]).toEqual({
      lineNumber: 2,
      occurredAt: '2025-01-10T09:00:00Z',
      wallet: 'Spot',
      operation: 'Deposit',
      kind: 'deposit',
      known: true,
      asset: 'EUR',
      quantity: '500',
      eurCents: null,
      sourceRef: null,
    })
    expect(movements[3]).toMatchObject({
      operation: 'Transaction Fee',
      kind: 'fee',
      quantity: '-0.000004',
    })
  })

  it('maps every operation type of the export to a kind', () => {
    const { movements } = parseBinanceCsv(binanceCsv(BINANCE_EARLY))
    const kinds = Object.fromEntries(
      movements.map((movement) => [movement.operation, movement.kind]),
    )
    expect(kinds).toEqual({
      Deposit: 'deposit',
      'Transaction Spend': 'buy',
      'Transaction Buy': 'buy',
      'Transaction Fee': 'fee',
      'Binance Convert': 'convert',
      'Crypto Box': 'income',
      'Transfer Funds to Spot': 'transfer_internal',
      'Transaction Sold': 'sell',
      'Transaction Revenue': 'sell',
      Withdraw: 'withdrawal',
      'Mystery Bonus': 'other',
    })
    expect(movements.find((m) => m.operation === 'Mystery Bonus')).toMatchObject(
      { known: false, quantity: '0.00000001' },
    )
  })

  it('reads the English headers and other operation types', () => {
    const { movements, issues } = parseBinanceCsv(
      binanceCsv(
        [
          ['2024-06-01 00:00:00', 'Spot', 'Buy Crypto With Fiat', 'btc', '0.1'],
          ['2024-06-01 00:00:01', 'Funding', 'Transfer Funds to Funding Wallet', 'BTC', '0.1'],
          ['2024-06-02 00:00:00', 'Spot', 'Simple Earn Flexible Interest', 'USDC', '0.01'],
        ],
        { header: BINANCE_EN_HEADER, bom: false },
      ),
    )
    expect(issues).toEqual([])
    expect(movements.map((m) => [m.asset, m.kind])).toEqual([
      ['BTC', 'buy'],
      ['BTC', 'transfer_internal'],
      ['USDC', 'income'],
    ])
  })

  it('reports bad lines without their contents and keeps going', () => {
    const csv = binanceCsv([
      ['2025-02-30 10:00:00', 'Spot', 'Deposit', 'BTC', '1'],
      ['2025-01-01 10:00:00', 'Spot', 'Deposit', 'BTC', 'abc'],
      ['2025-01-01 10:00:00', 'Spot', 'Deposit', '', '1'],
      ['2025-01-01 10:00:00', 'Spot', '', 'BTC', '1'],
      ['2025-01-01 10:00:00', 'Spot', 'Deposit', 'BTC', '0.0000000000000000001'],
      ['2025-01-01 10:00:00', 'Spot', 'Deposit', 'BTC', '2'],
    ]).concat('100000001,2025-01-01 10:00:00\r\n')
    const { movements, issues } = parseBinanceCsv(csv)
    expect(movements).toHaveLength(1)
    expect(issues).toEqual([
      { lineNumber: 2, message: 'Date illisible' },
      { lineNumber: 3, message: 'Quantité illisible' },
      { lineNumber: 4, message: 'Actif illisible' },
      { lineNumber: 5, message: 'Opération manquante' },
      { lineNumber: 6, message: 'Quantité illisible' },
      { lineNumber: 8, message: 'Ligne incomplète' },
    ])
  })

  it('accepts two-digit years of older exports and skips blank lines', () => {
    const csv = binanceCsv([['21-03-15 10:00:00', 'Spot', 'Deposit', 'ETH', '1']])
    const { movements } = parseBinanceCsv(`${csv}\r\n,,,,,,\r\n`)
    expect(movements).toHaveLength(1)
    expect(movements[0].occurredAt).toBe('2021-03-15T10:00:00Z')
  })

  it('is detected from its headers', () => {
    const buffer = Buffer.from(binanceCsv(BINANCE_EARLY), 'utf8')
    expect(parseCryptoExport(buffer).format).toBe('binance_csv')
  })
})
