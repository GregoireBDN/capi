import { endOfDayBalance } from '#/imports/dedupe/continuity'

/** A stored transaction of one cash account, with its bank values. */
export interface HistoryRow {
  /** Bank booking date (`bankBookingDate`: a hand correction never moves it). */
  date: string
  /** Bank amount (`bankAmountCents`). */
  amountCents: number
  balanceAfterCents: number | null
}

/** A statement balance (`balance_snapshots`): the balance at the end of its day. */
export interface HistorySnapshot {
  date: string
  valueCents: number
}

export interface BalancePoint {
  date: string
  balanceCents: number
}

const DAY_MS = 86_400_000

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date) + days * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

/**
 * End-of-day balance of a cash account on every calendar day from `from` to
 * `to` (both included), with the anchors of `AccountsService.loadBalances`
 * as of each day, so the last point is the account's current balance:
 *
 * - the latest of a statement balance (snapshot) and of a day whose running
 *   balances chain (`endOfDayBalance`); the snapshot wins a tie;
 * - plus every amount booked after the anchor's day, hand-entered ones
 *   included (they count from the day after the anchor, never before it);
 * - without any anchor yet, the sum of the amounts so far.
 *
 * Rows carry their bank values: a hand correction never changes the bank
 * balance. A day whose running balances do not chain is not an anchor (the
 * previous one carries on), where `loadBalances` would give no balance at
 * all on that day. Days before the first row or snapshot have no point.
 *
 * Pure: the result holds balances and must never be logged.
 */
export function balanceHistory(
  rows: readonly HistoryRow[],
  snapshots: readonly HistorySnapshot[],
  from: string,
  to: string,
): BalancePoint[] {
  const rowsByDay = new Map<string, HistoryRow[]>()
  for (const row of rows) {
    const day = rowsByDay.get(row.date)
    if (day) day.push(row)
    else rowsByDay.set(row.date, [row])
  }
  const snapshotByDay = new Map(snapshots.map((s) => [s.date, s.valueCents]))
  const days = [...new Set([...rowsByDay.keys(), ...snapshotByDay.keys()])]
    .filter((day) => day <= to)
    .sort()

  // Balance at the end of each day that has data.
  const ends: BalancePoint[] = []
  let anchor: number | null = null
  let since = 0
  let total = 0
  for (const day of days) {
    const dayRows = rowsByDay.get(day) ?? []
    const amount = dayRows.reduce((sum, row) => sum + row.amountCents, 0)
    total += amount
    since += amount
    const snapshot = snapshotByDay.get(day)
    if (snapshot !== undefined) {
      anchor = snapshot
      since = 0
    } else {
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
      const end = withBalance.length > 0 ? endOfDayBalance(withBalance) : null
      if (end !== null) {
        anchor = end
        since = 0
      }
    }
    ends.push({
      date: day,
      balanceCents: anchor === null ? total : anchor + since,
    })
  }

  // Every calendar day of the window, carrying the last known balance.
  const points: BalancePoint[] = []
  let index = 0
  let current: number | null = null
  for (let day = from; day <= to; day = addDays(day, 1)) {
    while (index < ends.length && ends[index].date <= day) {
      current = ends[index].balanceCents
      index++
    }
    if (current !== null) points.push({ date: day, balanceCents: current })
  }
  return points
}
