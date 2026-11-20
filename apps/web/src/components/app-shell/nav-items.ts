import {
  ArrowLeftRightIcon,
  BitcoinIcon,
  CalendarCheckIcon,
  ChartPieIcon,
  HandCoinsIcon,
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
    | 'budget'
    | 'monthReview'
    | 'subscriptions'
    | 'savings'
    | 'owed'
    | 'crypto'
    | 'accounts'
    | 'import']
  icon: LucideIcon
  /**
   * Counter shown next to the label: the transactions to review, opening
   * Opérations filtered on « À revoir » (#322).
   */
  badge?: 'reviewCount' | 'owedTotal'
}

/** A titled group of the sidebar (#386: « Suivi », « Patrimoine », « Outils »). */
export interface NavGroup {
  label: string
  items: readonly NavItem[]
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

/**
 * Main navigation of the authenticated app, in groups (#386, the owner's
 * direction « A »): what happens month by month, what the owner holds, then
 * the tools. Navigation only: Réglages (and Catégories, Règles, Claude et
 * accès inside it) is reached from the account menu, the header's avatar.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Suivi',
    items: [
      {
        label: 'Tableau de bord',
        to: ROUTES.dashboard,
        icon: LayoutDashboardIcon,
      },
      { label: 'Dépenses', to: ROUTES.spending, icon: ChartPieIcon },
      {
        label: 'Opérations',
        to: ROUTES.transactions,
        icon: ArrowLeftRightIcon,
        badge: 'reviewCount',
      },
      { label: 'Budget', to: ROUTES.budget, icon: TargetIcon },
      {
        label: 'Revue du mois',
        to: ROUTES.monthReview,
        icon: CalendarCheckIcon,
      },
    ],
  },
  {
    label: 'Patrimoine',
    items: [
      { label: 'Comptes', to: ROUTES.accounts, icon: LandmarkIcon },
      { label: 'Épargne', to: ROUTES.savings, icon: PiggyBankIcon },
      { label: 'Crypto', to: ROUTES.crypto, icon: BitcoinIcon },
      // What people owe the owner, both ways on its page (#359).
      {
        label: 'Entre proches',
        to: ROUTES.owed,
        icon: HandCoinsIcon,
        badge: 'owedTotal',
      },
    ],
  },
  {
    label: 'Outils',
    items: [
      { label: 'Abonnements', to: ROUTES.subscriptions, icon: RepeatIcon },
      { label: 'Import', to: ROUTES.import, icon: UploadIcon },
    ],
  },
]

/** Every page of the navigation, in display order. */
export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap(
  (group) => group.items,
)

/**
 * The settings pages (#261, #300): the Réglages list, its sections' screens
 * under `/settings/…` and the Catégories and Règles pages it opens. The
 * account menu's « Réglages » is the current entry on all of them.
 */
const SETTINGS_PAGES: readonly string[] = [
  ROUTES.settings,
  ROUTES.categories,
  ROUTES.rules,
]

/** Whether `pathname` is one of the settings pages. */
export function isSettingsPage(pathname: string): boolean {
  return SETTINGS_PAGES.some((to) => isNavItemActive(pathname, to))
}

/** A nav item is active on its own page and on any page nested below it. */
export function isNavItemActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`)
}

/** Whether `item` is the current entry: its page or a nested page. */
export function isNavEntryActive(pathname: string, item: NavItem): boolean {
  return isNavItemActive(pathname, item.to)
}
