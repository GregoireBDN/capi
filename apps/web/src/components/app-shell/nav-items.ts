import {
  ArrowLeftRightIcon,
  BitcoinIcon,
  ChartPieIcon,
  InboxIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  PiggyBankIcon,
  RepeatIcon,
  TargetIcon,
  UploadIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { isMonth } from '#/lib/calendar'
import { ROUTES } from '#/lib/routes'

export interface NavItem {
  label: string
  to: (typeof ROUTES)[
    | 'dashboard'
    | 'spending'
    | 'transactions'
    | 'review'
    | 'budget'
    | 'subscriptions'
    | 'savings'
    | 'crypto'
    | 'accounts'
    | 'import']
  icon: LucideIcon
  /** Counter shown next to the label: the review queue size. */
  badge?: 'reviewCount'
}

/**
 * Pages showing one month (`?month=YYYY-MM`): moving between them keeps the
 * month chosen (the nav links carry it).
 */
const MONTH_PAGES: readonly string[] = [
  ROUTES.spending,
  ROUTES.transactions,
  ROUTES.budget,
  ROUTES.savings,
  ROUTES.monthReview,
]

/**
 * The month a nav link to `to` carries: the one in the URL of the month
 * page shown, when `to` is another month page; else none (the page opens on
 * its default month).
 */
export function carriedMonth(
  pathname: string,
  search: Record<string, unknown>,
  to: string,
): string | undefined {
  if (to === pathname || !MONTH_PAGES.includes(to)) return undefined
  if (!MONTH_PAGES.includes(pathname)) return undefined
  const { month } = search
  return typeof month === 'string' && isMonth(month) ? month : undefined
}

/** Main navigation of the authenticated app, in display order. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Tableau de bord', to: ROUTES.dashboard, icon: LayoutDashboardIcon },
  { label: 'Dépenses', to: ROUTES.spending, icon: ChartPieIcon },
  { label: 'Opérations', to: ROUTES.transactions, icon: ArrowLeftRightIcon },
  {
    label: 'À revoir',
    to: ROUTES.review,
    icon: InboxIcon,
    badge: 'reviewCount',
  },
  { label: 'Budget', to: ROUTES.budget, icon: TargetIcon },
  { label: 'Abonnements', to: ROUTES.subscriptions, icon: RepeatIcon },
  { label: 'Épargne', to: ROUTES.savings, icon: PiggyBankIcon },
  { label: 'Crypto', to: ROUTES.crypto, icon: BitcoinIcon },
  { label: 'Comptes', to: ROUTES.accounts, icon: LandmarkIcon },
  { label: 'Import', to: ROUTES.import, icon: UploadIcon },
]

/** A nav item is active on its own page and on any page nested below it. */
export function isNavItemActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`)
}
