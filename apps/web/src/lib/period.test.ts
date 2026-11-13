import { describe, expect, it } from 'vitest'
import type { MonthPeriodDto } from '#/api/types.gen'
import {
  comparedDays,
  comparisonLabel,
  describePeriod,
  formatShortDay,
  isComparable,
} from './period'

function period(overrides: Partial<MonthPeriodDto> = {}): MonthPeriodDto {
  return {
    month: '2026-11',
    dataUntil: '2026-11-03',
    status: 'partial',
    throughDay: 3,
    previousMonth: '2026-10',
    previousUntil: '2026-10-03',
    defaultMonth: '2026-11',
    ...overrides,
  }
}

describe('period labels', () => {
  it('formats short days, with the year only when it differs', () => {
    expect(formatShortDay('2026-11-03')).toBe('3 nov.')
    expect(formatShortDay('2026-09-01')).toBe('1er sept.')
    expect(formatShortDay('2025-10-28', '2026')).toBe('28 oct. 2025')
    expect(formatShortDay('2026-10-28', '2026')).toBe('28 oct.')
  })

  it('names the compared days of a partial month', () => {
    expect(comparedDays(period())).toBe('1–3 oct.')
    expect(comparedDays(period({ previousUntil: '2026-10-01' }))).toBe(
      '1er oct.',
    )
    expect(
      comparedDays(period({ status: 'complete', previousUntil: '2026-10-31' })),
    ).toBeNull()
    expect(comparisonLabel(period(), 'vs mois précédent')).toBe('vs 1–3 oct.')
    expect(
      comparisonLabel(period({ status: 'complete' }), 'vs mois précédent'),
    ).toBe('vs mois précédent')
  })

  it('says how far the figures go', () => {
    expect(describePeriod(period(), '2026-11')).toBe(
      'Mois en cours : données jusqu’au 3 nov., comparées au 1–3 oct.',
    )
    expect(
      describePeriod(
        period({
          month: '2026-10',
          dataUntil: '2026-10-28',
          throughDay: 28,
          previousMonth: '2026-09',
          previousUntil: '2026-09-28',
          defaultMonth: '2026-10',
        }),
        '2026-11',
      ),
    ).toBe('Données jusqu’au 28 oct. seulement, comparées au 1–28 sept.')
    expect(
      describePeriod(
        period({
          dataUntil: '2026-10-28',
          status: 'empty',
          throughDay: null,
          previousUntil: null,
        }),
        '2026-11',
      ),
    ).toBe('Pas encore de données en novembre : elles s’arrêtent au 28 oct.')
    expect(
      describePeriod(
        period({ month: '2026-09', status: 'complete', throughDay: null }),
        '2026-11',
      ),
    ).toBe('Mois complet, données jusqu’au 3 nov.')
    expect(describePeriod(period({ dataUntil: null }), '2026-11')).toBeNull()
  })

  it('compares only a month with data', () => {
    expect(isComparable(period())).toBe(true)
    expect(isComparable(period({ status: 'empty' }))).toBe(false)
  })
})
