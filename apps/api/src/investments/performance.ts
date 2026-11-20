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
 * (negative) by a bank transfer linked to it (#296), on its booking day.
 */
export interface LinkedFlow {
  date: string
  amountCents: number | null
}

/**
 * What the owner invested in an account up to a day (« Investi au … »),
 * typed by hand: a PEA, a life insurance or employee savings (#360). Never a
 * crypto account, whose cost follows its coins (#373).
 */
export interface InvestedBase {
  cents: number
  on: string
}

/** Types whose invested amount is typed as a base (#360). */
export const INVESTED_BASE_TYPES: readonly AccountType[] = [
  'brokerage',
  'life_insurance',
  'employee_savings',
]

/**
 * Whether the account takes an invested base: a PEA, a life insurance or
 * employee savings. Not a crypto account (#373: the replay of its coins and
 * the owner's answers per movement), nor a cash account.
 */
export function takesInvestedBase(account: { type: AccountType }): boolean {
  return INVESTED_BASE_TYPES.includes(account.type)
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
 * Where an invested amount comes from: `base`, the account's invested base
 * plus the transfers linked after it; `typed`, the contributions typed on a
 * value plus the transfers linked after it; `links`, the transfers linked to
 * it alone; `coins`, a crypto account's coins at their cost (#373).
 */
export type ContributionsSource = 'links' | 'typed' | 'base' | 'coins'

/** What an account had invested at the end of a day. */
export interface InvestedAt {
  investedCents: number
  source: ContributionsSource
  /** The day of the typed point it starts from (base or value), if any. */
  since: string | null
  /** Linked transfers counted after that point. */
  linkedCount: number
  /** Linked transfers of unknown amount, left out. */
  unknownCostCount: number
}

/**
 * The one rule of an investment account's invested amount (#370, ADR 0005
 * R2), crypto aside: the latest typed point on or before `day` (the
 * account's base, or the contributions typed on a value, whichever is later;
 * the base on the same day) plus the transfers linked after it up to `day`;
 * without a typed point, the transfers linked so far; null with neither.
 * `typed` holds the values as typed (oldest first): their contributions are
 * never computed.
 */
export function investedAt(
  typed: readonly SnapshotPoint[],
  base: InvestedBase | null,
  flows: readonly LinkedFlow[],
  day: string,
): InvestedAt | null {
  const point = findLast(
    typed,
    (snapshot) => snapshot.date <= day && snapshot.contributionsCents !== null,
  )
  let anchor: { date: string; cents: number; source: 'base' | 'typed' } | null =
    null
  if (base !== null && base.on <= day && (!point || base.on >= point.date)) {
    anchor = { date: base.on, cents: base.cents, source: 'base' }
  } else if (point) {
    anchor = {
      date: point.date,
      cents: point.contributionsCents!,
      source: 'typed',
    }
  }
  const after = anchor?.date ?? ''
  const counted = flows.filter((flow) => flow.date > after && flow.date <= day)
  if (!anchor && counted.length === 0) return null
  let investedCents = anchor?.cents ?? 0
  let linkedCount = 0
  for (const flow of counted) {
    if (flow.amountCents === null) continue
    investedCents += flow.amountCents
    linkedCount++
  }
  return {
    investedCents,
    source: anchor?.source ?? 'links',
    since: anchor?.date ?? null,
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
  /** What was invested as of the latest value (`investedAt`). */
  contributionsCents: number | null
  /**
   * The day it is counted from: its typed point (base or value), else the
   * latest value's day.
   */
  contributionsDate: string | null
  contributionsSource: ContributionsSource | null
  /** Transfers linked after its typed point (or all of them). */
  linkedTransfersCount: number
  /** Linked transfers of unknown amount, left out. */
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

/** What was invested at a day: `investedAt`, or a crypto account's replay. */
export type InvestedOn = (day: string) => InvestedAt | null

/** The rule of `investedAt` for an account, with its inputs. */
export function investedOn(
  typed: readonly SnapshotPoint[],
  base: InvestedBase | null,
  flows: readonly LinkedFlow[],
): InvestedOn {
  const ordered = [...flows].sort((a, b) => a.date.localeCompare(b.date))
  return (day) => investedAt(typed, base, ordered, day)
}

/** Each value with what was invested on its day. */
export function withInvested(
  snapshots: readonly SnapshotPoint[],
  invested: InvestedOn,
): SnapshotPoint[] {
  return snapshots.map((snapshot) => ({
    ...snapshot,
    contributionsCents: invested(snapshot.date)?.investedCents ?? null,
  }))
}

/**
 * Value, invested amount, gain and changes of an account from its values
 * (sorted by date, ascending), as of the calendar day `today`. What was
 * invested comes from `invested` (`investedOn`, or a crypto account's
 * replay), as of the latest value, or as of today when the account's base
 * is dated after it; `flows` are the bank transfers linked to it.
 */
export function computePerformance(
  snapshots: readonly SnapshotPoint[],
  type: AccountType,
  today: string,
  invested: InvestedOn,
  flows: readonly LinkedFlow[] = [],
  base: InvestedBase | null = null,
): Performance {
  const staleAfterDays = STALE_AFTER_DAYS[type]
  const points = withInvested(snapshots, invested)
  const latest = points.at(-1)
  const asOf =
    latest && !(base !== null && latest.date < base.on) ? latest.date : today
  const figures = invested(asOf)
  const contributionsCents = latest ? (figures?.investedCents ?? null) : null
  const common = {
    contributionsCents,
    contributionsDate: figures && latest ? (figures.since ?? asOf) : null,
    contributionsSource: latest ? (figures?.source ?? null) : null,
    linkedTransfersCount: figures?.linkedCount ?? 0,
    unknownCostCount: figures?.unknownCostCount ?? 0,
  }
  if (!latest) {
    return {
      valueCents: null,
      valueDate: null,
      ...common,
      contributionsCents: null,
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

  const gainCents =
    contributionsCents === null ? null : latest.valueCents - contributionsCents
  const after = [latest.date, figures?.since ?? ''].sort().at(-1)!
  const linkedAfterValueCents = flows
    .filter((flow) => flow.date > after)
    .reduce((sum, flow) => sum + (flow.amountCents ?? 0), 0)

  const previous = points.at(-2)
  const yearAgo = oneYearBefore(latest.date)
  const reference = findLast(points, (snapshot) => snapshot.date <= yearAgo)
  const daysSinceLatest = daysBetween(latest.date, today)

  return {
    valueCents: latest.valueCents,
    valueDate: latest.date,
    ...common,
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
