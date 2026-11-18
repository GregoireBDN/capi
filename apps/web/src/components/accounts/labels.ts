import {
  BitcoinIcon,
  BriefcaseIcon,
  ChartCandlestickIcon,
  PiggyBankIcon,
  UmbrellaIcon,
  WalletIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AccountType } from '#/api/types.gen'
import { formatCalendarDate } from '#/lib/money'

/** Checking and savings accounts are fed by imports; the rest by snapshots. */
export function isInvestmentType(type: AccountType): boolean {
  return type !== 'checking' && type !== 'savings'
}

/** `il y a 92 jours`, `hier`, `aujourd’hui`. */
export function formatAge(days: number): string {
  if (days <= 0) return 'aujourd’hui'
  if (days === 1) return 'hier'
  return `il y a ${days} jours`
}

/** `Valeur du 5 août 2026, il y a 92 jours`. */
export function valueAgeText(date: string, days: number): string {
  return `Valeur du ${formatCalendarDate(date)}, ${formatAge(days)}`
}

/**
 * Round badge of each account type in the account lists: an icon on a tint
 * of a theme colour (light and dark come from the chart tokens).
 */
export const ACCOUNT_TYPE_ICONS: Record<
  AccountType,
  { icon: LucideIcon; className: string }
> = {
  checking: { icon: WalletIcon, className: 'bg-chart-1/15 text-chart-1' },
  savings: { icon: PiggyBankIcon, className: 'bg-chart-3/15 text-chart-3' },
  brokerage: {
    icon: ChartCandlestickIcon,
    className: 'bg-chart-7/15 text-chart-7',
  },
  life_insurance: {
    icon: UmbrellaIcon,
    className: 'bg-chart-5/15 text-chart-5',
  },
  employee_savings: {
    icon: BriefcaseIcon,
    className: 'bg-chart-4/15 text-chart-4',
  },
  crypto: { icon: BitcoinIcon, className: 'bg-chart-2/15 text-chart-2' },
}
