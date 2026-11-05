import {
  ArrowLeftRightIcon,
  LayoutDashboardIcon,
  PiggyBankIcon,
  RepeatIcon,
  TargetIcon,
  UploadIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ROUTES } from '#/lib/routes'

export interface NavItem {
  label: string
  to: (typeof ROUTES)[
    | 'dashboard'
    | 'transactions'
    | 'budget'
    | 'subscriptions'
    | 'savings'
    | 'import']
  icon: LucideIcon
}

/** Main navigation of the authenticated app, in display order. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Tableau de bord', to: ROUTES.dashboard, icon: LayoutDashboardIcon },
  { label: 'Opérations', to: ROUTES.transactions, icon: ArrowLeftRightIcon },
  { label: 'Budget', to: ROUTES.budget, icon: TargetIcon },
  { label: 'Abonnements', to: ROUTES.subscriptions, icon: RepeatIcon },
  { label: 'Épargne', to: ROUTES.savings, icon: PiggyBankIcon },
  { label: 'Import', to: ROUTES.import, icon: UploadIcon },
]

/** A nav item is active on its own page and on any page nested below it. */
export function isNavItemActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`)
}
