import { describe, expect, it } from 'vitest'
import { storedContinuityGaps } from './stored-continuity'

/** Synthetic amounts only. */
describe('storedContinuityGaps', () => {
  it('finds nothing when the balances follow, rows without balance included', () => {
    expect(
      storedContinuityGaps(
        [
          {
            bookingDate: '2026-09-30',
            amountCents: 0,
            balanceAfterCents: 10_000,
          },
          {
            bookingDate: '2026-10-02',
            amountCents: -1_000,
            balanceAfterCents: null,
          },
          {
            bookingDate: '2026-10-03',
            amountCents: -500,
            balanceAfterCents: 8_500,
          },
        ],
        '2026-10-01',
      ),
    ).toEqual([])
  })

  it('reports a gap once and resynchronizes on the bank balance', () => {
    expect(
      storedContinuityGaps(
        [
          {
            bookingDate: '2026-10-01',
            amountCents: -1_000,
            balanceAfterCents: 9_000,
          },
          {
            bookingDate: '2026-10-04',
            amountCents: -1_000,
            balanceAfterCents: 7_000,
          },
          {
            bookingDate: '2026-10-05',
            amountCents: -1_000,
            balanceAfterCents: 6_000,
          },
        ],
        '2026-10-01',
      ),
    ).toEqual([
      { fromDate: '2026-10-01', toDate: '2026-10-04', differenceCents: -1_000 },
    ])
  })

  it('reads the end of a day with several rows, whatever their order', () => {
    expect(
      storedContinuityGaps(
        [
          {
            bookingDate: '2026-10-01',
            amountCents: 0,
            balanceAfterCents: 10_000,
          },
          {
            bookingDate: '2026-10-02',
            amountCents: -300,
            balanceAfterCents: 9_500,
          },
          {
            bookingDate: '2026-10-02',
            amountCents: -200,
            balanceAfterCents: 9_800,
          },
        ],
        '2026-10-01',
      ),
    ).toEqual([])
  })

  it('ignores gaps before the month', () => {
    expect(
      storedContinuityGaps(
        [
          {
            bookingDate: '2026-09-01',
            amountCents: 0,
            balanceAfterCents: 10_000,
          },
          {
            bookingDate: '2026-09-20',
            amountCents: 0,
            balanceAfterCents: 12_000,
          },
          {
            bookingDate: '2026-10-02',
            amountCents: -2_000,
            balanceAfterCents: 10_000,
          },
        ],
        '2026-10-01',
      ),
    ).toEqual([])
  })
})
