import { endOfDayBalance } from '#/imports/dedupe/continuity'

/** A bank row of one account, with the bank's values (#74). */
export interface ChainRow {
  bookingDate: string
  amountCents: number
  balanceAfterCents: number | null
}

/** A statement closing balance typed or imported for the end of a day. */
export interface ChainStatement {
  date: string
  valueCents: number
}

export interface BalanceChainGap {
  /** Day whose balance does not follow. */
  date: string
  /** Last day whose balance was known before it. */
  fromDate: string
  /** What said the balance: the bank's running balance or a statement. */
  source: 'running' | 'statement'
  /** Stated balance − balance recomputed from the transactions. */
  differenceCents: number
}

/**
 * The balance recomputed from the transactions against what the bank says
 * (#427): from each known end-of-day balance (the running balance of a day's
 * bank rows, or a statement closing balance), adding every amount booked
 * since must give the next one. A day whose end balance cannot be told
 * (ambiguous same-day rows, no statement) stops the chain until the next
 * known one. A statement on a day whose running balance is known is compared
 * with it. Gaps are reported on days from `from` on; the earlier rows only
 * give the opening balance.
 *
 * Pure: the result holds amounts and must never be logged.
 */
export function balanceChainGaps(
  rows: readonly ChainRow[],
  statements: readonly ChainStatement[],
  from: string,
): BalanceChainGap[] {
  const days = new Map<string, { rows: ChainRow[]; statement?: number }>()
  const day = (date: string) => {
    let entry = days.get(date)
    if (!entry) {
      entry = { rows: [] }
      days.set(date, entry)
    }
    return entry
  }
  for (const row of rows) day(row.bookingDate).rows.push(row)
  for (const statement of statements) {
    day(statement.date).statement = statement.valueCents
  }

  const gaps: BalanceChainGap[] = []
  let anchor: { date: string; runningCents: number } | null = null
  for (const date of [...days.keys()].sort()) {
    const { rows: dayRows, statement } = days.get(date)!
    const amount = dayRows.reduce((sum, row) => sum + row.amountCents, 0)
    const expected: number | null =
      anchor === null ? null : anchor.runningCents + amount
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
    // undefined: no running balance that day; null: one that can't be told.
    const running =
      withBalance.length === 0 ? undefined : endOfDayBalance(withBalance)
    const report = date >= from && anchor !== null

    if (typeof running === 'number') {
      if (report && expected !== running) {
        gaps.push({
          date,
          fromDate: anchor!.date,
          source: 'running',
          differenceCents: running - expected!,
        })
      }
      if (statement !== undefined && statement !== running && date >= from) {
        gaps.push({
          date,
          fromDate: date,
          source: 'statement',
          differenceCents: statement - running,
        })
      }
      anchor = { date, runningCents: running }
      continue
    }
    if (statement !== undefined) {
      if (report && running === undefined && expected !== statement) {
        gaps.push({
          date,
          fromDate: anchor!.date,
          source: 'statement',
          differenceCents: statement - expected!,
        })
      }
      anchor = { date, runningCents: statement }
      continue
    }
    if (running === null) anchor = null
    else if (anchor) anchor.runningCents += amount
  }
  return gaps
}
