import { daysBetween } from '#/imports/dedupe/calendar-date'

/** Days apart the two sides of a transfer may be booked (#296). */
export const TRANSFER_MATCH_TOLERANCE_DAYS = 3

/** What the matching needs of an unlinked transfer on a cash account. */
export interface TransferSide {
  id: string
  accountId: string
  bookingDate: string
  /** Signed integer cents: negative = money out. */
  amountCents: number
}

export interface TransferPair {
  /** The side that leaves an account (negative amount). */
  out: TransferSide
  /** The side that arrives on the other account. */
  in: TransferSide
}

function compareSides(a: TransferSide, b: TransferSide): number {
  return (
    a.bookingDate.localeCompare(b.bookingDate) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
}

/**
 * Pairs the two sides of transfers between the owner's cash accounts: for
 * each of `fresh` (just imported, oldest first), an unlinked transfer among
 * `candidates` on another account with the opposite amount, booked at most
 * `TRANSFER_MATCH_TOLERANCE_DAYS` days apart. The closest one wins, and only
 * when it is the only one that close: two candidates as close on different
 * accounts (100 € to the Livret A and 100 € to the Livret Jeune the same day)
 * leave the row unlinked rather than guess. Each row is used at most once.
 *
 * `candidates` may include `fresh` rows (two accounts imported together).
 * Zero amounts never match.
 */
export function matchTransfers(
  fresh: readonly TransferSide[],
  candidates: readonly TransferSide[],
  toleranceDays: number = TRANSFER_MATCH_TOLERANCE_DAYS,
): TransferPair[] {
  const used = new Set<string>()
  const pool = [...candidates].sort(compareSides)
  const pairs: TransferPair[] = []
  for (const row of [...fresh].sort(compareSides)) {
    if (used.has(row.id) || row.amountCents === 0) continue
    let best: TransferSide | null = null
    let bestDistance = Infinity
    let tie = false
    for (const other of pool) {
      if (
        used.has(other.id) ||
        other.id === row.id ||
        other.accountId === row.accountId ||
        other.amountCents !== -row.amountCents
      ) {
        continue
      }
      const distance = daysBetween(row.bookingDate, other.bookingDate)
      if (distance > toleranceDays) continue
      if (distance < bestDistance) {
        best = other
        bestDistance = distance
        tie = false
      } else if (
        distance === bestDistance &&
        other.accountId !== best?.accountId
      ) {
        tie = true
      }
    }
    if (!best || tie) continue
    used.add(row.id)
    used.add(best.id)
    pairs.push(
      row.amountCents < 0 ? { out: row, in: best } : { out: best, in: row },
    )
  }
  return pairs
}
