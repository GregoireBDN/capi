import type { AccountType } from '#/database/schema/domain-enums'
import { daysBetween, oneYearBefore } from './days'

/** One dated value of an account, as the performance needs it. */
export interface SnapshotPoint {
  date: string
  valueCents: number
  contributionsCents: number | null
}

/**
 * Days after which the latest value is considered out of date, by account
 * type. The owner updates every account once a month, so a PEA, a life
 * insurance or employee savings value older than a month (31 days) is due;
 * cash accounts and crypto (valued from holdings) get a few days more.
 */
export const STALE_AFTER_DAYS: Record<AccountType, number> = {
  checking: 45,
  savings: 45,
  brokerage: 31,
  life_insurance: 31,
  employee_savings: 31,
  crypto: 35,
  meal_voucher: 45,
}

export interface ValueChange {
  /** Date of the snapshot the latest value is compared with. */
  fromDate: string
  fromValueCents: number
  changeCents: number
  /** `changeCents / fromValueCents`, null when the earlier value is 0. */
  changeRate: number | null
  /**
   * Net contributions added between the two snapshots, null unless both
   * snapshots carry contributions. `changeCents` minus this is the market
   * gain of the period.
   */
  contributionsChangeCents: number | null
}

export interface Performance {
  valueCents: number | null
  valueDate: string | null
  /** Latest known net contributions, possibly from an earlier snapshot. */
  contributionsCents: number | null
  /** Date of the snapshot the contributions come from. */
  contributionsDate: string | null
  gainCents: number | null
  /** `gainCents / contributionsCents`, null when contributions are not positive. */
  returnRate: number | null
  sincePrevious: ValueChange | null
  sinceOneYear: ValueChange | null
  daysSinceLatest: number | null
  staleAfterDays: number
  stale: boolean
}

/** `gain / contributions`, null when contributions are unknown or not positive. */
export function simpleReturn(
  gainCents: number | null,
  contributionsCents: number | null,
): number | null {
  if (gainCents === null || contributionsCents === null) return null
  return contributionsCents > 0 ? gainCents / contributionsCents : null
}

/** The last element matching `predicate` (`Array#findLast` is ES2023). */
function findLast<T>(items: readonly T[], predicate: (item: T) => boolean) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (predicate(items[i])) return items[i]
  }
  return undefined
}

function change(from: SnapshotPoint, to: SnapshotPoint): ValueChange {
  const changeCents = to.valueCents - from.valueCents
  return {
    fromDate: from.date,
    fromValueCents: from.valueCents,
    changeCents,
    changeRate: from.valueCents === 0 ? null : changeCents / from.valueCents,
    contributionsChangeCents:
      from.contributionsCents === null || to.contributionsCents === null
        ? null
        : to.contributionsCents - from.contributionsCents,
  }
}

/**
 * Value, contributions, gain and changes of an account from its snapshots
 * (sorted by date, ascending), as of the calendar day `today`.
 */
export function computePerformance(
  snapshots: readonly SnapshotPoint[],
  type: AccountType,
  today: string,
): Performance {
  const staleAfterDays = STALE_AFTER_DAYS[type]
  const latest = snapshots.at(-1)
  if (!latest) {
    return {
      valueCents: null,
      valueDate: null,
      contributionsCents: null,
      contributionsDate: null,
      gainCents: null,
      returnRate: null,
      sincePrevious: null,
      sinceOneYear: null,
      daysSinceLatest: null,
      staleAfterDays,
      stale: false,
    }
  }

  // Crypto values come from holdings, valued daily with their invested
  // amounts: contributions from an earlier day may predate assets added
  // since, so only those of the latest snapshot count.
  const withContributions =
    type === 'crypto'
      ? latest.contributionsCents === null
        ? undefined
        : latest
      : findLast(snapshots, (snapshot) => snapshot.contributionsCents !== null)
  const contributionsCents = withContributions?.contributionsCents ?? null
  const gainCents =
    contributionsCents === null ? null : latest.valueCents - contributionsCents

  const previous = snapshots.at(-2)
  const yearAgo = oneYearBefore(latest.date)
  const reference = findLast(snapshots, (snapshot) => snapshot.date <= yearAgo)
  const daysSinceLatest = daysBetween(latest.date, today)

  return {
    valueCents: latest.valueCents,
    valueDate: latest.date,
    contributionsCents,
    contributionsDate: withContributions?.date ?? null,
    gainCents,
    returnRate: simpleReturn(gainCents, contributionsCents),
    sincePrevious: previous ? change(previous, latest) : null,
    sinceOneYear: reference ? change(reference, latest) : null,
    daysSinceLatest,
    staleAfterDays,
    stale: daysSinceLatest > staleAfterDays,
  }
}
