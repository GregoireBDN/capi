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

/**
 * Money paid into an investment account (positive) or taken out of it
 * (negative) by a transfer linked to it (#296), on its booking day.
 */
export interface LinkedFlow {
  date: string
  amountCents: number
}

/** Where `contributionsCents` comes from. */
export type ContributionsSource = 'links' | 'typed'

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
  /**
   * `links`: the transfers linked to the account (on top of the contributions
   * typed before the first of them); `typed`: typed on the snapshots.
   */
  contributionsSource: ContributionsSource | null
  /**
   * Latest contributions typed on a snapshot, when the linked transfers
   * replace them and they disagree; null otherwise.
   */
  typedContributionsCents: number | null
  /** Transfers linked to the account. */
  linkedTransfersCount: number
  /** Net amount transferred after the latest value: not in it yet. */
  linkedAfterValueCents: number
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
 * Contributions of each snapshot from the transfers linked to the account
 * (#296): those typed on the last snapshot before the first transfer (0
 * without one), plus the transfers booked after that snapshot up to the
 * snapshot's day. Snapshots before the first transfer keep what was typed:
 * the linked history only starts with the bank data. Null without flows.
 *
 * For crypto the flows are the cost of the coins withdrawn to it from an
 * exchange (a Ledger fed by Binance), with no typed base: the invested
 * amounts of its holdings are not dated.
 */
export function linkedContributions(
  snapshots: readonly SnapshotPoint[],
  flows: readonly LinkedFlow[],
  type: AccountType,
): SnapshotPoint[] | null {
  if (flows.length === 0) return null
  const ordered = [...flows].sort((a, b) => a.date.localeCompare(b.date))
  const first = ordered[0].date
  const base = findLast(
    snapshots,
    (snapshot) => snapshot.date < first && snapshot.contributionsCents !== null,
  )
  const crypto = type === 'crypto'
  const baseCents = crypto ? 0 : (base?.contributionsCents ?? 0)
  const after = crypto ? '' : (base?.date ?? '')
  return snapshots.map((snapshot) => {
    if (snapshot.date < first) return snapshot
    let contributionsCents = baseCents
    for (const flow of ordered) {
      if (flow.date > snapshot.date) break
      if (flow.date > after) contributionsCents += flow.amountCents
    }
    return { ...snapshot, contributionsCents }
  })
}

/**
 * Value, contributions, gain and changes of an account from its snapshots
 * (sorted by date, ascending), as of the calendar day `today`. With
 * transfers linked to it (`flows`), its contributions come from them
 * (`linkedContributions`): euros for a PEA, the cost of the coins received
 * for a wallet.
 */
export function computePerformance(
  typed: readonly SnapshotPoint[],
  type: AccountType,
  today: string,
  flows: readonly LinkedFlow[] = [],
): Performance {
  const staleAfterDays = STALE_AFTER_DAYS[type]
  const linked = linkedContributions(typed, flows, type)
  const snapshots = linked ?? typed
  const latest = snapshots.at(-1)
  const linkedTransfersCount = linked ? flows.length : 0
  const firstFlow = linked
    ? flows.reduce((min, flow) => (flow.date < min ? flow.date : min), '9999')
    : null
  if (!latest) {
    return {
      valueCents: null,
      valueDate: null,
      contributionsCents: null,
      contributionsDate: null,
      contributionsSource: null,
      typedContributionsCents: null,
      linkedTransfersCount,
      linkedAfterValueCents: 0,
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
  // Typed since the first transfer: what the links are compared with.
  const typedLatest = findLast(
    typed,
    (snapshot) =>
      snapshot.contributionsCents !== null && snapshot.date >= firstFlow!,
  )?.contributionsCents
  const typedContributionsCents =
    linked && typedLatest != null && typedLatest !== contributionsCents
      ? typedLatest
      : null
  const linkedAfterValueCents = linked
    ? flows
        .filter((flow) => flow.date > latest.date)
        .reduce((sum, flow) => sum + flow.amountCents, 0)
    : 0

  const previous = snapshots.at(-2)
  const yearAgo = oneYearBefore(latest.date)
  const reference = findLast(snapshots, (snapshot) => snapshot.date <= yearAgo)
  const daysSinceLatest = daysBetween(latest.date, today)

  return {
    valueCents: latest.valueCents,
    valueDate: latest.date,
    contributionsCents,
    contributionsDate: withContributions?.date ?? null,
    contributionsSource:
      contributionsCents === null
        ? null
        : linked && withContributions!.date >= firstFlow!
          ? 'links'
          : 'typed',
    typedContributionsCents,
    linkedTransfersCount,
    linkedAfterValueCents,
    gainCents,
    returnRate: simpleReturn(gainCents, contributionsCents),
    sincePrevious: previous ? change(previous, latest) : null,
    sinceOneYear: reference ? change(reference, latest) : null,
    daysSinceLatest,
    staleAfterDays,
    stale: daysSinceLatest > staleAfterDays,
  }
}
