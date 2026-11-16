import { describe, expect, it } from 'vitest'
import { carriedMonth } from './nav-items'

describe('carriedMonth', () => {
  it('carries the month between month pages', () => {
    expect(carriedMonth('/spending', { month: '2026-09' }, '/budget')).toBe(
      '2026-09',
    )
    expect(
      carriedMonth('/month-review', { month: '2026-09' }, '/transactions'),
    ).toBe('2026-09')
    expect(carriedMonth('/budget', { month: '2026-09' }, '/savings')).toBe(
      '2026-09',
    )
  })

  it('carries nothing else', () => {
    // No month chosen, or the whole history.
    expect(carriedMonth('/spending', {}, '/budget')).toBeUndefined()
    expect(
      carriedMonth('/transactions', { month: 'all' }, '/budget'),
    ).toBeUndefined()
    // Not a month page, on either side.
    expect(
      carriedMonth('/spending', { month: '2026-09' }, '/crypto'),
    ).toBeUndefined()
    expect(
      carriedMonth('/dashboard', { month: '2026-09' }, '/spending'),
    ).toBeUndefined()
    // The page itself: its link resets it.
    expect(
      carriedMonth('/spending', { month: '2026-09' }, '/spending'),
    ).toBeUndefined()
  })
})
