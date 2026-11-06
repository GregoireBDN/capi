import { describe, expect, it } from 'vitest'
import { addDays, addMonths } from './dates'
import {
  type DetectedSeries,
  detectRecurring,
  monthlyEquivalentCents,
  nextExpectedDate,
  type RecurringTransaction,
  yearlyCostCents,
} from './detect'

/** Synthetic labels and amounts only. */

const ACCOUNT = 'account-1'
const OTHER_ACCOUNT = 'account-2'
const TODAY = '2026-11-06'

let sequence = 0

function tx(
  date: string,
  amountCents: number,
  rawLabel: string,
  extra: Partial<RecurringTransaction> = {},
): RecurringTransaction {
  sequence++
  return {
    id: `t${String(sequence).padStart(5, '0')}`,
    accountId: ACCOUNT,
    bookingDate: date,
    amountCents,
    rawLabel,
    merchant: null,
    kind: amountCents < 0 ? 'expense' : 'income',
    categoryId: null,
    isOneOff: false,
    ...extra,
  }
}

/** `count` monthly charges ending at `last`, on the same day of month. */
function monthly(
  last: string,
  count: number,
  amountCents: number | ((i: number) => number),
  label: string,
  extra: Partial<RecurringTransaction> = {},
): RecurringTransaction[] {
  return Array.from({ length: count }, (_, i) =>
    tx(
      addMonths(last, i - count + 1),
      typeof amountCents === 'number' ? amountCents : amountCents(i),
      label,
      extra,
    ),
  )
}

function only(series: DetectedSeries[], merchantKey: string): DetectedSeries {
  const found = series.filter((s) => s.merchantKey === merchantKey)
  expect(found).toHaveLength(1)
  return found[0]
}

describe('detectRecurring', () => {
  it('detects a fixed monthly debit with a few days of drift', () => {
    const days = [1, 3, 2, 5, 1, 2, 4, 1, 3, 2, 1, 2]
    const rows = days.map((day, i) =>
      tx(
        addMonths('2025-11-01', i, day),
        -85_000,
        'PRLV SEPA SOCIETE IMMO EXEMPLE LOYER',
        { categoryId: 'rent' },
      ),
    )
    const series = only(
      detectRecurring(rows, TODAY),
      'SOCIETE IMMO EXEMPLE LOYER',
    )
    expect(series).toMatchObject({
      accountId: ACCOUNT,
      direction: 'debit',
      cadence: 'monthly',
      amountType: 'fixed',
      typicalAmountCents: 85_000,
      latestAmountCents: 85_000,
      priceChangeCents: null,
      categoryId: 'rent',
      displayName: 'Societe Immo Exemple Loyer',
      lastDate: '2026-10-02',
      nextExpectedDate: '2026-11-02',
      active: true,
      missedCount: 0,
    })
    expect(series.occurrences).toHaveLength(12)
    expect(series.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('keeps month-end charges at month end (Jan 31 → Feb 28/29)', () => {
    const dates = [
      '2026-06-30',
      '2026-07-31',
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
    ]
    const rows = dates.map((d) => tx(d, -2_000, 'PRLV SEPA ASSUREUR EXEMPLE'))
    const series = only(detectRecurring(rows, TODAY), 'ASSUREUR EXEMPLE')
    expect(series.cadence).toBe('monthly')
    expect(series.nextExpectedDate).toBe('2026-11-30')

    expect(nextExpectedDate('2027-01-31', 'monthly', 31)).toBe('2027-02-28')
    expect(nextExpectedDate('2028-01-31', 'monthly', 31)).toBe('2028-02-29')
    expect(nextExpectedDate('2028-02-29', 'monthly', 31)).toBe('2028-03-31')
    expect(nextExpectedDate('2026-11-06', 'weekly')).toBe('2026-11-13')
    expect(nextExpectedDate('2024-02-29', 'yearly')).toBe('2025-02-28')
    expect(nextExpectedDate('2026-08-15', 'quarterly')).toBe('2026-11-15')
  })

  it('handles a charge taken early, in the previous month', () => {
    // Usually on the 2nd; the October one was taken on September 30th.
    const dates = ['2026-06-02', '2026-07-02', '2026-08-03', '2026-09-30']
    const rows = dates.map((d) => tx(d, -1_500, 'PRLV SEPA CLUB EXEMPLE'))
    const series = only(detectRecurring(rows, TODAY), 'CLUB EXEMPLE')
    expect(series.nextExpectedDate).toBe('2026-11-02')
  })

  it('detects a yearly fee from two occurrences', () => {
    const rows = [
      tx('2024-03-15', -4_500, 'F COTIS CARTE EXEMPLE'),
      tx('2025-03-18', -4_500, 'F COTIS CARTE EXEMPLE'),
      tx('2026-03-14', -4_800, 'F COTIS CARTE EXEMPLE'),
    ]
    const [series] = detectRecurring(rows, TODAY)
    expect(series).toMatchObject({
      cadence: 'yearly',
      amountType: 'fixed',
      typicalAmountCents: 4_800,
      previousAmountCents: 4_500,
      priceChangeCents: 300,
      priceChangedOn: '2026-03-14',
      nextExpectedDate: '2027-03-15',
      active: true,
    })
    expect(yearlyCostCents(series.typicalAmountCents, 'yearly')).toBe(4_800)
    expect(monthlyEquivalentCents(series.typicalAmountCents, 'yearly')).toBe(
      400,
    )
  })

  it('sees a price change between two yearly occurrences', () => {
    const rows = [
      tx('2025-10-12', -4_500, 'F COTIS CARTE EXEMPLE'),
      tx('2026-10-12', -4_800, 'F COTIS CARTE EXEMPLE'),
    ]
    const [series] = detectRecurring(rows, TODAY)
    expect(series).toMatchObject({
      cadence: 'yearly',
      amountType: 'fixed',
      typicalAmountCents: 4_800,
      priceChangeCents: 300,
    })
  })

  it('keeps alternating amounts variable', () => {
    const amounts = [-8_000, -9_500, -7_200, -9_400, -8_100]
    const rows = monthly(
      '2026-10-08',
      5,
      (i) => amounts[i],
      'PRLV SEPA EAU EXEMPLE',
    )
    expect(only(detectRecurring(rows, TODAY), 'EAU EXEMPLE').amountType).toBe(
      'variable',
    )
  })

  it('tolerates one missing month', () => {
    const rows = monthly('2026-10-10', 8, -1_299, 'PRLV SEPA STREAM EXEMPLE')
    rows.splice(4, 1)
    const series = only(detectRecurring(rows, TODAY), 'STREAM EXEMPLE')
    expect(series.cadence).toBe('monthly')
    expect(series.occurrences).toHaveLength(7)
    expect(series.missedCount).toBe(1)
  })

  it('flags a price increase on a fixed subscription', () => {
    const rows = monthly(
      '2026-10-12',
      10,
      (i) => (i < 7 ? -1_099 : -1_299),
      'PAIEMENT CB 1210 DUBLIN STREAMFLIX CARTE 1234',
    )
    const series = only(detectRecurring(rows, TODAY), 'STREAMFLIX')
    expect(series).toMatchObject({
      amountType: 'fixed',
      typicalAmountCents: 1_299,
      latestAmountCents: 1_299,
      previousAmountCents: 1_099,
      priceChangeCents: 200,
      priceChangedOn: '2026-08-12',
    })
  })

  it('flags a price change from the latest occurrence', () => {
    const rows = monthly(
      '2026-10-05',
      6,
      (i) => (i < 5 ? -999 : -1_199),
      'PRLV SEPA MUSIQUE EXEMPLE',
    )
    const series = only(detectRecurring(rows, TODAY), 'MUSIQUE EXEMPLE')
    expect(series.priceChangeCents).toBe(200)
    expect(series.priceChangedOn).toBe('2026-10-05')
  })

  it('treats small variations (±1 € / ±1 %) as a fixed amount', () => {
    const amounts = [-5_000, -5_050, -4_980, -5_020, -5_000]
    const rows = monthly(
      '2026-10-20',
      5,
      (i) => amounts[i],
      'PRLV SEPA EAU EXEMPLE',
    )
    const series = only(detectRecurring(rows, TODAY), 'EAU EXEMPLE')
    expect(series.amountType).toBe('fixed')
    expect(series.priceChangeCents).toBeNull()
  })

  it('detects variable energy bills with their median and range', () => {
    const amounts = [
      -9_800, -11_200, -8_700, -7_100, -6_400, -6_900, -8_100, -10_400,
    ]
    const rows = monthly(
      '2026-10-08',
      8,
      (i) => amounts[i],
      'PRLV SEPA ENERGIE EXEMPLE 7738291045',
    )
    const series = only(detectRecurring(rows, TODAY), 'ENERGIE EXEMPLE')
    expect(series).toMatchObject({
      cadence: 'monthly',
      amountType: 'variable',
      typicalAmountCents: 8_400,
      minAmountCents: 6_400,
      maxAmountCents: 11_200,
      priceChangeCents: null,
    })
    expect(series.confidence).toBeLessThan(0.8)
    expect(series.confidence).toBeGreaterThanOrEqual(0.3)
  })

  it('detects recurring income (credits) separately from debits', () => {
    const rows = [
      ...monthly(
        '2026-10-28',
        12,
        250_000,
        'VIR SEPA EMPLOYEUR EXEMPLE SALAIRE',
      ),
      ...monthly('2026-10-05', 4, -3_000, 'VIR SEPA EMPLOYEUR EXEMPLE SALAIRE'),
    ]
    const series = detectRecurring(rows, TODAY)
    const credit = series.find((s) => s.direction === 'credit')!
    expect(credit.cadence).toBe('monthly')
    expect(credit.typicalAmountCents).toBe(250_000)
    expect(
      series.find((s) => s.direction === 'debit')?.typicalAmountCents,
    ).toBe(3_000)
  })

  it('detects weekly series', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      tx(
        addDays('2026-09-11', i * 7),
        -1_000,
        'PRLV SEPA PANIER HEBDO EXEMPLE',
      ),
    )
    const series = only(detectRecurring(rows, TODAY), 'PANIER HEBDO EXEMPLE')
    expect(series.cadence).toBe('weekly')
    expect(yearlyCostCents(1_000, 'weekly')).toBe(52_000)
    expect(monthlyEquivalentCents(1_000, 'weekly')).toBe(4_333)
  })

  it('does not suggest frequent irregular grocery shopping', () => {
    // 2–3 visits a week, amounts all over the place.
    const gaps = [2, 3, 1, 4, 2, 2, 5, 1, 3, 2, 4, 1, 2, 3, 6, 2, 1, 3, 2, 4]
    const amounts = [4_210, 2_350, 8_990, 1_250, 6_730, 3_100, 11_540, 870]
    let date = '2026-07-01'
    const rows: RecurringTransaction[] = []
    for (let i = 0; i < 60; i++) {
      date = addDays(date, gaps[i % gaps.length])
      rows.push(
        tx(
          date,
          -amounts[i % amounts.length],
          'PAIEMENT CB 0101 PARIS SUPERMARCHE EXEMPLE CARTE 1234',
        ),
      )
    }
    expect(detectRecurring(rows, TODAY)).toEqual([])
  })

  it('does not suggest irregular intervals or too few occurrences', () => {
    const rows = [
      tx('2026-01-10', -2_000, 'PRLV SEPA IRREGULIER EXEMPLE'),
      tx('2026-03-02', -2_000, 'PRLV SEPA IRREGULIER EXEMPLE'),
      tx('2026-03-29', -2_000, 'PRLV SEPA IRREGULIER EXEMPLE'),
      tx('2026-06-15', -2_000, 'PRLV SEPA IRREGULIER EXEMPLE'),
      tx('2026-08-01', -2_000, 'PRLV SEPA IRREGULIER EXEMPLE'),
      ...monthly('2026-10-03', 2, -900, 'PRLV SEPA NOUVEAU EXEMPLE'),
    ]
    expect(detectRecurring(rows, TODAY)).toEqual([])
  })

  it('ignores one-off transactions', () => {
    const rows = monthly(
      '2026-10-15',
      6,
      -3_000,
      'PRLV SEPA SALLE SPORT EXEMPLE',
      { isOneOff: true },
    )
    expect(detectRecurring(rows, TODAY)).toEqual([])
    // A one-off in the middle of a series is skipped, not a break.
    const mixed = monthly(
      '2026-10-15',
      6,
      -3_000,
      'PRLV SEPA SALLE SPORT EXEMPLE',
    )
    mixed.push(
      tx('2026-08-20', -3_000, 'PRLV SEPA SALLE SPORT EXEMPLE', {
        isOneOff: true,
      }),
    )
    expect(
      only(detectRecurring(mixed, TODAY), 'SALLE SPORT EXEMPLE').occurrences,
    ).toHaveLength(6)
  })

  it('ignores transfers between own accounts', () => {
    const rows = monthly(
      '2026-10-02',
      12,
      -20_000,
      'VIR SEPA LIVRET A EXEMPLE',
      { kind: 'transfer' },
    )
    expect(detectRecurring(rows, TODAY)).toEqual([])
  })

  it('keeps accounts apart', () => {
    const rows = [
      ...monthly('2026-10-04', 3, -1_000, 'PRLV SEPA ABO EXEMPLE'),
      ...monthly('2026-10-04', 3, -1_000, 'PRLV SEPA ABO EXEMPLE', {
        accountId: OTHER_ACCOUNT,
      }),
    ]
    const series = detectRecurring(rows, TODAY)
    expect(series.map((s) => s.accountId).sort()).toEqual([
      ACCOUNT,
      OTHER_ACCOUNT,
    ])
  })

  it('marks a cancelled series inactive after 1.5 periods', () => {
    const rows = [
      ...monthly('2026-08-10', 8, -799, 'PRLV SEPA VIDEO EXEMPLE'),
      // Data imported up to November: the account horizon.
      tx(
        '2026-11-04',
        -2_500,
        'PAIEMENT CB 0411 PARIS BOULANGERIE EXEMPLE CARTE 1234',
      ),
    ]
    const series = only(detectRecurring(rows, TODAY), 'VIDEO EXEMPLE')
    expect(series.active).toBe(false)
    expect(series.recency).toBeLessThan(1)
  })

  it('judges staleness against the latest imported transaction', () => {
    // Nothing imported since August: the series is not stale yet.
    const rows = monthly('2026-08-10', 8, -799, 'PRLV SEPA VIDEO EXEMPLE')
    expect(only(detectRecurring(rows, TODAY), 'VIDEO EXEMPLE').active).toBe(
      true,
    )
  })

  it('leaves an extra charge out of the series', () => {
    const rows = monthly('2026-10-06', 6, -1_500, 'PRLV SEPA GARDE EXEMPLE')
    rows.push(tx('2026-07-08', -1_500, 'PRLV SEPA GARDE EXEMPLE'))
    const series = only(detectRecurring(rows, TODAY), 'GARDE EXEMPLE')
    expect(series.occurrences).toHaveLength(6)
    expect(series.cadence).toBe('monthly')
  })
})
