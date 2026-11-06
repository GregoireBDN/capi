import type {
  RecurringAmountType,
  RecurringCadence,
  RecurringDirection,
  TransactionKind,
} from '#/database/schema/domain-enums'
import { RECURRING_CADENCES } from '#/database/schema/domain-enums'
import { normalizeLabel } from '#/imports/normalize/label'
import {
  addDays,
  addMonths,
  dayOfMonth,
  daysBetween,
  isLastDayOfMonth,
  maxDate,
  minDate,
} from './dates'

/**
 * Detection of recurring transactions (subscriptions, rent, salary, ...).
 *
 * Pure functions only: no I/O, no Nest, no logging (labels and amounts are
 * private data). Amounts are integer cents; inside a series they are
 * positive and the series' `direction` carries the sign. Dates are
 * `YYYY-MM-DD` calendar dates (see `dates.ts`).
 *
 * Transactions are grouped by account + merchant key (from the label
 * normalizer) + direction. In each group, the detector looks for the longest
 * run of most recent occurrences that follows a cadence, tolerating a few
 * days of drift, one missed occurrence and one extra charge, then scores it.
 */

interface CadenceSpec {
  /** Average period in days. */
  days: number
  /** Period in calendar months (0 for weekly). */
  months: number
  /** Accepted drift of an occurrence, in days. */
  toleranceDays: number
  /** Occurrences per year, for the yearly and monthly-equivalent costs. */
  perYear: number
  /** Occurrences needed before a series is suggested. */
  minOccurrences: number
  /** Highest relative spread (median absolute deviation / median) of a variable amount. */
  maxSpread: number
}

export const CADENCE_SPECS: Record<RecurringCadence, CadenceSpec> = {
  weekly: {
    days: 7,
    months: 0,
    toleranceDays: 2,
    perYear: 52,
    minOccurrences: 3,
    maxSpread: 0.15,
  },
  monthly: {
    days: 30.44,
    months: 1,
    toleranceDays: 4,
    perYear: 12,
    minOccurrences: 3,
    maxSpread: 0.35,
  },
  quarterly: {
    days: 91.31,
    months: 3,
    toleranceDays: 7,
    perYear: 4,
    minOccurrences: 3,
    maxSpread: 0.35,
  },
  yearly: {
    days: 365.25,
    months: 12,
    toleranceDays: 10,
    perYear: 1,
    minOccurrences: 2,
    maxSpread: 0.35,
  },
}

/** Series below this confidence are not suggested. */
export const MIN_CONFIDENCE = 0.3
/** A series is inactive after this many periods without an occurrence. */
export const STALE_PERIODS = 1.5

/** The transaction fields the detector reads. */
export interface RecurringTransaction {
  id: string
  accountId: string
  bookingDate: string
  /** Signed cents (negative = money out). */
  amountCents: number
  rawLabel: string
  merchant: string | null
  kind: TransactionKind
  categoryId: string | null
  isOneOff: boolean
}

export interface Occurrence {
  transactionId: string
  date: string
  /** Positive cents. */
  amountCents: number
  /** Stored merchant, or the one derived from the label. */
  merchant: string | null
  categoryId: string | null
}

export interface TransactionGroup {
  key: string
  accountId: string
  merchantKey: string
  direction: RecurringDirection
  /** Oldest first. */
  occurrences: Occurrence[]
}

export interface SeriesStats {
  cadence: RecurringCadence
  /** The occurrences of the series, oldest first. */
  occurrences: Occurrence[]
  firstDate: string
  lastDate: string
  nextExpectedDate: string
  active: boolean
  amountType: RecurringAmountType
  /** Current price (fixed) or median of the recent amounts (variable). */
  typicalAmountCents: number
  latestAmountCents: number
  minAmountCents: number
  maxAmountCents: number
  /** Price before the latest change (fixed amounts only). */
  previousAmountCents: number | null
  /** Current price − previous price, null without a change. */
  priceChangeCents: number | null
  /** First occurrence at the current price. */
  priceChangedOn: string | null
  missedCount: number
  /** Median absolute deviation / median of the amounts. */
  amountSpread: number
  regularity: number
  amountStability: number
  recency: number
  /** regularity × amount stability × recency, in [0, 1], two decimals. */
  confidence: number
}

export interface DetectedSeries extends SeriesStats {
  key: string
  accountId: string
  merchantKey: string
  direction: RecurringDirection
  displayName: string
  /** Most frequent category of the occurrences. */
  categoryId: string | null
}

// --- Grouping ---------------------------------------------------------------

export function seriesKey(
  accountId: string,
  merchantKey: string,
  direction: RecurringDirection,
): string {
  return `${accountId}|${direction}|${merchantKey}`
}

/** Transfers between own accounts and one-offs never make a series. */
export function isEligible(transaction: RecurringTransaction): boolean {
  return (
    transaction.kind !== 'transfer' &&
    !transaction.isOneOff &&
    transaction.amountCents !== 0
  )
}

/**
 * Eligible transactions by account + merchant key + direction, occurrences
 * oldest first. Transactions without a merchant key are left out.
 */
export function groupTransactions(
  transactions: readonly RecurringTransaction[],
): Map<string, TransactionGroup> {
  const groups = new Map<string, TransactionGroup>()
  for (const transaction of transactions) {
    if (!isEligible(transaction)) continue
    const normalized = normalizeLabel(
      transaction.rawLabel,
      transaction.amountCents,
    )
    if (!normalized.merchantKey) continue
    const direction: RecurringDirection =
      transaction.amountCents < 0 ? 'debit' : 'credit'
    const key = seriesKey(
      transaction.accountId,
      normalized.merchantKey,
      direction,
    )
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        accountId: transaction.accountId,
        merchantKey: normalized.merchantKey,
        direction,
        occurrences: [],
      }
      groups.set(key, group)
    }
    group.occurrences.push({
      transactionId: transaction.id,
      date: transaction.bookingDate,
      amountCents: Math.abs(transaction.amountCents),
      merchant: transaction.merchant ?? normalized.merchant,
      categoryId: transaction.categoryId,
    })
  }
  for (const group of groups.values()) {
    group.occurrences.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.transactionId.localeCompare(b.transactionId),
    )
  }
  return groups
}

/**
 * Date of the latest transaction of each account (any kind), capped at
 * `today`: series are judged stale against the data actually imported, not
 * against a calendar the imports have not reached yet.
 */
export function accountHorizons(
  transactions: readonly RecurringTransaction[],
  today: string,
): Map<string, string> {
  const horizons = new Map<string, string>()
  for (const { accountId, bookingDate } of transactions) {
    const current = horizons.get(accountId)
    horizons.set(
      accountId,
      current ? maxDate(current, bookingDate) : bookingDate,
    )
  }
  for (const [accountId, date] of horizons) {
    horizons.set(accountId, minDate(date, today))
  }
  return horizons
}

// --- Cadence fitting --------------------------------------------------------

interface Fit {
  run: Occurrence[]
  /** Drift of each interval of the run, in days. */
  errors: number[]
  missed: number
  extras: number
}

/** Missed (or extra) occurrences accepted in a run of `length`. */
function allowance(length: number): number {
  return 1 + Math.floor(length / 12)
}

/** Drift, in days, of `next` from `previous` + `periods` periods. */
function drift(
  previous: string,
  next: string,
  cadence: RecurringCadence,
  periods: number,
): number {
  const spec = CADENCE_SPECS[cadence]
  if (spec.months === 0) {
    return Math.abs(daysBetween(previous, next) - spec.days * periods)
  }
  const months = spec.months * periods
  const candidates = [addMonths(previous, months)]
  // Month-end dates stay at month end: Jan 31 → Feb 28 → Mar 31.
  if (isLastDayOfMonth(previous))
    candidates.push(addMonths(previous, months, 31))
  return Math.min(
    ...candidates.map((expected) => Math.abs(daysBetween(expected, next))),
  )
}

/**
 * Longest run of the most recent occurrences that follows `cadence`: walks
 * back from the latest one while each interval is one period (or two, a
 * missed occurrence) within the tolerance. An occurrence too close to the
 * next one is an extra charge, left out of the run.
 */
function fitRun(
  occurrences: readonly Occurrence[],
  cadence: RecurringCadence,
): Fit {
  const spec = CADENCE_SPECS[cadence]
  const last = occurrences.at(-1)!
  const run = [last]
  const errors: number[] = []
  let reference = last
  let missed = 0
  let extras = 0
  for (let i = occurrences.length - 2; i >= 0; i--) {
    const occurrence = occurrences[i]
    const periods = Math.round(
      daysBetween(occurrence.date, reference.date) / spec.days,
    )
    if (periods < 1) {
      if (extras >= allowance(run.length)) break
      extras++
      continue
    }
    if (periods > 2) break
    const error = drift(occurrence.date, reference.date, cadence, periods)
    if (error > spec.toleranceDays) break
    if (periods === 2) {
      if (missed >= allowance(run.length)) break
      missed++
    }
    run.unshift(occurrence)
    errors.unshift(error)
    reference = occurrence
  }
  return { run, errors, missed, extras }
}

// --- Amounts ----------------------------------------------------------------

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

/** Two amounts are the same price within ±1 % or ±1 €. */
export function samePrice(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(100, Math.round(Math.max(a, b) * 0.01))
}

interface AmountAnalysis {
  amountType: RecurringAmountType
  typicalAmountCents: number
  previousAmountCents: number | null
  priceChangedOn: string | null
  spread: number
  stability: number
}

/** Consecutive occurrences at the same price. */
function priceSegments(run: readonly Occurrence[]): Occurrence[][] {
  const segments: Occurrence[][] = []
  for (const occurrence of run) {
    const current = segments.at(-1)
    if (current && samePrice(current[0].amountCents, occurrence.amountCents)) {
      current.push(occurrence)
    } else {
      segments.push([occurrence])
    }
  }
  return segments
}

/**
 * Fixed when every amount is the same price, or when the price changed at
 * most twice and each intermediate price was charged at least twice (a price
 * increase); variable otherwise.
 */
function analyzeAmounts(run: readonly Occurrence[]): AmountAnalysis {
  const amounts = run.map((o) => o.amountCents)
  const all = median(amounts)
  const spread =
    all === 0 ? 0 : median(amounts.map((a) => Math.abs(a - all))) / all
  const segments = priceSegments(run)
  // The first segment may be cut short by the start of the history.
  const steps =
    segments.length <= 3 && segments.slice(1, -1).every((s) => s.length >= 2)
  if (segments.length === 1 || steps) {
    const current = segments.at(-1)!
    const previous = segments.at(-2)
    return {
      amountType: 'fixed',
      typicalAmountCents: median(current.map((o) => o.amountCents)),
      previousAmountCents: previous
        ? median(previous.map((o) => o.amountCents))
        : null,
      priceChangedOn: previous ? current[0].date : null,
      spread,
      stability: 1 - 0.05 * (segments.length - 1),
    }
  }
  const recent = amounts.slice(-12)
  return {
    amountType: 'variable',
    typicalAmountCents: median(recent),
    previousAmountCents: null,
    priceChangedOn: null,
    spread,
    stability: Math.max(0, Math.min(1, 0.95 - 1.5 * spread)),
  }
}

// --- Next date --------------------------------------------------------------

/**
 * Day of the month a monthly-based series falls on: 31 (clamped to the
 * month length) when it is usually charged on the last day, else the median
 * day of its occurrences.
 */
function anchorDay(run: readonly Occurrence[]): number {
  const monthEnds = run.filter((o) => isLastDayOfMonth(o.date)).length
  if (monthEnds * 2 > run.length) return 31
  // Lower median: an early charge (the 30th for the 2nd) does not pull it up.
  const days = run.map((o) => dayOfMonth(o.date)).sort((a, b) => a - b)
  return days[Math.floor((days.length - 1) / 2)]
}

/** Next expected date after `last`, month-end safe. */
export function nextExpectedDate(
  last: string,
  cadence: RecurringCadence,
  anchor: number = dayOfMonth(last),
): string {
  const spec = CADENCE_SPECS[cadence]
  if (spec.months === 0) return addDays(last, spec.days)
  let best: string | null = null
  let bestGap = Infinity
  for (const offset of [spec.months - 1, spec.months, spec.months + 1]) {
    if (offset < 0) continue
    const candidate = addMonths(last, offset, anchor)
    const days = daysBetween(last, candidate)
    if (days <= 0) continue
    const gap = Math.abs(days - spec.days)
    if (gap < bestGap) {
      best = candidate
      bestGap = gap
    }
  }
  return best ?? addMonths(last, spec.months, anchor)
}

// --- Scoring ----------------------------------------------------------------

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/**
 * Stats of the most recent run of `occurrences` (oldest first, at least one)
 * that follows `cadence`, as of `asOf` (the account's data horizon).
 */
export function describeSeries(
  occurrences: readonly Occurrence[],
  cadence: RecurringCadence,
  asOf: string,
): SeriesStats {
  const spec = CADENCE_SPECS[cadence]
  const { run, errors, missed, extras } = fitRun(occurrences, cadence)
  const amounts = analyzeAmounts(run)
  const first = run[0]
  const last = run.at(-1)!

  const meanDrift = errors.length
    ? errors.reduce((sum, e) => sum + e / spec.toleranceDays, 0) / errors.length
    : 0
  const support = 0.7 + 0.3 * clamp01((run.length - spec.minOccurrences) / 3)
  const regularity = clamp01(
    (1 - 0.25 * meanDrift) * (1 - 0.1 * (missed + extras)) * support,
  )

  const sinceLast = Math.max(0, daysBetween(last.date, asOf))
  const active = sinceLast <= STALE_PERIODS * spec.days
  const recency =
    sinceLast <= spec.days + spec.toleranceDays ? 1 : active ? 0.75 : 0.3

  return {
    cadence,
    occurrences: run,
    firstDate: first.date,
    lastDate: last.date,
    nextExpectedDate: nextExpectedDate(last.date, cadence, anchorDay(run)),
    active,
    amountType: amounts.amountType,
    typicalAmountCents: amounts.typicalAmountCents,
    latestAmountCents: last.amountCents,
    minAmountCents: Math.min(...run.map((o) => o.amountCents)),
    maxAmountCents: Math.max(...run.map((o) => o.amountCents)),
    previousAmountCents: amounts.previousAmountCents,
    priceChangeCents:
      amounts.previousAmountCents === null
        ? null
        : amounts.typicalAmountCents - amounts.previousAmountCents,
    priceChangedOn: amounts.priceChangedOn,
    missedCount: missed,
    amountSpread: round2(amounts.spread),
    regularity: round2(regularity),
    amountStability: round2(amounts.stability),
    recency,
    confidence: round2(regularity * amounts.stability * recency),
  }
}

/** Whether a fitted series is regular and stable enough to be suggested. */
function qualifies(stats: SeriesStats): boolean {
  const spec = CADENCE_SPECS[stats.cadence]
  return (
    stats.occurrences.length >= spec.minOccurrences &&
    (stats.amountType === 'fixed' || stats.amountSpread <= spec.maxSpread) &&
    stats.confidence >= MIN_CONFIDENCE
  )
}

function mostFrequent<T>(values: readonly (T | null)[]): T | null {
  const counts = new Map<T, number>()
  let best: T | null = null
  let bestCount = 0
  // Latest first, so the most recent value wins a tie.
  for (let i = values.length - 1; i >= 0; i--) {
    const value = values[i]
    if (value === null) continue
    const count = (counts.get(value) ?? 0) + 1
    counts.set(value, count)
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

/**
 * Best series of a group: the cadence with the highest confidence (then the
 * longest run) among those that qualify; null when none does.
 */
export function detectGroup(
  group: TransactionGroup,
  asOf: string,
): DetectedSeries | null {
  let best: SeriesStats | null = null
  for (const cadence of RECURRING_CADENCES) {
    const stats = describeSeries(group.occurrences, cadence, asOf)
    if (!qualifies(stats)) continue
    if (
      !best ||
      stats.confidence > best.confidence ||
      (stats.confidence === best.confidence &&
        stats.occurrences.length > best.occurrences.length)
    ) {
      best = stats
    }
  }
  if (!best) return null
  return {
    ...best,
    key: group.key,
    accountId: group.accountId,
    merchantKey: group.merchantKey,
    direction: group.direction,
    displayName:
      mostFrequent(best.occurrences.map((o) => o.merchant)) ??
      group.merchantKey,
    categoryId: mostFrequent(best.occurrences.map((o) => o.categoryId)),
  }
}

/**
 * Recurring series among `transactions` (any kind: transfers and one-offs
 * are ignored here), as of `today` (Europe/Paris). Inactive series are
 * returned too, flagged `active: false`. Most confident first.
 */
export function detectRecurring(
  transactions: readonly RecurringTransaction[],
  today: string,
): DetectedSeries[] {
  const horizons = accountHorizons(transactions, today)
  const detected: DetectedSeries[] = []
  for (const group of groupTransactions(transactions).values()) {
    const series = detectGroup(group, horizons.get(group.accountId) ?? today)
    if (series) detected.push(series)
  }
  return detected.sort(
    (a, b) => b.confidence - a.confidence || a.key.localeCompare(b.key),
  )
}

// --- Costs ------------------------------------------------------------------

/** Cost over a year of `amountCents` charged every `cadence`. */
export function yearlyCostCents(
  amountCents: number,
  cadence: RecurringCadence,
): number {
  return amountCents * CADENCE_SPECS[cadence].perYear
}

/** Yearly cost / 12, rounded to the cent. */
export function monthlyEquivalentCents(
  amountCents: number,
  cadence: RecurringCadence,
): number {
  return Math.round(yearlyCostCents(amountCents, cadence) / 12)
}
