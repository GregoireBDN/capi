import { describe, expect, it } from 'vitest'
import { balanceChainGaps } from './balance-chain'

describe('balanceChainGaps', () => {
  const row = (
    bookingDate: string,
    amountCents: number,
    balanceAfterCents: number | null,
  ) => ({ bookingDate, amountCents, balanceAfterCents })

  it('finds nothing when every balance follows', () => {
    expect(
      balanceChainGaps(
        [
          row('2026-09-30', 0, 10_000),
          row('2026-10-02', -1_000, null),
          row('2026-10-05', -500, 8_500),
        ],
        [{ date: '2026-10-31', valueCents: 8_500 }],
        '2026-10-01',
      ),
    ).toEqual([])
  })

  it('reports the day the running balance stops following', () => {
    expect(
      balanceChainGaps(
        [
          row('2026-09-30', 0, 10_000),
          row('2026-10-05', -1_000, 9_000),
          // A missing 500 € debit between the 5th and the 10th.
          row('2026-10-10', -500, 8_000),
        ],
        [],
        '2026-10-01',
      ),
    ).toEqual([
      {
        date: '2026-10-10',
        fromDate: '2026-10-05',
        source: 'running',
        differenceCents: -500,
      },
    ])
  })

  it('compares a statement with the balance recomputed up to it', () => {
    expect(
      balanceChainGaps(
        [row('2026-10-01', 0, 10_000), row('2026-10-15', -2_000, null)],
        [{ date: '2026-10-31', valueCents: 7_000 }],
        '2026-10-01',
      ),
    ).toEqual([
      {
        date: '2026-10-31',
        fromDate: '2026-10-01',
        source: 'statement',
        differenceCents: -1_000,
      },
    ])
  })

  it('compares a statement with the running balance of its day', () => {
    expect(
      balanceChainGaps(
        [row('2026-10-31', -100, 4_900)],
        [{ date: '2026-10-31', valueCents: 5_000 }],
        '2026-10-01',
      ),
    ).toEqual([
      {
        date: '2026-10-31',
        fromDate: '2026-10-31',
        source: 'statement',
        differenceCents: 100,
      },
    ])
  })

  it('reports nothing before `from` and restarts after an ambiguous day', () => {
    expect(
      balanceChainGaps(
        [
          row('2026-09-01', 0, 10_000),
          // A gap in September: the month before only opens the chain.
          row('2026-09-15', -100, 5_000),
          // Two rows that don't chain: no end-of-day balance.
          row('2026-10-03', -100, 4_900),
          row('2026-10-03', -100, 3_000),
          row('2026-10-04', -100, 1_000),
        ],
        [],
        '2026-10-01',
      ),
    ).toEqual([])
  })
})
