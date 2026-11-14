import { addDays, toEpochDay } from '#/imports/dedupe/calendar-date'
import { significantTokens, tokenOverlap } from '#/imports/dedupe/dedupe'

/**
 * Reconciliation of expenses noted by hand during the month (#137) with the
 * bank rows of an import. Pure functions only: no I/O, no logging (labels
 * and amounts are private data).
 *
 * A manual expense matches an incoming row of the same account with the same
 * amount whose booking date is at most `MANUAL_MATCH_TOLERANCE_DAYS` away
 * (a card payment is booked by the bank a few days after the purchase, a
 * weekend or a bank holiday adds more). Labels are optional on manual
 * expenses, so they only rank candidates, never rule one out.
 *
 * Matching is one-to-one: a manual expense is replaced by at most one bank
 * row and a bank row replaces at most one manual expense. Candidate pairs are
 * assigned greedily, best first: closest dates, then a bank row booked on or
 * after the manual date (the usual delay) rather than before, then label
 * similarity, then file order, then the manual expense booked first (id as
 * last tie-break). So two identical expenses noted the same day pair with two
 * identical bank rows, and a third identical row stays unmatched.
 */

/** Max distance in days between a manual expense and its bank row. */
export const MANUAL_MATCH_TOLERANCE_DAYS = 5

export interface ManualExpense {
  id: string
  bookingDate: string
  /** Signed integer cents (negative for an expense). */
  amountCents: number
  rawLabel: string
}

export interface MatchableRow {
  bookingDate: string
  amountCents: number
  rawLabel: string
}

interface Candidate {
  i: number
  j: number
  dayDiff: number
  /** The bank row is booked before the expense was noted. */
  early: boolean
  similarity: number
}

/**
 * The manual expense each row replaces (its id), or null; in row order. Rows
 * passed as null (exact duplicates, conflicts) are never matched.
 */
export function matchManualExpenses(
  rows: readonly (MatchableRow | null)[],
  manual: readonly ManualExpense[],
  toleranceDays: number = MANUAL_MATCH_TOLERANCE_DAYS,
): (string | null)[] {
  if (!Number.isInteger(toleranceDays) || toleranceDays < 0) {
    throw new RangeError('toleranceDays must be a non-negative integer')
  }
  const manualTokens = manual.map((m) => significantTokens(m.rawLabel))
  const manualDays = manual.map((m) => toEpochDay(m.bookingDate))

  const candidates: Candidate[] = []
  rows.forEach((row, i) => {
    if (!row) return
    const rowDay = toEpochDay(row.bookingDate)
    const rowTokens = significantTokens(row.rawLabel)
    manual.forEach((m, j) => {
      if (m.amountCents !== row.amountCents) return
      const delta = rowDay - manualDays[j]
      const dayDiff = Math.abs(delta)
      if (dayDiff > toleranceDays) return
      candidates.push({
        i,
        j,
        dayDiff,
        early: delta < 0,
        similarity: tokenOverlap(rowTokens, manualTokens[j]),
      })
    })
  })

  candidates.sort(
    (a, b) =>
      a.dayDiff - b.dayDiff ||
      Number(a.early) - Number(b.early) ||
      b.similarity - a.similarity ||
      a.i - b.i ||
      compareManual(manual[a.j], manual[b.j]),
  )

  const result: (string | null)[] = rows.map(() => null)
  const used = new Set<number>()
  for (const c of candidates) {
    if (result[c.i] !== null || used.has(c.j)) continue
    used.add(c.j)
    result[c.i] = manual[c.j].id
  }
  return result
}

/** Deterministic tie-break, independent of the order `manual` came in. */
function compareManual(a: ManualExpense, b: ManualExpense): number {
  if (a.bookingDate !== b.bookingDate) {
    return a.bookingDate < b.bookingDate ? -1 : 1
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Manual expenses an import of `periodStart`–`periodEnd` should have
 * replaced but did not: booked in the period, early enough that their bank
 * row is due in the file (more than the tolerance before its end). They stay
 * and are flagged for review.
 */
export function unmatchedInPeriod<
  T extends { id: string; bookingDate: string },
>(
  manual: readonly T[],
  matchedIds: ReadonlySet<string>,
  periodStart: string,
  periodEnd: string,
  toleranceDays: number = MANUAL_MATCH_TOLERANCE_DAYS,
): T[] {
  const last = addDays(periodEnd, -toleranceDays)
  return manual.filter(
    (m) =>
      !matchedIds.has(m.id) &&
      m.bookingDate >= periodStart &&
      m.bookingDate <= last,
  )
}

/** Days around a file's period where its manual expenses are looked up. */
export function manualLookupRange(
  periodStart: string,
  periodEnd: string,
  toleranceDays: number = MANUAL_MATCH_TOLERANCE_DAYS,
): { from: string; to: string } {
  return {
    from: addDays(periodStart, -toleranceDays),
    to: addDays(periodEnd, toleranceDays),
  }
}
