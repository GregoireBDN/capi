import { endOfDayBalance } from '#/imports/dedupe/continuity'

/** A stored transaction of one account, as needed by the check. */
export interface StoredRow {
  bookingDate: string
  amountCents: number
  balanceAfterCents: number | null
}

export interface StoredGap {
  /** Last day whose balance follows. */
  fromDate: string
  /** First day whose balance does not follow. */
  toDate: string
  /** Bank balance − expected balance (the amount of the missing rows). */
  differenceCents: number
}

/**
 * Running-balance continuity of an account's stored rows, day by day: the
 * end-of-day balance of a day must equal the previous known end-of-day
 * balance plus every amount booked since (rows without a balance included).
 * A day whose end balance cannot be told (ambiguous same-day rows) stops the
 * check until the next known one. Gaps are reported on days from `from` on;
 * the rows before it only give the opening balance.
 *
 * Pure: the result holds amounts and must never be logged.
 */
export function storedContinuityGaps(
  rows: StoredRow[],
  from: string,
): StoredGap[] {
  const days = new Map<string, StoredRow[]>()
  for (const row of rows) {
    const day = days.get(row.bookingDate)
    if (day) day.push(row)
    else days.set(row.bookingDate, [row])
  }

  const gaps: StoredGap[] = []
  let anchor: { date: string; runningCents: number } | null = null
  for (const date of [...days.keys()].sort()) {
    const dayRows = days.get(date)!
    const amount = dayRows.reduce((sum, row) => sum + row.amountCents, 0)
    const withBalance = dayRows.flatMap((row) =>
      row.balanceAfterCents === null
        ? []
        : [
            {
              amountCents: row.amountCents,
              balanceAfterCents: row.balanceAfterCents,
            },
          ],
    )
    if (withBalance.length === 0) {
      if (anchor) anchor.runningCents += amount
      continue
    }
    const end = endOfDayBalance(withBalance)
    if (end === null) {
      anchor = null
      continue
    }
    if (anchor) {
      const expected: number = anchor.runningCents + amount
      if (expected !== end && date >= from) {
        gaps.push({
          fromDate: anchor.date,
          toDate: date,
          differenceCents: end - expected,
        })
      }
    }
    anchor = { date, runningCents: end }
  }
  return gaps
}
