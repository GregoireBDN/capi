import { describe, expect, it } from 'vitest'
import type { DashboardAccountDto, HistoryMonthDto } from '#/api/types.gen'
import {
  breakdownByType,
  netWorthDeltas,
  netWorthSeries,
  typeShare,
} from './net-worth'

/** Synthetic data only. */
function month(
  key: string,
  netWorthCents: number | null,
  accounts: HistoryMonthDto['accounts'] = [],
): HistoryMonthDto {
  return {
    month: key,
    incomeCents: 0,
    expenseCents: 0,
    netCents: 0,
    netWorthCents,
    accounts,
  }
}

/** 2025-01 … 2026-11: unknown before 2025-03, then 1 000 € more each month. */
const MONTHS: HistoryMonthDto[] = Array.from({ length: 23 }, (_, i) => {
  const year = 2025 + Math.floor(i / 12)
  const key = `${year}-${String((i % 12) + 1).padStart(2, '0')}`
  return month(key, i < 2 ? null : i * 100_000)
})

const account = (
  id: string,
  type: DashboardAccountDto['type'],
): DashboardAccountDto => ({
  id,
  name: `Compte ${id}`,
  type,
  institution: null,
  group: type === 'checking' || type === 'savings' ? 'cash' : 'investments',
  balanceCents: 0,
  balanceDate: null,
  dataUntil: null,
  stale: false,
})

describe('netWorthSeries', () => {
  it('keeps the last 6 or 12 month ends, or all from the first known one', () => {
    const six = netWorthSeries(MONTHS, '2026-11', '6m')
    expect(six.map((m) => m.month)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ])
    const twelve = netWorthSeries(MONTHS, '2026-11', '12m')
    expect(twelve).toHaveLength(12)
    expect(twelve[0].month).toBe('2025-12')

    // Months before any known balance are left out.
    const all = netWorthSeries(MONTHS, '2026-11', 'all')
    expect(all).toHaveLength(21)
    expect(all[0]).toMatchObject({ month: '2025-03', netWorthCents: 200_000 })
  })

  it('stops at the month the data stops in', () => {
    const series = netWorthSeries(MONTHS, '2026-10', '6m')
    expect(series.map((m) => m.month)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ])
  })

  it('is empty without any known net worth', () => {
    expect(netWorthSeries([month('2026-10', null)], '2026-10', 'all')).toEqual(
      [],
    )
  })
})

describe('netWorthDeltas', () => {
  it('compares with 1 month, 12 months and the start of the year', () => {
    // 2026-11 is index 22: 2 200 000; 2026-10: 2 100 000; 2025-11: 1 000 000;
    // 2025-12: 1 100 000.
    expect(netWorthDeltas(MONTHS, '2026-11')).toEqual([
      { key: 'month', since: '2026-10', cents: 100_000 },
      { key: 'year', since: '2025-11', cents: 1_200_000 },
      { key: 'yearStart', since: '2025-12', cents: 1_100_000 },
    ])
  })

  it('works from any selected month end', () => {
    expect(netWorthDeltas(MONTHS, '2026-03')).toEqual([
      { key: 'month', since: '2026-02', cents: 100_000 },
      { key: 'year', since: '2025-03', cents: 1_200_000 },
      { key: 'yearStart', since: '2025-12', cents: 300_000 },
    ])
  })

  it('leaves out the start of the year in January (same as 1 month)', () => {
    expect(netWorthDeltas(MONTHS, '2026-01').map((d) => d.key)).toEqual([
      'month',
      'year',
    ])
  })

  it('has no value when the month compared with is unknown', () => {
    const deltas = netWorthDeltas(MONTHS, '2025-04')
    expect(deltas).toEqual([
      { key: 'month', since: '2025-03', cents: 100_000 },
      // 2024-04: before the history.
      { key: 'year', since: '2024-04', cents: null },
      { key: 'yearStart', since: '2024-12', cents: null },
    ])
  })
})

describe('breakdownByType', () => {
  const accounts = [
    account('a', 'checking'),
    account('b', 'savings'),
    account('c', 'savings'),
    account('d', 'brokerage'),
    account('e', 'crypto'),
  ]
  const point = month('2026-10', 1_234_567, [
    { accountId: 'e', type: 'crypto', balanceCents: 100_001 },
    { accountId: 'a', type: 'checking', balanceCents: -20_000 },
    { accountId: 'b', type: 'savings', balanceCents: 300_000 },
    { accountId: 'c', type: 'savings', balanceCents: 54_566 },
    { accountId: 'd', type: 'brokerage', balanceCents: 800_000 },
  ])

  it('adds up to the net worth, by type in a fixed order', () => {
    const types = breakdownByType(point, accounts)
    expect(types.map((t) => [t.type, t.label, t.totalCents])).toEqual([
      ['checking', 'Compte courant', -20_000],
      ['savings', 'Livret d’épargne', 354_566],
      ['brokerage', 'PEA / compte-titres', 800_000],
      ['crypto', 'Crypto', 100_001],
    ])
    expect(types.reduce((sum, t) => sum + t.totalCents, 0)).toBe(
      point.netWorthCents,
    )
    expect(
      types.flatMap((t) => t.accounts.map((a) => a.account?.name)),
    ).toEqual(['Compte a', 'Compte b', 'Compte c', 'Compte d', 'Compte e'])
  })

  it('keeps an account missing from the list, without its details', () => {
    const [crypto] = breakdownByType(
      month('2026-10', 5_000, [
        { accountId: 'z', type: 'crypto', balanceCents: 5_000 },
      ]),
      accounts,
    )
    expect(crypto.accounts).toEqual([
      { accountId: 'z', account: null, balanceCents: 5_000 },
    ])
  })

  it('shares the positive total between the types', () => {
    const types = breakdownByType(point, accounts)
    const shares = types.map((type) => typeShare(types, type))
    // The overdrawn checking account gets no share.
    expect(shares[0]).toBe(0)
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1)
    expect(shares[2]).toBeCloseTo(800_000 / 1_254_567)
  })
})
