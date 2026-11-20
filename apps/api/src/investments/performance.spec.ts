import { describe, expect, it } from 'vitest'
import { daysBetween, oneYearBefore, parisToday } from './days'
import {
  computePerformance,
  type InvestedBase,
  investedAt,
  investedOn,
  type LinkedFlow,
  simpleReturn,
  type SnapshotPoint,
  takesInvestedBase,
  withInvested,
} from './performance'

const point = (
  date: string,
  valueCents: number,
  contributionsCents: number | null = null,
): SnapshotPoint => ({ date, valueCents, contributionsCents })

const flow = (date: string, amountCents: number | null): LinkedFlow => ({
  date,
  amountCents,
})

/** The figures of a non-crypto account by the one rule (#370). */
function perf(
  snapshots: SnapshotPoint[],
  type: Parameters<typeof computePerformance>[1],
  today: string,
  flows: LinkedFlow[] = [],
  base: InvestedBase | null = null,
) {
  return computePerformance(
    snapshots,
    type,
    today,
    investedOn(snapshots, base, flows),
    flows,
    base,
  )
}

/** What was invested at each value. */
function history(
  snapshots: SnapshotPoint[],
  flows: LinkedFlow[] = [],
  base: InvestedBase | null = null,
) {
  return withInvested(snapshots, investedOn(snapshots, base, flows)).map(
    (p) => p.contributionsCents,
  )
}

describe('days', () => {
  it('reads today in Europe/Paris', () => {
    // 23:30 UTC on 31 December is already 1 January in Paris.
    expect(parisToday(new Date('2025-12-31T23:30:00Z'))).toBe('2026-01-01')
    expect(parisToday(new Date('2026-07-01T21:59:00Z'))).toBe('2026-07-01')
  })

  it('counts calendar days across daylight saving changes', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
    expect(daysBetween('2026-01-01', '2025-12-31')).toBe(-1)
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366)
  })

  it('goes one year back, 29 February becoming 28 February', () => {
    expect(oneYearBefore('2026-09-30')).toBe('2025-09-30')
    expect(oneYearBefore('2024-02-29')).toBe('2023-02-28')
  })
})

describe('simpleReturn', () => {
  it('needs positive contributions', () => {
    expect(simpleReturn(1_000, 10_000)).toBe(0.1)
    expect(simpleReturn(1_000, 0)).toBeNull()
    expect(simpleReturn(1_000, -5)).toBeNull()
    expect(simpleReturn(null, 10_000)).toBeNull()
  })
})

describe('computePerformance', () => {
  it('has no figures without snapshots', () => {
    const result = perf([], 'brokerage', '2026-11-05')
    expect(result).toMatchObject({
      valueCents: null,
      gainCents: null,
      sincePrevious: null,
      daysSinceLatest: null,
      stale: false,
      staleAfterDays: 31,
    })
  })

  it('computes the gain and the simple return from the latest snapshot', () => {
    const result = perf(
      [
        point('2026-03-31', 1_000_000, 900_000),
        point('2026-06-30', 1_100_000, 950_000),
        point('2026-09-30', 1_200_000, 1_000_000),
      ],
      'brokerage',
      '2026-11-05',
    )
    expect(result).toMatchObject({
      valueCents: 1_200_000,
      valueDate: '2026-09-30',
      contributionsCents: 1_000_000,
      contributionsDate: '2026-09-30',
      contributionsSource: 'typed',
      gainCents: 200_000,
      returnRate: 0.2,
      daysSinceLatest: 36,
      stale: true,
    })
    expect(result.sincePrevious).toEqual({
      fromDate: '2026-06-30',
      fromValueCents: 1_100_000,
      changeCents: 100_000,
      changeRate: 100_000 / 1_100_000,
      contributionsChangeCents: 50_000,
    })
    // Nothing on or before 2025-09-30.
    expect(result.sinceOneYear).toBeNull()
  })

  it('counts from the latest value that has typed contributions', () => {
    const result = perf(
      [
        point('2024-12-31', 500_000, 450_000),
        point('2025-12-31', 520_000, 460_000),
        point('2026-06-30', 540_000),
      ],
      'life_insurance',
      '2026-11-05',
    )
    expect(result).toMatchObject({
      valueCents: 540_000,
      contributionsCents: 460_000,
      contributionsDate: '2025-12-31',
      gainCents: 80_000,
    })
    // The same amount at the next value: nothing paid in between.
    expect(result.sincePrevious?.contributionsChangeCents).toBe(0)
  })

  it('compares with the last snapshot on or before the same day a year earlier', () => {
    const snapshots = [
      point('2025-06-30', 100_000),
      point('2025-09-30', 110_000),
      point('2025-10-01', 111_000),
      point('2026-09-30', 150_000),
    ]
    const result = perf(snapshots, 'brokerage', '2026-10-01')
    expect(result.sinceOneYear).toMatchObject({
      fromDate: '2025-09-30',
      fromValueCents: 110_000,
      changeCents: 40_000,
    })
    expect(result.sincePrevious?.fromDate).toBe('2025-10-01')
  })

  it("takes a crypto account's invested amount from its replay", () => {
    const snapshots = [
      point('2026-11-04', 80_000),
      point('2026-11-05', 114_300),
    ]
    const result = computePerformance(
      snapshots,
      'crypto',
      '2026-11-05',
      (day) =>
        day >= '2026-11-05'
          ? {
              investedCents: 100_000,
              source: 'coins',
              since: null,
              linkedCount: 1,
              unknownCostCount: 0,
            }
          : null,
    )
    expect(result).toMatchObject({
      contributionsCents: 100_000,
      contributionsSource: 'coins',
      contributionsDate: '2026-11-05',
      gainCents: 14_300,
    })
  })

  it('has no change rate from a zero value', () => {
    const result = perf(
      [point('2026-01-01', 0), point('2026-02-01', 5_000)],
      'crypto',
      '2026-02-01',
    )
    expect(result.sincePrevious).toMatchObject({
      changeCents: 5_000,
      changeRate: null,
    })
  })

  it('flags values older than the rhythm of the account type', () => {
    const snapshots = [point('2026-10-13', 1_000)]
    for (const type of [
      'brokerage',
      'life_insurance',
      'employee_savings',
    ] as const) {
      // Updated once a month: due after 31 days.
      expect(perf(snapshots, type, '2026-11-13').stale).toBe(false)
      expect(perf(snapshots, type, '2026-11-14')).toMatchObject({
        daysSinceLatest: 32,
        stale: true,
      })
    }
    expect(perf(snapshots, 'crypto', '2026-11-14').stale).toBe(false)
  })
})

describe('investedAt: one invested amount per account (#370)', () => {
  const base = { cents: 10_000_00, on: '2026-06-30' }

  it('typed values only: the latest typed amount', () => {
    const typed = [
      point('2026-03-31', 0, 900_00),
      point('2026-05-31', 0, 950_00),
    ]
    expect(investedAt(typed, null, [], '2026-06-15')).toEqual({
      investedCents: 950_00,
      source: 'typed',
      since: '2026-05-31',
      linkedCount: 0,
      unknownCostCount: 0,
    })
    expect(investedAt(typed, null, [], '2026-03-30')).toBeNull()
  })

  it('base only: the base from its day', () => {
    expect(investedAt([], base, [], '2026-07-01')).toMatchObject({
      investedCents: 10_000_00,
      source: 'base',
      since: '2026-06-30',
    })
    expect(investedAt([], base, [], '2026-06-29')).toBeNull()
  })

  it('base + linked transfers: the transfers after its day add on top', () => {
    const flows = [
      flow('2026-06-30', 300_00),
      flow('2026-07-05', 300_00),
      flow('2026-08-05', -100_00),
    ]
    expect(investedAt([], base, flows, '2026-08-31')).toMatchObject({
      investedCents: 10_200_00,
      source: 'base',
      linkedCount: 2,
    })
  })

  it('typed value + linked transfers: the transfers after the typed value', () => {
    const typed = [point('2026-01-31', 0, 900_00)]
    const flows = [flow('2026-01-10', 400_00), flow('2026-02-10', 500_00)]
    expect(investedAt(typed, null, flows, '2026-03-01')).toMatchObject({
      investedCents: 1_400_00,
      source: 'typed',
      since: '2026-01-31',
      linkedCount: 1,
    })
  })

  it('linked transfers only: their sum so far', () => {
    const flows = [flow('2026-01-10', 400_00), flow('2026-02-10', 500_00)]
    expect(investedAt([], null, flows, '2026-01-31')).toMatchObject({
      investedCents: 400_00,
      source: 'links',
      since: null,
    })
  })

  it('whichever typed point is later wins, the base on the same day', () => {
    const later = [point('2026-07-31', 0, 8_500_00)]
    expect(investedAt(later, base, [], '2026-08-01')).toMatchObject({
      investedCents: 8_500_00,
      source: 'typed',
    })
    const sameDay = [point('2026-06-30', 0, 8_500_00)]
    expect(investedAt(sameDay, base, [], '2026-08-01')).toMatchObject({
      investedCents: 10_000_00,
      source: 'base',
    })
  })

  it('leaves a transfer of unknown amount out and counts it', () => {
    expect(
      investedAt(
        [],
        base,
        [flow('2026-07-10', 400_00), flow('2026-07-20', null)],
        '2026-08-31',
      ),
    ).toMatchObject({
      investedCents: 10_400_00,
      linkedCount: 1,
      unknownCostCount: 1,
    })
  })

  it('has nothing to say without a typed point or a link', () => {
    expect(investedAt([], null, [], '2026-08-31')).toBeNull()
  })

  it('keeps crypto accounts and cash out of the invested base', () => {
    expect(takesInvestedBase({ type: 'crypto' })).toBe(false)
    expect(takesInvestedBase({ type: 'checking' })).toBe(false)
    expect(takesInvestedBase({ type: 'brokerage' })).toBe(true)
  })
})

describe('the figures of a PEA (#360, #370)', () => {
  const base = { cents: 10_000_00, on: '2026-06-30' }

  it('the base counts from its day, a value typed later wins', () => {
    const snapshots = [
      point('2026-05-31', 9_000_00, 8_000_00),
      point('2026-07-15', 11_000_00),
      point('2026-07-31', 11_500_00, 8_500_00),
    ]
    const result = perf(snapshots, 'brokerage', '2026-08-01', [], base)
    expect(result).toMatchObject({
      contributionsCents: 8_500_00,
      contributionsSource: 'typed',
      gainCents: 3_000_00,
    })
    expect(history(snapshots, [], base)).toEqual([
      8_000_00, 10_000_00, 8_500_00,
    ])
  })

  it('adds the transfers linked after its day', () => {
    const flows = [
      flow('2026-06-05', 300_00),
      flow('2026-07-05', 300_00),
      flow('2026-08-05', 300_00),
    ]
    const snapshots = [
      point('2026-05-31', 9_000_00, 8_000_00),
      point('2026-07-31', 11_500_00),
      point('2026-08-31', 12_000_00),
    ]
    const result = perf(snapshots, 'brokerage', '2026-09-01', flows, base)
    expect(result).toMatchObject({
      contributionsCents: 10_600_00,
      contributionsSource: 'base',
      linkedTransfersCount: 2,
      gainCents: 1_400_00,
      linkedAfterValueCents: 0,
    })
    // Before its day, the typed amount and the transfers since.
    expect(history(snapshots, flows, base)).toEqual([
      8_000_00, 10_300_00, 10_600_00,
    ])
  })

  it('keeps the transfers after the latest value out of the gain', () => {
    const snapshots = [point('2026-03-31', 1_050_00)]
    const flows = [flow('2026-03-01', 1_000_00), flow('2026-04-02', 300_00)]
    const result = perf(snapshots, 'life_insurance', '2026-04-05', flows)
    expect(result).toMatchObject({
      contributionsCents: 1_000_00,
      contributionsSource: 'links',
      gainCents: 50_00,
      linkedAfterValueCents: 300_00,
    })
  })

  it('counts a base dated after the latest value', () => {
    const result = perf(
      [point('2026-10-31', 12_000_00)],
      'life_insurance',
      '2026-11-20',
      [],
      { cents: 11_000_00, on: '2026-11-20' },
    )
    expect(result).toMatchObject({
      contributionsCents: 11_000_00,
      contributionsDate: '2026-11-20',
      contributionsSource: 'base',
      gainCents: 1_000_00,
    })
  })
})
