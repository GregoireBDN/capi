import type { ParsedRow } from '#/imports/parsers/parsed-row'

/**
 * Running-balance continuity of an imported file. Pure functions only: the
 * report is data for the import preview (#10) and must never be logged
 * (it holds balances).
 *
 * - **Order.** CIC exports are oldest-first, but files sorted newest-first
 *   exist. The order is read from the booking dates (non-decreasing →
 *   `ascending`, non-increasing → `descending`). When the dates cannot tell
 *   (a single day, or unsorted dates), the running balances decide: the
 *   direction in which they chain with fewer gaps wins; a tie is reported as
 *   `unknown` and the rows are checked in file order.
 * - **Within the file**, in chronological order, every row that has a balance
 *   must satisfy `previous balance + amounts since = balance`. Rows without a
 *   balance are carried through (their amounts are added). After a gap the
 *   check resynchronizes on the row's own balance, so one missing row is
 *   reported once, not on every following row.
 * - **Across imports**, `previousBalanceCents` is the balance at the end of
 *   the last day before the file that has a balance (`loadPreviousBalance`);
 *   a mismatch on the first balance of the file is reported as
 *   `openingMismatch`.
 * - `checked` is false when no comparison could be made (no balances, or a
 *   single balance and no previous balance). `ok` means no gap and no opening
 *   mismatch were found, so it is only meaningful when `checked` is true.
 */

export interface ContinuityGap {
  /** Line of the row whose balance does not follow. */
  lineNumber: number
  /** Balance this row should have had. */
  expectedCents: number
  /** Balance the file gives for this row. */
  actualCents: number
  /**
   * The missing rows are between these booking dates (inclusive). `fromDate`
   * is null for an opening mismatch: only the previous balance is known.
   */
  fromDate: string | null
  toDate: string
}

export interface ContinuityReport {
  checked: boolean
  ok: boolean
  order: 'ascending' | 'descending' | 'unknown'
  /** Gaps inside the file, in chronological order. */
  gaps: ContinuityGap[]
  openingMismatch: ContinuityGap | null
}

type Order = ContinuityReport['order']

export function checkContinuity(
  rows: ParsedRow[],
  previousBalanceCents: number | null,
): ContinuityReport {
  let order = orderFromDates(rows)
  if (order === 'unknown') {
    const ascending = walk(rows, null).gaps.length
    const descending = walk([...rows].reverse(), null).gaps.length
    if (ascending < descending) order = 'ascending'
    else if (descending < ascending) order = 'descending'
  }

  const chronological = order === 'descending' ? [...rows].reverse() : rows
  const { gaps, openingMismatch, comparisons } = walk(
    chronological,
    previousBalanceCents,
  )
  return {
    checked: comparisons > 0,
    ok: gaps.length === 0 && openingMismatch === null,
    order,
    gaps,
    openingMismatch,
  }
}

function orderFromDates(rows: ParsedRow[]): Order {
  let increases = false
  let decreases = false
  for (let k = 1; k < rows.length; k++) {
    if (rows[k].bookingDate > rows[k - 1].bookingDate) increases = true
    if (rows[k].bookingDate < rows[k - 1].bookingDate) decreases = true
  }
  if (increases && !decreases) return 'ascending'
  if (decreases && !increases) return 'descending'
  return 'unknown'
}

/** Checks rows assumed to be in chronological order. */
function walk(rows: ParsedRow[], previousBalanceCents: number | null) {
  const gaps: ContinuityGap[] = []
  let openingMismatch: ContinuityGap | null = null
  let comparisons = 0

  let running = previousBalanceCents
  let fromDate: string | null = null
  let opening = true

  for (const row of rows) {
    if (running !== null) running += row.amountCents
    if (row.balanceAfterCents === null) continue

    if (running !== null) {
      comparisons++
      if (running !== row.balanceAfterCents) {
        const gap: ContinuityGap = {
          lineNumber: row.lineNumber,
          expectedCents: running,
          actualCents: row.balanceAfterCents,
          fromDate: opening ? null : fromDate,
          toDate: row.bookingDate,
        }
        if (opening) openingMismatch = gap
        else gaps.push(gap)
      }
    }
    opening = false
    running = row.balanceAfterCents
    fromDate = row.bookingDate
  }

  return { gaps, openingMismatch, comparisons }
}

/**
 * Balance at the end of a day, from that day's transactions in any order
 * (the database keeps no order within a day). The last row is the one whose
 * balance is not the starting balance (`balance - amount`) of another row.
 * Returns null when the rows do not tell (e.g. they do not chain).
 */
export function endOfDayBalance(
  rows: { amountCents: number; balanceAfterCents: number }[],
): number | null {
  const distinct = new Set(rows.map((r) => r.balanceAfterCents))
  if (distinct.size === 1) return rows[0].balanceAfterCents

  const finals = new Set<number>()
  rows.forEach((row, i) => {
    const continued = rows.some(
      (other, j) =>
        j !== i &&
        other.balanceAfterCents - other.amountCents === row.balanceAfterCents,
    )
    if (!continued) finals.add(row.balanceAfterCents)
  })
  return finals.size === 1 ? [...finals][0] : null
}
