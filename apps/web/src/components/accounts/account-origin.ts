import { z } from 'zod'
import type { PageBackLink } from '#/components/app-shell/PageBack'
import { isMonth } from '#/lib/calendar'
import { REVIEW_SEARCH } from '#/components/transactions/search'
import { ROUTES } from '#/lib/routes'

/**
 * The pages an account page is opened from (#324): its back link names the
 * page and returns to it, with the month it showed.
 */
export const ACCOUNT_ORIGINS = [
  'accounts',
  'savings',
  'crypto',
  'net-worth',
  'dashboard',
  'month-review',
  'review',
] as const

export type AccountOrigin = (typeof ACCOUNT_ORIGINS)[number]

/** The account page's search: where it was opened from, and that page's month. */
export interface AccountSearch {
  from?: AccountOrigin
  month?: string
}

const ORIGINS: Record<
  AccountOrigin,
  {
    label: string
    to: PageBackLink['to']
    hasMonth: boolean
    /** The origin page's own search, e.g. Opérations filtered on « À revoir ». */
    search?: PageBackLink['search']
  }
> = {
  accounts: { label: 'Comptes', to: ROUTES.accounts, hasMonth: false },
  savings: { label: 'Épargne', to: ROUTES.savings, hasMonth: true },
  crypto: { label: 'Crypto', to: ROUTES.crypto, hasMonth: false },
  'net-worth': { label: 'Patrimoine', to: ROUTES.netWorth, hasMonth: false },
  dashboard: { label: 'Tableau de bord', to: ROUTES.dashboard, hasMonth: false },
  'month-review': {
    label: 'Revue du mois',
    to: ROUTES.monthReview,
    hasMonth: true,
  },
  // « À revoir » is a filter of Opérations since #322.
  review: {
    label: 'À revoir',
    to: ROUTES.transactions,
    hasMonth: false,
    search: REVIEW_SEARCH,
  },
}

const searchSchema = z.object({
  from: z.enum(ACCOUNT_ORIGINS).optional().catch(undefined),
  month: z.string().refine(isMonth).optional().catch(undefined),
})

/**
 * `?from=savings&month=2026-10` (both optional): an unknown origin is
 * dropped, and so is a month the origin page doesn't take.
 */
export function validateAccountSearch(
  search: Record<string, unknown>,
): AccountSearch {
  const { from, month } = searchSchema.parse(search)
  if (!from) return {}
  return month && ORIGINS[from].hasMonth ? { from, month } : { from }
}

/** The account page's back link: its origin, « Comptes » without one. */
export function accountBackLink({ from, month }: AccountSearch): PageBackLink {
  const origin = ORIGINS[from ?? 'accounts']
  return {
    label: origin.label,
    to: origin.to,
    search: month && origin.hasMonth ? { month } : origin.search,
  }
}

/**
 * The `search` of a link to an account page from `from`: the link resolves
 * it against the page it is on, so the month that page shows (`?month=`)
 * comes along, and the account's back link returns to the same month.
 */
export function accountLinkSearch(from: AccountOrigin) {
  return (current: Record<string, unknown>): AccountSearch => {
    const month = current.month
    return typeof month === 'string' && isMonth(month) && ORIGINS[from].hasMonth
      ? { from, month }
      : { from }
  }
}
