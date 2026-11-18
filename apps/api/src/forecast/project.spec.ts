import { describe, expect, it } from 'vitest'
import {
  averageDailyCents,
  buildProjection,
  estimateDays,
  type ExpectedItem,
  expectedOccurrences,
  type ForecastRecurringItem,
  projectionStart,
  spreadEstimate,
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
    endedOn: null,
    bookedDates: [],
    categoryName: null,
    categoryColor: null,
    ...overrides,
  }
}

const NOVEMBER = {
  today: '2026-11-06',
  start: '2026-11-06',
  monthEnd: '2026-11-30',
}
/** Data imported up to October 31, today November 16 (#215). */
const LAGGING = {
  today: '2026-11-16',
  start: '2026-11-01',
  monthEnd: '2026-11-30',
}
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

  describe('cancelled item (endedOn)', () => {
    const weekly = {
      cadence: 'weekly' as const,
      nextExpectedDate: '2026-11-09',
    }

    it('projects the occurrences before a future end date only', () => {
      expect(
        dates(
          expectedOccurrences(
            item({ ...weekly, endedOn: '2026-11-23' }),
            NOVEMBER,
            '2026-11-05',
          ),
        ),
      ).toEqual(['2026-11-09', '2026-11-16'])
    })

    it('expects nothing on the end date itself or after it', () => {
      expect(
        expectedOccurrences(
          item({ endedOn: '2026-11-20' }),
          NOVEMBER,
          '2026-11-05',
        ),
      ).toEqual([])
      expect(
        expectedOccurrences(
          item({ endedOn: '2026-10-15' }),
          NOVEMBER,
          '2026-11-05',
        ),
      ).toEqual([])
    })

    it('keeps an occurrence the day before the end', () => {
      expect(
        dates(
          expectedOccurrences(
            item({ endedOn: '2026-11-21' }),
            NOVEMBER,
            '2026-11-05',
          ),
        ),
      ).toEqual(['2026-11-20'])
    })

    it('still applies a late occurrence expected before the end', () => {
      // Expected October 30, data up to October 31, ended November 1.
      expect(
        expectedOccurrences(
          item({ nextExpectedDate: '2026-10-30', endedOn: '2026-11-01' }),
          LAGGING,
          '2026-10-31',
        ),
      ).toMatchObject([{ date: '2026-11-01', expectedDate: '2026-10-30' }])
    })
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
          { today: '2026-02-01', start: '2026-02-01', monthEnd: '2026-02-28' },
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

  it('applies late occurrences on the first projected day, drops missed ones', () => {
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
    // Projected from the day after the data: not imported yet, on its date.
    expect(
      expectedOccurrences(
        item({ nextExpectedDate: '2026-11-02' }),
        LAGGING,
        '2026-10-31',
      )[0],
    ).toMatchObject({ date: '2026-11-02', expectedDate: '2026-11-02' })
  })
})

describe('projectionStart', () => {
  it('starts the day after the known data, today at the latest', () => {
    expect(projectionStart('2026-11-16', '2026-10-31')).toBe('2026-11-01')
    expect(projectionStart('2026-11-16', '2026-11-15')).toBe('2026-11-16')
    expect(projectionStart('2026-11-16', '2026-11-16')).toBe('2026-11-16')
    expect(projectionStart('2026-11-16', null)).toBe('2026-11-16')
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

  it('puts each day after the known data on its own date', () => {
    const days = estimateDays(LAGGING, '2026-10-31')
    expect(days.size).toBe(30)
    expect([...days.values()].every((count) => count === 1)).toBe(true)
    expect(days.has('2026-10-31')).toBe(false)
  })
})

describe('spreadEstimate', () => {
  const days = estimateDays(LAGGING, '2026-10-31')

  it('applies the daily average on every estimated day', () => {
    const spread = spreadEstimate(days, 1_000, 0, LAGGING.today)
    expect(spread.coveredCents).toBe(0)
    expect(spread.byDate.get('2026-11-01')).toBe(1_000)
    expect([...spread.byDate.values()].reduce((a, b) => a + b, 0)).toBe(30_000)
  })

  it('lets spending entered by hand replace the elapsed days, earliest first', () => {
    const spread = spreadEstimate(days, 1_000, 2_500, LAGGING.today)
    expect(spread.coveredCents).toBe(2_500)
    expect(spread.byDate.get('2026-11-01')).toBe(0)
    expect(spread.byDate.get('2026-11-02')).toBe(0)
    expect(spread.byDate.get('2026-11-03')).toBe(500)
    expect(spread.byDate.get('2026-11-04')).toBe(1_000)
    expect([...spread.byDate.values()].reduce((a, b) => a + b, 0)).toBe(27_500)
  })

  it('never lets it cover the days after today', () => {
    // 16 elapsed days (November 1–16) at 10 €: at most 160 € covered.
    const spread = spreadEstimate(days, 1_000, 50_000, LAGGING.today)
    expect(spread.coveredCents).toBe(16_000)
    expect(spread.byDate.get('2026-11-16')).toBe(0)
    expect(spread.byDate.get('2026-11-17')).toBe(1_000)
    expect([...spread.byDate.values()].reduce((a, b) => a + b, 0)).toBe(14_000)
  })
})

describe('buildProjection', () => {
  const expected = (date: string, amountCents: number): ExpectedItem => ({
    ...expectedOccurrences(item({ nextExpectedDate: date }), NOVEMBER, null)[0],
    amountCents,
  })

  it('projects day by day, with the low point and the threshold crossing', () => {
    const window = {
      today: '2026-11-27',
      start: '2026-11-27',
      monthEnd: '2026-11-30',
    }
    const projection = buildProjection({
      window,
      startingBalanceCents: 50_000,
      items: [expected('2026-11-28', -80_000), expected('2026-11-30', 250_000)],
      estimateByDate: spreadEstimate(
        estimateDays(window, '2026-11-25'),
        1_000,
        0,
        window.today,
      ).byDate,
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
      window: {
        today: '2026-11-30',
        start: '2026-11-30',
        monthEnd: '2026-11-30',
      },
      startingBalanceCents: 10_000,
      items: [],
      estimateByDate: new Map(),
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
  it('projects from the day after the known data when imports lag', () => {
    const projection = buildProjection({
      window: LAGGING,
      startingBalanceCents: 100_000,
      items: expectedOccurrences(
        item({ nextExpectedDate: '2026-11-05', typicalAmountCents: 80_000 }),
        LAGGING,
        '2026-10-31',
      ),
      estimateByDate: spreadEstimate(
        estimateDays(LAGGING, '2026-10-31'),
        1_000,
        0,
        LAGGING.today,
      ).byDate,
      thresholdCents: 0,
    })
    expect(projection.points).toHaveLength(30)
    expect(projection.points[0]).toMatchObject({
      date: '2026-11-01',
      balanceCents: 99_000,
      estimateCents: -1_000,
    })
    expect(projection.points[4]).toMatchObject({
      date: '2026-11-05',
      balanceCents: 15_000,
    })
    expect(projection.endBalanceCents).toBe(100_000 - 80_000 - 30_000)
    expect(projection.estimateTotalCents).toBe(-30_000)
  })
})
