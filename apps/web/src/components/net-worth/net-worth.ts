/**
 * Net worth page logic, kept apart from the components so it is unit
 * tested: which month ends the chart shows, the deltas of a month end and
 * its breakdown by account type. Amounts are integer cents; months are
 * `YYYY-MM` calendar months, compared as strings.
 */

import type {
  AccountType,
  DashboardAccountDto,
  HistoryMonthDto,
} from '#/api/types.gen'
import { ACCOUNT_TYPE_LABELS } from '#/components/dashboard/labels'
import { shiftMonth } from '#/lib/calendar'

/** Months of history fetched by the page: the API maximum (five years). */
export const NET_WORTH_HISTORY_MONTHS = 60

export const NET_WORTH_PERIODS = ['6m', '12m', 'all'] as const
export type NetWorthPeriod = (typeof NET_WORTH_PERIODS)[number]
export const DEFAULT_NET_WORTH_PERIOD: NetWorthPeriod = '12m'

export const NET_WORTH_PERIOD_LABELS: Record<NetWorthPeriod, string> = {
  '6m': '6 mois',
  '12m': '12 mois',
  all: 'Tout',
}

const PERIOD_MONTHS: Record<NetWorthPeriod, number | null> = {
  '6m': 6,
  '12m': 12,
  all: null,
}

/** A month end with a known net worth. */
export type NetWorthPoint = HistoryMonthDto & { netWorthCents: number }

function isKnown(month: HistoryMonthDto): month is NetWorthPoint {
  return month.netWorthCents !== null
}

/**
 * Month ends plotted for `period`, oldest first: up to `lastMonth` (the
 * month the data stops in, so an empty current month is never shown), from
 * the first month with a known net worth, the last 6 or 12 of them or all.
 */
export function netWorthSeries(
  months: HistoryMonthDto[],
  lastMonth: string,
  period: NetWorthPeriod,
): NetWorthPoint[] {
  const known = months
    .filter((month) => month.month <= lastMonth)
    .filter(isKnown)
  const count = PERIOD_MONTHS[period]
  return count === null ? known : known.slice(-count)
}

/** Net worth at the end of `month`, or null when unknown or not fetched. */
export function netWorthAt(
  months: HistoryMonthDto[],
  month: string,
): number | null {
  return months.find((item) => item.month === month)?.netWorthCents ?? null
}

export type NetWorthDeltaKey = 'month' | 'year' | 'yearStart'

export interface NetWorthDelta {
  key: NetWorthDeltaKey
  /** Month end compared with (`YYYY-MM`). */
  since: string
  /** Change since that month end, or null when its net worth is unknown. */
  cents: number | null
}

/**
 * Change of the net worth at the end of `month` over 1 month, 12 months and
 * since the start of its year (the end of the previous December). The start
 * of the year is left out in January, where it is the 1-month change.
 */
export function netWorthDeltas(
  months: HistoryMonthDto[],
  month: string,
): NetWorthDelta[] {
  const current = netWorthAt(months, month)
  const delta = (key: NetWorthDeltaKey, since: string): NetWorthDelta => {
    const before = netWorthAt(months, since)
    return {
      key,
      since,
      cents: current === null || before === null ? null : current - before,
    }
  }
  const deltas = [
    delta('month', shiftMonth(month, -1)),
    delta('year', shiftMonth(month, -12)),
  ]
  const yearStart = `${Number(month.slice(0, 4)) - 1}-12`
  if (yearStart !== shiftMonth(month, -1)) {
    deltas.push(delta('yearStart', yearStart))
  }
  return deltas
}

export interface BreakdownAccount {
  accountId: string
  /** From the accounts list; null for an account it does not have. */
  account: DashboardAccountDto | null
  balanceCents: number
}

export interface TypeBreakdown {
  type: AccountType
  label: string
  totalCents: number
  accounts: BreakdownAccount[]
}

const TYPE_ORDER = Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]

/**
 * Net worth at a month end by account type (checking, savings, PEA, life
 * insurance, employee savings, crypto, in that order), each with its
 * accounts in display order. Types without a balance are left out. The
 * totals add up to the month's `netWorthCents`: they split the same
 * per-account balances.
 */
export function breakdownByType(
  month: HistoryMonthDto,
  accounts: DashboardAccountDto[],
): TypeBreakdown[] {
  const byId = new Map(accounts.map((account) => [account.id, account]))
  return TYPE_ORDER.flatMap((type) => {
    const items = month.accounts
      .filter((balance) => balance.type === type)
      .map((balance) => ({
        accountId: balance.accountId,
        account: byId.get(balance.accountId) ?? null,
        balanceCents: balance.balanceCents,
      }))
    if (items.length === 0) return []
    return [
      {
        type,
        label: ACCOUNT_TYPE_LABELS[type],
        totalCents: items.reduce((sum, item) => sum + item.balanceCents, 0),
        accounts: items,
      },
    ]
  })
}

/**
 * Share of each type in the positive total (a negative type, e.g. an
 * overdrawn checking account, gets 0), between 0 and 1.
 */
export function typeShare(
  breakdown: TypeBreakdown[],
  type: TypeBreakdown,
): number {
  const positive = breakdown.reduce(
    (sum, item) => sum + Math.max(0, item.totalCents),
    0,
  )
  return positive > 0 ? Math.max(0, type.totalCents) / positive : 0
}
