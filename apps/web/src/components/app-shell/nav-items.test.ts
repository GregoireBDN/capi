import { describe, expect, it } from 'vitest'
import { NAV_ITEMS, carriedMonth, isNavEntryActive } from './nav-items'

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

describe('isNavEntryActive', () => {
  const spending = NAV_ITEMS.find((item) => item.label === 'Dépenses')!

  it('makes « Dépenses » the entry of Opérations, its sub-page (#393)', () => {
    expect(isNavEntryActive('/spending', spending)).toBe(true)
    expect(isNavEntryActive('/transactions', spending)).toBe(true)
    expect(isNavEntryActive('/transactions/42', spending)).toBe(true)
    expect(isNavEntryActive('/transactionsx', spending)).toBe(false)
    expect(isNavEntryActive('/budget', spending)).toBe(false)
  })

  it('leaves Opérations out of the sidebar, its count on « Dépenses »', () => {
    expect(NAV_ITEMS.map((item) => item.to)).not.toContain('/transactions')
    expect(spending.badge).toBe('reviewCount')
  })
})
