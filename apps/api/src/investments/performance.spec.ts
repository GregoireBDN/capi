import { describe, expect, it } from 'vitest'
import { daysBetween, oneYearBefore, parisToday } from './days'
import {
  computePerformance,
  linkedContributions,
  simpleReturn,
  type SnapshotPoint,
} from './performance'

const point = (
  date: string,
  valueCents: number,
  contributionsCents: number | null = null,
): SnapshotPoint => ({ date, valueCents, contributionsCents })

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
    const result = computePerformance([], 'brokerage', '2026-11-05')
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
    const result = computePerformance(
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

  it('falls back on the latest snapshot that has contributions', () => {
    const result = computePerformance(
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
    expect(result.sincePrevious?.contributionsChangeCents).toBeNull()
  })

  it('compares with the last snapshot on or before the same day a year earlier', () => {
    const snapshots = [
      point('2025-06-30', 100_000),
      point('2025-09-30', 110_000),
      point('2025-10-01', 111_000),
      point('2026-09-30', 150_000),
    ]
    const result = computePerformance(snapshots, 'brokerage', '2026-10-01')
    expect(result.sinceOneYear).toMatchObject({
      fromDate: '2025-09-30',
      fromValueCents: 110_000,
      changeCents: 40_000,
    })
    expect(result.sincePrevious?.fromDate).toBe('2025-10-01')
  })

  it('only trusts the latest contributions of a crypto account', () => {
    const snapshots = [
      { ...point('2026-11-04', 80_000), contributionsCents: 40_000 },
      point('2026-11-05', 114_300),
    ]
    expect(computePerformance(snapshots, 'crypto', '2026-11-05')).toMatchObject(
      { contributionsCents: null, gainCents: null, returnRate: null },
    )
    // Statement-based accounts keep the latest known contributions.
    expect(
      computePerformance(snapshots, 'brokerage', '2026-11-05'),
    ).toMatchObject({
      contributionsCents: 40_000,
      contributionsDate: '2026-11-04',
    })
  })

  it('has no change rate from a zero value', () => {
    const result = computePerformance(
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
      expect(computePerformance(snapshots, type, '2026-11-13').stale).toBe(
        false,
      )
      expect(computePerformance(snapshots, type, '2026-11-14')).toMatchObject({
        daysSinceLatest: 32,
        stale: true,
      })
    }
    expect(computePerformance(snapshots, 'crypto', '2026-11-14').stale).toBe(
      false,
    )
  })
})

describe('contributions from linked transfers (#296)', () => {
  const flow = (date: string, amountCents: number) => ({ date, amountCents })

  it('replaces the typed contributions with the linked transfers', () => {
    const snapshots = [
      point('2026-01-31', 1_000_00, 900_00),
      point('2026-03-31', 2_100_00, 2_500_00),
    ]
    const flows = [
      flow('2026-02-10', 500_00),
      flow('2026-03-10', 600_00),
      flow('2026-03-20', -100_00),
    ]
    const result = computePerformance(
      snapshots,
      'brokerage',
      '2026-04-05',
      flows,
    )
    // 900 typed before the first transfer + 500 + 600 − 100.
    expect(result.contributionsCents).toBe(1_900_00)
    expect(result.contributionsSource).toBe('links')
    expect(result.gainCents).toBe(200_00)
    expect(result.typedContributionsCents).toBe(2_500_00)
    expect(result.linkedTransfersCount).toBe(3)
    expect(result.linkedAfterValueCents).toBe(0)
    // Contributions between the two snapshots come from the transfers too.
    expect(result.sincePrevious?.contributionsChangeCents).toBe(1_000_00)
  })

  it('starts from 0 without typed contributions and keeps later transfers apart', () => {
    const snapshots = [point('2026-03-31', 1_050_00)]
    const flows = [flow('2026-03-01', 1_000_00), flow('2026-04-02', 300_00)]
    const result = computePerformance(
      snapshots,
      'life_insurance',
      '2026-04-05',
      flows,
    )
    expect(result.contributionsCents).toBe(1_000_00)
    expect(result.gainCents).toBe(50_00)
    expect(result.typedContributionsCents).toBeNull()
    expect(result.linkedAfterValueCents).toBe(300_00)
  })

  it('keeps the typed contributions without links', () => {
    const snapshots = [point('2026-03-31', 1_200_00, 1_000_00)]
    const typed = computePerformance(snapshots, 'brokerage', '2026-04-05')
    expect(typed.contributionsSource).toBe('typed')
    expect(typed.contributionsCents).toBe(1_000_00)
    expect(typed.linkedTransfersCount).toBe(0)
  })

  it('gives a wallet the cost of the coins withdrawn to it, with no typed base', () => {
    // The holdings' invested amounts (1 000) are not dated: ignored.
    const snapshots = [
      point('2026-02-28', 900_00, 1_000_00),
      point('2026-03-31', 1_200_00, 1_000_00),
    ]
    const wallet = computePerformance(snapshots, 'crypto', '2026-04-05', [
      flow('2026-01-20', 600_00),
      flow('2026-03-20', 400_00),
    ])
    expect(wallet.contributionsCents).toBe(1_000_00)
    expect(wallet.contributionsSource).toBe('links')
    expect(wallet.gainCents).toBe(200_00)
    expect(
      linkedContributions(
        snapshots,
        [flow('2026-01-20', 600_00)],
        'crypto',
      )?.map((p) => p.contributionsCents),
    ).toEqual([600_00, 600_00])
  })

  it('leaves the snapshots before the first transfer as typed', () => {
    const history = linkedContributions(
      [point('2025-12-31', 800_00, 750_00), point('2026-02-28', 900_00)],
      [flow('2026-02-01', 100_00)],
      'brokerage',
    )
    expect(history?.map((p) => p.contributionsCents)).toEqual([750_00, 850_00])
  })
})
