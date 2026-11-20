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
 * (negative) by a transfer linked to it (#296), on its booking day. For a
 * crypto account, the cost of the coins withdrawn to it from an exchange:
 * null when the export could not give it (#358).
 */
export interface LinkedFlow {
  date: string
  amountCents: number | null
}

/**
 * What the owner invested in an account up to a day (« Investi au … »), typed
 * by hand: a wallet or manual crypto account (#358), a PEA, a life insurance
 * or employee savings (#360). Never an exchange, whose holdings carry their
 * cost.
 */
export interface InvestedBase {
  cents: number
  on: string
}

/** Types whose invested amount is typed as a base (#360), crypto aside. */
export const INVESTED_BASE_TYPES: readonly AccountType[] = [
  'brokerage',
  'life_insurance',
  'employee_savings',
]

/**
 * Whether the account takes an invested base: a PEA, a life insurance,
 * employee savings, or a wallet or manual crypto account (#358). Not an
 * exchange, whose holdings carry their cost, nor a cash account.
 */
export function takesInvestedBase(account: {
  type: AccountType
  cryptoSource: string | null
}): boolean {
  return account.type === 'crypto'
    ? account.cryptoSource !== 'exchange'
    : INVESTED_BASE_TYPES.includes(account.type)
}

/** The account's invested base, when it has one. */
export function investedBaseOf(account: {
  investedBaseCents: number | null
  investedBaseOn: string | null
}): InvestedBase | null {
  return account.investedBaseCents === null || account.investedBaseOn === null
    ? null
    : { cents: account.investedBaseCents, on: account.investedBaseOn }
}

/**
 * Where `contributionsCents` comes from: `links`, the transfers linked to the
 * account; `typed`, typed on the snapshots; `base`, the account's invested
 * base plus what was linked to it since (transfers, or coins for crypto).
 */
export type ContributionsSource = 'links' | 'typed' | 'base'

export interface InvestedAt {
  investedCents: number
  /** Linked movements whose cost is counted. */
  linkedCount: number
  /** Linked movements counted as 0: their cost is unknown. */
  unknownCostCount: number
}

/**
 * What an account had invested at the end of `day` (#358, #360): its base
 * plus what was linked to it after the base's day (transfers, or the cost of
 * coins for crypto), or, before the base's day or without one, what was
 * linked to it so far (null when nothing was). A movement of unknown cost is
 * left out and counted, so the others still count.
 */
export function investedAt(
  base: InvestedBase | null,
  flows: readonly LinkedFlow[],
  day: string,
): InvestedAt | null {
  const fromBase = base !== null && base.on <= day
  const after = fromBase ? base.on : ''
  const counted = flows.filter((flow) => flow.date > after && flow.date <= day)
  if (!fromBase && counted.length === 0) return null
  let investedCents = fromBase ? base.cents : 0
  let linkedCount = 0
  for (const flow of counted) {
    if (flow.amountCents === null) continue
    investedCents += flow.amountCents
    linkedCount++
  }
  return {
    investedCents,
    linkedCount,
    unknownCostCount: counted.length - linkedCount,
  }
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
  /**
   * Transfers linked to the account; for crypto, the linked movements whose
   * cost is counted (after the base's day when it has one).
   */
  linkedTransfersCount: number
  /**
   * Crypto only (#358): linked movements counted at 0 because their cost is
   * unknown (« dont 2 envois sans coût connu »).
   */
  unknownCostCount: number
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
 * exchange (a Ledger fed by Binance); the base is the invested base typed on
 * the account (#358, `investedAt`), never a snapshot's: the invested
 * amounts of its holdings are not dated. Before the base's day, the coins
 * linked so far; snapshots before any keep what they hold. Any other account
 * with a base (#360) takes it from its day on. Null without a base or
 * flows.
 */
export function linkedContributions(
  snapshots: readonly SnapshotPoint[],
  flows: readonly LinkedFlow[],
  type: AccountType,
  investedBase: InvestedBase | null = null,
): SnapshotPoint[] | null {
  const base = investedBase
  if (flows.length === 0 && base === null) return null
  const ordered = [...flows].sort((a, b) => a.date.localeCompare(b.date))
  if (type === 'crypto') {
    return snapshots.map((snapshot) => {
      const invested = investedAt(base, ordered, snapshot.date)
      return invested
        ? { ...snapshot, contributionsCents: invested.investedCents }
        : snapshot
    })
  }
  // A PEA's base (#360) wins from its day: the base plus the transfers
  // linked after it. Before it, what was typed and linked as without one.
  const before = ordered.length > 0 ? typedThenLinked(snapshots, ordered) : null
  return snapshots.map((snapshot, i) => {
    if (base !== null && snapshot.date >= base.on) {
      return {
        ...snapshot,
        contributionsCents: investedAt(base, ordered, snapshot.date)!
          .investedCents,
      }
    }
    return before ? before[i] : snapshot
  })
}

/**
 * The contributions typed on the last snapshot before the first transfer (0
 * without one), plus the transfers booked after that snapshot up to each
 * snapshot's day; snapshots before the first transfer keep what was typed.
 */
function typedThenLinked(
  snapshots: readonly SnapshotPoint[],
  ordered: readonly LinkedFlow[],
): SnapshotPoint[] {
  const first = ordered[0].date
  const typedBase = findLast(
    snapshots,
    (snapshot) => snapshot.date < first && snapshot.contributionsCents !== null,
  )
  const baseCents = typedBase?.contributionsCents ?? 0
  const after = typedBase?.date ?? ''
  return snapshots.map((snapshot) => {
    if (snapshot.date < first) return snapshot
    let contributionsCents = baseCents
    for (const flow of ordered) {
      if (flow.date > snapshot.date) break
      if (flow.date > after) contributionsCents += flow.amountCents ?? 0
    }
    return { ...snapshot, contributionsCents }
  })
}

/**
 * Value, contributions, gain and changes of an account from its snapshots
 * (sorted by date, ascending), as of the calendar day `today`. With
 * transfers linked to it (`flows`), its contributions come from them
 * (`linkedContributions`): euros for a PEA, the cost of the coins received
 * for a wallet, on top of the crypto account's invested base (#358).
 */
export function computePerformance(
  typed: readonly SnapshotPoint[],
  type: AccountType,
  today: string,
  flows: readonly LinkedFlow[] = [],
  investedBase: InvestedBase | null = null,
): Performance {
  const crypto = type === 'crypto'
  const base = investedBase
  const staleAfterDays = STALE_AFTER_DAYS[type]
  const linked = linkedContributions(typed, flows, type, base)
  const snapshots = linked ?? typed
  const latest = snapshots.at(-1)
  // What the base and the movements give as of today (the latest value may
  // predate the base's day): crypto, or any account with a base.
  const invested =
    crypto || base !== null ? investedAt(base, flows, today) : null
  const linkedTransfersCount = !linked
    ? 0
    : crypto || base !== null
      ? (invested?.linkedCount ?? 0)
      : flows.length
  const unknownCostCount = invested?.unknownCostCount ?? 0
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
      unknownCostCount,
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
  // since, so only those of the latest snapshot count. With a base dated
  // after the latest value, the base (and what was linked since) counts.
  let withContributions:
    | { date: string; contributionsCents: number | null }
    | undefined
  if (base !== null && latest.date < base.on) {
    withContributions = {
      date: base.on,
      contributionsCents: invested!.investedCents,
    }
  } else if (crypto) {
    if (latest.contributionsCents !== null) withContributions = latest
  } else {
    withContributions = findLast(
      snapshots,
      (snapshot) => snapshot.contributionsCents !== null,
    )
  }
  const contributionsCents = withContributions?.contributionsCents ?? null
  const gainCents =
    contributionsCents === null ? null : latest.valueCents - contributionsCents
  // Typed since the first transfer: what the links are compared with.
  const typedLatest =
    base === null
      ? findLast(
          typed,
          (snapshot) =>
            snapshot.contributionsCents !== null && snapshot.date >= firstFlow!,
        )?.contributionsCents
      : null
  const typedContributionsCents =
    linked && typedLatest != null && typedLatest !== contributionsCents
      ? typedLatest
      : null
  const linkedAfterValueCents = linked
    ? flows
        .filter(
          (flow) =>
            flow.date > latest.date && (base === null || flow.date > base.on),
        )
        .reduce((sum, flow) => sum + (flow.amountCents ?? 0), 0)
    : 0

  const previous = snapshots.at(-2)
  const yearAgo = oneYearBefore(latest.date)
  const reference = findLast(snapshots, (snapshot) => snapshot.date <= yearAgo)
  const daysSinceLatest = daysBetween(latest.date, today)

  let contributionsSource: ContributionsSource | null = null
  if (contributionsCents !== null) {
    if (base !== null && withContributions!.date >= base.on) {
      contributionsSource = 'base'
    } else if (linked && withContributions!.date >= firstFlow!) {
      contributionsSource = 'links'
    } else contributionsSource = 'typed'
  }

  return {
    valueCents: latest.valueCents,
    valueDate: latest.date,
    contributionsCents,
    contributionsDate: withContributions?.date ?? null,
    contributionsSource,
    typedContributionsCents,
    linkedTransfersCount,
    unknownCostCount,
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
