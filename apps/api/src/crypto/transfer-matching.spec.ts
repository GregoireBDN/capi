import { describe, expect, it } from 'vitest'
import { toUnits } from './cost-basis'
import { type MatchCandidate, matchTransfers } from './transfer-matching'

/** Synthetic movements only. */

const day = (d: number, hour = 12) =>
  Date.parse(
    `2026-03-${String(d).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`,
  )

function candidate(
  id: string,
  accountId: string,
  kind: MatchCandidate['kind'],
  quantity: string,
  at: number,
  observedSince: number | null = null,
  extra: Partial<MatchCandidate> = {},
): MatchCandidate {
  return {
    id,
    accountId,
    kind,
    assetId: 'bitcoin',
    quantity: toUnits(quantity),
    at,
    observedSince,
    counterpartAccountId: null,
    ...extra,
  }
}

describe('matchTransfers (#373)', () => {
  it('links an exchange withdrawal to the arrival a later read saw, the fee aside', () => {
    expect(
      matchTransfers([
        candidate('w', 'coinbase', 'withdrawal', '0.5', day(10)),
        candidate('a', 'ledger', 'observed_in', '0.4999', day(12), day(9)),
      ]),
    ).toEqual([{ outId: 'w', inId: 'a' }])
  })

  it('links a wallet departure to the exchange deposit it became', () => {
    expect(
      matchTransfers([
        candidate('d', 'ledger', 'observed_out', '0.2', day(20), day(10)),
        candidate('b', 'binance', 'deposit', '0.1998', day(15)),
      ]),
    ).toEqual([{ outId: 'd', inId: 'b' }])
  })

  it('two wallets hold BTC: the quantity and the date tell which one received it', () => {
    expect(
      matchTransfers([
        candidate('w', 'coinbase', 'withdrawal', '0.5', day(10)),
        candidate('a', 'ledger', 'observed_in', '0.4999', day(11), day(9)),
        candidate('b', 'trezor', 'observed_in', '0.3', day(11), day(9)),
        candidate('c', 'trezor', 'observed_in', '0.5', day(2), day(1)),
      ]),
    ).toEqual([{ outId: 'w', inId: 'a' }])
  })

  it('a tie links nothing: the owner chooses', () => {
    expect(
      matchTransfers([
        candidate('w', 'coinbase', 'withdrawal', '0.5', day(10)),
        candidate('a', 'ledger', 'observed_in', '0.4999', day(11), day(9)),
        candidate('b', 'trezor', 'observed_in', '0.4999', day(11), day(9)),
      ]),
    ).toEqual([])
    // Two withdrawals for one arrival: no more.
    expect(
      matchTransfers([
        candidate('w1', 'coinbase', 'withdrawal', '0.5', day(10)),
        candidate('w2', 'binance', 'withdrawal', '0.5', day(10, 14)),
        candidate('a', 'ledger', 'observed_in', '0.4999', day(11), day(9)),
      ]),
    ).toEqual([])
  })

  it('never links more than was sent, beyond the fee, too late, or before it left', () => {
    const w = candidate('w', 'coinbase', 'withdrawal', '0.5', day(10))
    for (const arrival of [
      candidate('a', 'ledger', 'observed_in', '0.51', day(11), day(9)),
      candidate('a', 'ledger', 'observed_in', '0.4', day(11), day(9)),
      candidate('a', 'ledger', 'observed_in', '0.5', day(20), day(14)),
      candidate('a', 'ledger', 'observed_in', '0.5', day(9), day(8)),
      candidate('a', 'coinbase', 'observed_in', '0.5', day(11), day(9)),
      candidate('a', 'ledger', 'observed_in', '0.5', day(11), day(9), {
        assetId: 'ethereum',
      }),
    ]) {
      expect(matchTransfers([w, arrival])).toEqual([])
    }
  })

  it('follows the account the owner named on the withdrawal', () => {
    expect(
      matchTransfers([
        candidate('w', 'coinbase', 'withdrawal', '0.5', day(10), null, {
          counterpartAccountId: 'trezor',
        }),
        candidate('a', 'ledger', 'observed_in', '0.5', day(11), day(9)),
        candidate('b', 'trezor', 'observed_in', '0.5', day(11), day(9)),
      ]),
    ).toEqual([{ outId: 'w', inId: 'b' }])
  })
})

describe('matchTransfers by transaction hash (#426)', () => {
  const hash = (seed: string) => seed.repeat(64).slice(0, 64)

  it('links the two sides of one hash, even where the rules would tie', () => {
    expect(
      matchTransfers([
        candidate('w1', 'coinbase', 'withdrawal', '0.5', day(10), null, {
          txHashDigest: hash('a'),
        }),
        candidate('w2', 'binance', 'withdrawal', '0.5', day(10)),
        candidate('d', 'ledger', 'deposit', '0.4999', day(10, 13), null, {
          txHashDigest: hash('a'),
        }),
      ]),
    ).toEqual([{ outId: 'w1', inId: 'd' }])
  })

  it('links one hash beyond the window and the fee', () => {
    expect(
      matchTransfers([
        candidate('w', 'coinbase', 'withdrawal', '0.5', day(1), null, {
          txHashDigest: hash('b'),
        }),
        candidate('d', 'ledger', 'deposit', '0.3', day(20), null, {
          txHashDigest: hash('b'),
        }),
      ]),
    ).toEqual([{ outId: 'w', inId: 'd' }])
  })

  it('never links two different hashes, and falls back to the rules when one side has none', () => {
    expect(
      matchTransfers([
        candidate('w', 'coinbase', 'withdrawal', '0.5', day(10), null, {
          txHashDigest: hash('c'),
        }),
        candidate('d', 'ledger', 'deposit', '0.4999', day(10, 13), null, {
          txHashDigest: hash('d'),
        }),
      ]),
    ).toEqual([])
    expect(
      matchTransfers([
        candidate('w', 'coinbase', 'withdrawal', '0.5', day(10)),
        candidate('d', 'ledger', 'deposit', '0.4999', day(10, 13), null, {
          txHashDigest: hash('e'),
        }),
      ]),
    ).toEqual([{ outId: 'w', inId: 'd' }])
  })
})
