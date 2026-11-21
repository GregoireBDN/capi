import { describe, expect, it } from 'vitest'
import { changePeriodText } from '#/components/accounts/InvestmentSummary'
import { fiveYearsOn, timeElapsed, timeLeftText } from './PeaFacts'

describe('PEA facts and the summary’s short texts (#413)', () => {
  it('counts what is left of the 5 years', () => {
    expect(fiveYearsOn('2022-03-12')).toBe('2027-03-12')
    expect(timeLeftText('2026-11-06', '2027-03-12')).toBe('Encore 4 mois')
    expect(timeLeftText('2025-11-06', '2027-03-12')).toBe(
      'Encore 1 an et 4 mois',
    )
    expect(timeLeftText('2027-03-01', '2027-03-12')).toBe('Encore 11 jours')
    expect(timeLeftText('2027-03-12', '2027-03-12')).toBe('Atteints')
    expect(timeElapsed('2022-03-12', '2027-03-12', '2024-09-11')).toBeCloseTo(
      0.5,
      2,
    )
  })

  it('says a change as short as it can', () => {
    expect(changePeriodText('2026-09-30', '2026-10-31', '2026')).toBe(
      'en un mois',
    )
    expect(changePeriodText('2026-11-05', '2026-11-06', '2026')).toBe(
      'depuis hier',
    )
    expect(changePeriodText('2026-06-30', '2026-09-30', '2026')).toMatch(
      /^depuis le 30 juin$/,
    )
  })
})
