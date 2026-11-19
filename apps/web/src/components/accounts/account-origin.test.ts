import { describe, expect, it } from 'vitest'
import {
  accountBackLink,
  accountLinkSearch,
  validateAccountSearch,
} from './account-origin'

describe('account origin (#324)', () => {
  it('goes back to « Comptes » without an origin', () => {
    expect(accountBackLink({})).toEqual({
      label: 'Comptes',
      to: '/accounts',
      search: undefined,
    })
  })

  it('goes back to the page it was opened from, with its month', () => {
    expect(accountBackLink({ from: 'savings', month: '2026-10' })).toEqual({
      label: 'Épargne',
      to: '/savings',
      search: { month: '2026-10' },
    })
    expect(accountBackLink({ from: 'dashboard' })).toMatchObject({
      label: 'Tableau de bord',
      to: '/dashboard',
      search: undefined,
    })
    expect(accountBackLink({ from: 'month-review', month: '2026-09' })).toEqual(
      {
        label: 'Revue du mois',
        to: '/month-review',
        search: { month: '2026-09' },
      },
    )
    expect(accountBackLink({ from: 'crypto' })).toMatchObject({
      label: 'Crypto',
      to: '/crypto',
    })
    expect(accountBackLink({ from: 'net-worth' })).toMatchObject({
      label: 'Patrimoine',
      to: '/net-worth',
    })
    // Opérations filtered on « À revoir » (#322).
    expect(accountBackLink({ from: 'review' })).toMatchObject({
      label: 'À revoir',
      to: '/transactions',
      search: { review: true, month: 'all' },
    })
  })

  it('keeps a valid origin and the month of a page that takes one', () => {
    expect(
      validateAccountSearch({ from: 'savings', month: '2026-10' }),
    ).toEqual({ from: 'savings', month: '2026-10' })
    expect(validateAccountSearch({ from: 'crypto', month: '2026-10' })).toEqual(
      {
        from: 'crypto',
      },
    )
    expect(
      validateAccountSearch({ from: 'savings', month: '2026-13' }),
    ).toEqual({ from: 'savings' })
    expect(
      validateAccountSearch({ from: 'elsewhere', month: '2026-10' }),
    ).toEqual({})
    expect(validateAccountSearch({})).toEqual({})
  })

  it('carries the month the origin page shows to the account page', () => {
    expect(accountLinkSearch('savings')({ month: '2026-10' })).toEqual({
      from: 'savings',
      month: '2026-10',
    })
    expect(accountLinkSearch('savings')({})).toEqual({ from: 'savings' })
    expect(accountLinkSearch('net-worth')({ period: 'all' })).toEqual({
      from: 'net-worth',
    })
    expect(accountLinkSearch('crypto')({ month: '2026-10' })).toEqual({
      from: 'crypto',
    })
  })
})
