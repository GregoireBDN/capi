import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRightIcon,
  CalendarClockIcon,
  ChartCandlestickIcon,
  InboxIcon,
  LandmarkIcon,
  PiggyBankIcon,
  ReceiptIcon,
  ShoppingCartIcon,
  TargetIcon,
  WalletIcon,
} from 'lucide-react'
import type {
  AccountType,
  DashboardWidgetDto,
  DashboardWidgetType,
} from '#/api/types.gen'

export interface ElementInfo {
  type: DashboardWidgetType
  /** One or two words. */
  name: string
  icon: LucideIcon
  /** The badge's tone (background and glyph). */
  tone: string
  /** The accounts it can show, when it shows accounts. */
  accountTypes?: readonly AccountType[]
  /** It shows envelopes (all of them or the chosen ones). */
  envelopes?: boolean
}

const BANK: readonly AccountType[] = ['checking', 'savings']
const INVESTMENTS: readonly AccountType[] = [
  'brokerage',
  'securities',
  'life_insurance',
  'employee_savings',
  'crypto',
]

/**
 * The dashboard's elements (#495), in the order the catalogue offers them:
 * today, the month, the accounts, money owed, savings. Each answers one
 * question in one card and opens its page.
 */
export const ELEMENTS: Record<DashboardWidgetType, ElementInfo> = {
  todo: {
    type: 'todo',
    name: 'À faire',
    icon: InboxIcon,
    tone: 'bg-warning/20 text-warning-foreground dark:text-warning',
  },
  left_to_spend: {
    type: 'left_to_spend',
    name: 'Reste à dépenser',
    icon: TargetIcon,
    tone: 'bg-primary/10 text-primary',
  },
  tracked_budgets: {
    type: 'tracked_budgets',
    name: 'Budgets suivis',
    icon: ShoppingCartIcon,
    tone: 'bg-chart-2/15 text-chart-2',
  },
  month_flows: {
    type: 'month_flows',
    name: 'Le mois',
    icon: ReceiptIcon,
    tone: 'bg-chart-4/15 text-chart-4',
  },
  upcoming_debits: {
    type: 'upcoming_debits',
    name: 'Prélèvements',
    icon: CalendarClockIcon,
    tone: 'bg-info/15 text-info-foreground dark:text-info',
    accountTypes: BANK,
  },
  forecast: {
    type: 'forecast',
    name: 'Fin de mois',
    icon: CalendarClockIcon,
    tone: 'bg-muted text-muted-foreground',
    accountTypes: BANK,
  },
  balances: {
    type: 'balances',
    name: 'Soldes',
    icon: WalletIcon,
    tone: 'bg-chart-1/15 text-chart-1',
    accountTypes: ['checking', 'savings', 'meal_voucher', ...INVESTMENTS],
  },
  net_worth: {
    type: 'net_worth',
    name: 'Patrimoine',
    icon: LandmarkIcon,
    tone: 'bg-primary/10 text-primary',
    accountTypes: ['checking', 'savings', 'meal_voucher', ...INVESTMENTS],
  },
  owed: {
    type: 'owed',
    name: 'Argent dû',
    icon: ArrowLeftRightIcon,
    tone: 'bg-chart-delta-good/15 text-chart-delta-good',
  },
  envelopes: {
    type: 'envelopes',
    name: 'Enveloppes',
    icon: PiggyBankIcon,
    tone: 'bg-chart-3/15 text-chart-3',
    envelopes: true,
  },
  investments: {
    type: 'investments',
    name: 'Placements',
    icon: ChartCandlestickIcon,
    tone: 'bg-chart-7/15 text-chart-7',
    accountTypes: INVESTMENTS,
  },
}

export const CATALOGUE_ORDER: DashboardWidgetType[] = [
  'todo',
  'left_to_spend',
  'tracked_budgets',
  'month_flows',
  'upcoming_debits',
  'forecast',
  'balances',
  'net_worth',
  'owed',
  'envelopes',
  'investments',
]

/** A new element as the catalogue adds it: all accounts. */
export function newElement(type: DashboardWidgetType): DashboardWidgetDto {
  return {
    type,
    hidden: false,
    accountIds: null,
    envelopeIds: null,
    settings: {},
  }
}
