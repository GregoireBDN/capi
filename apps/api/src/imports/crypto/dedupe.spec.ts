import { describe, expect, it } from 'vitest'
import type { ParsedMovement } from './crypto-import.types'
import { computeMovementHashes } from './dedupe'

const movement = (patch: Partial<ParsedMovement> = {}): ParsedMovement => ({
  lineNumber: 2,
  occurredAt: '2025-01-10T09:05:00Z',
  wallet: 'Spot',
  operation: 'Transaction Fee',
  kind: 'fee',
  known: true,
  asset: 'BTC',
  quantity: '-0.000004',
  eurCents: null,
  sourceRef: null,
  ...patch,
})

describe('computeMovementHashes', () => {
  it('keeps identical lines of the same second apart', () => {
    const [a, b] = computeMovementHashes('binance_csv', [
      movement(),
      movement({ lineNumber: 3 }),
    ])
    expect(a).not.toBe(b)
  })

  it('gives a re-imported or overlapping file the same hashes', () => {
    const first = computeMovementHashes('binance_csv', [
      movement({ occurredAt: '2025-01-09T00:00:00Z' }),
      movement(),
      movement(),
    ])
    const overlapping = computeMovementHashes('binance_csv', [
      movement({ lineNumber: 40 }),
      movement({ lineNumber: 41 }),
      movement({ lineNumber: 42, occurredAt: '2025-01-11T00:00:00Z' }),
    ])
    expect(overlapping.slice(0, 2)).toEqual(first.slice(1))
  })

  it('ignores line numbers, EUR amounts and references', () => {
    const [a] = computeMovementHashes('coinbase_csv', [movement()])
    const [b] = computeMovementHashes('coinbase_csv', [
      movement({ lineNumber: 99, eurCents: 12, sourceRef: 'x' }),
    ])
    expect(a).toBe(b)
  })

  it('tells apart every field that identifies a line', () => {
    const base = computeMovementHashes('binance_csv', [movement()])[0]
    const variants: Partial<ParsedMovement>[] = [
      { occurredAt: '2025-01-10T09:05:01Z' },
      { wallet: 'Funding' },
      { wallet: null },
      { operation: 'Transaction Buy' },
      { asset: 'ETH' },
      { quantity: '-0.000005' },
    ]
    for (const patch of variants) {
      expect(computeMovementHashes('binance_csv', [movement(patch)])[0]).not.toBe(
        base,
      )
    }
    expect(computeMovementHashes('coinbase_csv', [movement()])[0]).not.toBe(base)
  })
})
