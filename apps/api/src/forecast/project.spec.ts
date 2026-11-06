import { describe, expect, it } from 'vitest'
import {
  averageDailyCents,
  buildProjection,
  estimateDays,
  type ExpectedItem,
  expectedOccurrences,
  type ForecastRecurringItem,
} from './project'

/** Synthetic data only. */
function item(
  overrides: Partial<ForecastRecurringItem> = {},
): ForecastRecurringItem {
  return {
    id: 'item-1',
    accountId: 'account-1',
    name: 'Abonnement test',
    direction: 'debit',
    cadence: 'monthly',
    amountType: 'fixed',
    isFixedCost: true,
    typicalAmountCents: 1_299,
    nextExpectedDate: '2026-11-20',
    bookedDates: [],
    categoryName: null,
    categoryColor: null,
    ...overrides,
  }
}

const NOVEMBER = { today: '2026-11-06', monthEnd: '2026-11-30' }
const dates = (items: ExpectedItem[]) => items.map((i) => i.date)

describe('expectedOccurrences', () => {
  it('yields the next monthly occurrence with a signed amount', () => {
    const [occurrence, ...rest] = expectedOccurrences(
      item(),
      NOVEMBER,
      '2026-11-05',
    )
    expect(rest).toEqual([])
    expect(occurrence).toMatchObject({
      date: '2026-11-20',
      expectedDate: '2026-11-20',
      amountCents: -1_299,
      direction: 'debit',
    })
    expect(
      expectedOccurrences(
        item({ direction: 'credit', typicalAmountCents: 250_000 }),
        NOVEMBER,
        '2026-11-05',
      )[0].amountCents,
    ).toBe(250_000)
  })

  it('keeps month-end dates at month end, February included', () => {
    expect(
      dates(
        expectedOccurrences(
          item({ nextExpectedDate: '2026-11-30' }),
          NOVEMBER,
          '2026-11-05',
        ),
      ),
    ).toEqual(['2026-11-30'])
    // A late January 31 occurrence, then February's last day.
    expect(
      dates(
        expectedOccurrences(
          item({ nextExpectedDate: '2026-01-31' }),
          { today: '2026-02-01', monthEnd: '2026-02-28' },
          '2026-01-30',
        ),
      ),
    ).toEqual(['2026-02-01', '2026-02-28'])
  })

  it('repeats weekly items until month end, and nothing after it', () => {
    expect(
      dates(
        expectedOccurrences(
          item({ cadence: 'weekly', nextExpectedDate: '2026-11-09' }),
          NOVEMBER,
          '2026-11-05',
        ),
      ),
    ).toEqual(['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
    expect(
      expectedOccurrences(
        item({ nextExpectedDate: '2026-12-01' }),
        NOVEMBER,
        '2026-11-05',
      ),
    ).toEqual([])
    expect(
      expectedOccurrences(
        item({ nextExpectedDate: null }),
        NOVEMBER,
        '2026-11-05',
      ),
    ).toEqual([])
  })

  it('skips an occurrence already booked within the tolerance', () => {
    expect(
      expectedOccurrences(
        item({ nextExpectedDate: '2026-11-08', bookedDates: ['2026-11-04'] }),
        NOVEMBER,
        '2026-11-05',
      ),
    ).toEqual([])
    // Five days off a monthly date is another cycle.
    expect(
      expectedOccurrences(
        item({ nextExpectedDate: '2026-11-09', bookedDates: ['2026-11-04'] }),
        NOVEMBER,
        '2026-11-05',
      ),
    ).toHaveLength(1)
  })

  it('applies late or not-yet-imported occurrences today, drops missed ones', () => {
    // Expected on the 3rd, data up to the 5th: still within 4 days.
    expect(
      expectedOccurrences(
        item({ nextExpectedDate: '2026-11-03' }),
        NOVEMBER,
        '2026-11-05',
      )[0],
    ).toMatchObject({ date: '2026-11-06', expectedDate: '2026-11-03' })
    // Expected on the 2nd, data only up to October 31: not imported yet.
    expect(
      dates(
        expectedOccurrences(
          item({ nextExpectedDate: '2026-11-02' }),
          NOVEMBER,
          '2026-10-31',
        ),
      ),
    ).toEqual(['2026-11-06'])
    // Expected on October 25, data up to November 5 without it: missed,
    // the next cycle still counts.
    expect(
      dates(
        expectedOccurrences(
          item({ nextExpectedDate: '2026-10-25' }),
          NOVEMBER,
          '2026-11-05',
        ),
      ),
    ).toEqual(['2026-11-25'])
    // Without any data, every occurrence counts.
    expect(
      dates(
        expectedOccurrences(
          item({ nextExpectedDate: '2026-10-25' }),
          NOVEMBER,
          null,
        ),
      ),
    ).toEqual(['2026-11-06', '2026-11-25'])
  })
})

describe('averageDailyCents', () => {
  it('divides by the days of the period, never below zero', () => {
    expect(averageDailyCents(92_000, '2026-07-01', '2026-09-30')).toBe(1_000)
    expect(averageDailyCents(100, '2026-09-01', '2026-09-30')).toBe(3)
    expect(averageDailyCents(-5_000, '2026-09-01', '2026-09-30')).toBe(0)
    expect(averageDailyCents(100, '2026-10-01', '2026-09-30')).toBeNull()
  })
})

describe('estimateDays', () => {
  it('counts the days after the balance date, the past ones on today', () => {
    const days = estimateDays(NOVEMBER, '2026-11-03')
    expect(days.get('2026-11-06')).toBe(3)
    expect(days.get('2026-11-07')).toBe(1)
    expect(days.has('2026-11-05')).toBe(false)
    expect([...days.values()].reduce((a, b) => a + b, 0)).toBe(27)
    expect(estimateDays(NOVEMBER, '2026-11-06').has('2026-11-06')).toBe(false)
    expect(estimateDays(NOVEMBER, null).get('2026-11-06')).toBe(1)
  })
})

describe('buildProjection', () => {
  const expected = (date: string, amountCents: number): ExpectedItem => ({
    ...expectedOccurrences(item({ nextExpectedDate: date }), NOVEMBER, null)[0],
    amountCents,
  })

  it('projects day by day, with the low point and the threshold crossing', () => {
    const projection = buildProjection({
      window: { today: '2026-11-27', monthEnd: '2026-11-30' },
      startingBalanceCents: 50_000,
      items: [expected('2026-11-28', -80_000), expected('2026-11-30', 250_000)],
      dailyEstimateCents: 1_000,
      estimateDaysByDate: estimateDays(
        { today: '2026-11-27', monthEnd: '2026-11-30' },
        '2026-11-25',
      ),
      thresholdCents: 0,
    })
    expect(
      projection.points.map((p) => [p.date, p.balanceCents, p.estimateCents]),
    ).toEqual([
      ['2026-11-27', 48_000, -2_000],
      ['2026-11-28', -33_000, -1_000],
      ['2026-11-29', -34_000, -1_000],
      ['2026-11-30', 215_000, -1_000],
    ])
    expect(projection.points[1].items).toHaveLength(1)
    expect(projection.endBalanceCents).toBe(215_000)
    expect(projection.lowest).toEqual({
      date: '2026-11-29',
      balanceCents: -34_000,
    })
    expect(projection.belowThreshold).toEqual({
      date: '2026-11-28',
      balanceCents: -33_000,
    })
    expect(projection.estimateTotalCents).toBe(-5_000)
  })

  it('has one point on the last day and no crossing above the threshold', () => {
    const projection = buildProjection({
      window: { today: '2026-11-30', monthEnd: '2026-11-30' },
      startingBalanceCents: 10_000,
      items: [],
      dailyEstimateCents: null,
      estimateDaysByDate: new Map(),
      thresholdCents: 10_000,
    })
    expect(projection.points).toEqual([
      { date: '2026-11-30', balanceCents: 10_000, items: [], estimateCents: 0 },
    ])
    // Exactly at the threshold is not under it.
    expect(projection.belowThreshold).toBeNull()
    expect(projection.lowest).toEqual({
      date: '2026-11-30',
      balanceCents: 10_000,
    })
  })
})
