import { describe, expect, it } from 'vitest'
import { balanceHistory } from './balance-history'

// Synthetic amounts only.
describe('balanceHistory', () => {
  it('chains running balances and carries the last balance on empty days', () => {
    const points = balanceHistory(
      [
        { date: '2026-03-02', amountCents: -1_000, balanceAfterCents: 9_000 },
        { date: '2026-03-04', amountCents: 2_500, balanceAfterCents: 11_500 },
      ],
      [],
      '2026-03-01',
      '2026-03-05',
    )
    expect(points).toEqual([
      { date: '2026-03-02', balanceCents: 9_000 },
      { date: '2026-03-03', balanceCents: 9_000 },
      { date: '2026-03-04', balanceCents: 11_500 },
      { date: '2026-03-05', balanceCents: 11_500 },
    ])
  })

  it('anchors on the running balance before the window', () => {
    const points = balanceHistory(
      [
        { date: '2026-01-10', amountCents: -500, balanceAfterCents: 4_500 },
        { date: '2026-02-03', amountCents: -200, balanceAfterCents: 4_300 },
      ],
      [],
      '2026-02-01',
      '2026-02-03',
    )
    expect(points.map((p) => p.balanceCents)).toEqual([4_500, 4_500, 4_300])
  })

  it('adds rows without a balance after the anchor, never before it', () => {
    const points = balanceHistory(
      [
        // Hand-entered before the anchor: the bank balance already says it.
        { date: '2026-03-01', amountCents: -700, balanceAfterCents: null },
        { date: '2026-03-02', amountCents: -1_000, balanceAfterCents: 9_000 },
        // Hand-entered on the anchor day: not added either.
        { date: '2026-03-02', amountCents: -300, balanceAfterCents: null },
        // Hand-entered after it: counts.
        { date: '2026-03-03', amountCents: -400, balanceAfterCents: null },
      ],
      [],
      '2026-03-01',
      '2026-03-03',
    )
    expect(points).toEqual([
      { date: '2026-03-01', balanceCents: -700 },
      { date: '2026-03-02', balanceCents: 9_000 },
      { date: '2026-03-03', balanceCents: 8_600 },
    ])
  })

  it('prefers a statement balance on the same day and adds later rows', () => {
    const points = balanceHistory(
      [
        { date: '2026-03-02', amountCents: -1_000, balanceAfterCents: 9_000 },
        { date: '2026-03-03', amountCents: -100, balanceAfterCents: null },
      ],
      [{ date: '2026-03-02', valueCents: 20_000 }],
      '2026-03-02',
      '2026-03-03',
    )
    expect(points.map((p) => p.balanceCents)).toEqual([20_000, 19_900])
  })

  it('sums the amounts when nothing anchors the balance', () => {
    const points = balanceHistory(
      [
        { date: '2026-03-01', amountCents: 5_000, balanceAfterCents: null },
        { date: '2026-03-02', amountCents: -1_500, balanceAfterCents: null },
      ],
      [],
      '2026-03-01',
      '2026-03-02',
    )
    expect(points.map((p) => p.balanceCents)).toEqual([5_000, 3_500])
  })

  it('keeps the previous anchor when a day does not chain', () => {
    const points = balanceHistory(
      [
        { date: '2026-03-01', amountCents: -100, balanceAfterCents: 900 },
        // Two rows that do not chain with each other.
        { date: '2026-03-02', amountCents: -10, balanceAfterCents: 500 },
        { date: '2026-03-02', amountCents: -20, balanceAfterCents: 600 },
      ],
      [],
      '2026-03-01',
      '2026-03-02',
    )
    expect(points.map((p) => p.balanceCents)).toEqual([900, 870])
  })

  it('has no point before the first data', () => {
    expect(balanceHistory([], [], '2026-03-01', '2026-03-03')).toEqual([])
  })
})
