import { describe, expect, it } from 'vitest'
import { type ExpectedSeries, expectedByCategory } from './expected'

/** Synthetic series only. */
function series(overrides: Partial<ExpectedSeries> = {}): ExpectedSeries {
  return {
    id: 'item',
    accountId: 'checking',
    name: 'Test series',
    direction: 'debit',
    status: 'confirmed',
    active: true,
    cadence: 'monthly',
    amountType: 'fixed',
    isFixedCost: true,
    typicalAmountCents: 80_000,
    nextExpectedDate: '2026-11-05',
    endedOn: null,
    categoryId: 'rent',
    categoryName: 'Test rent',
    categoryColor: null,
    occurrences: [{ date: '2026-10-05' }],
    ...overrides,
  }
}

const HORIZONS = new Map([['checking', '2026-11-03']])

describe('expectedByCategory', () => {
  it('sums the occurrences still expected in the month, per category', () => {
    const result = expectedByCategory(
      [
        series(),
        // Weekly: the 6th, 13th, 20th and 27th.
        series({
          id: 'weekly',
          cadence: 'weekly',
          typicalAmountCents: 1_000,
          nextExpectedDate: '2026-11-06',
          occurrences: [{ date: '2026-10-30' }],
          categoryId: null,
        }),
      ],
      '2026-11',
      HORIZONS,
    )
    expect(result).toEqual(
      new Map([
        ['rent', 80_000],
        [null, 4_000],
      ]),
    )
  })

  it('stops at the cancellation date', () => {
    const weekly = {
      cadence: 'weekly' as const,
      typicalAmountCents: 1_000,
      nextExpectedDate: '2026-11-06',
      occurrences: [{ date: '2026-10-30' }],
    }
    const result = expectedByCategory(
      [
        // The 6th and 13th, not the 20th (end date) or the 27th.
        series({ ...weekly, id: 'weekly', endedOn: '2026-11-20' }),
        series({ id: 'ended', endedOn: '2026-11-01' }),
      ],
      '2026-11',
      HORIZONS,
    )
    expect(result).toEqual(new Map([['rent', 2_000]]))
  })

  it('leaves out credits, unconfirmed, inactive and booked series', () => {
    const result = expectedByCategory(
      [
        series({ id: 'salary', direction: 'credit' }),
        series({ id: 'suggested', status: 'suggested' }),
        series({ id: 'stale', active: false }),
        // Paid on the 2nd, two days ahead of the 4th.
        series({
          id: 'booked',
          nextExpectedDate: '2026-11-04',
          occurrences: [{ date: '2026-11-02' }],
        }),
      ],
      '2026-11',
      HORIZONS,
    )
    expect(result.size).toBe(0)
  })

  it('skips a missed occurrence but expects the next one', () => {
    // Expected on 20 Oct, the data reaches 3 Nov without it: only 20 Nov.
    const result = expectedByCategory(
      [series({ nextExpectedDate: '2026-10-20' })],
      '2026-11',
      HORIZONS,
    )
    expect(result).toEqual(new Map([['rent', 80_000]]))
  })

  it('leaves a late occurrence of the month before to that month', () => {
    const result = expectedByCategory(
      [series({ nextExpectedDate: '2026-10-31' })],
      '2026-11',
      new Map([['checking', '2026-11-01']]),
    )
    // 31 Oct is late, not a November cost; the next one is 30 Nov.
    expect(result).toEqual(new Map([['rent', 80_000]]))
  })

  it('expects everything of an account without data', () => {
    const result = expectedByCategory(
      [series({ accountId: 'new' })],
      '2026-11',
      HORIZONS,
    )
    expect(result).toEqual(new Map([['rent', 80_000]]))
  })
})
