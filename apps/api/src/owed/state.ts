import type { ReceivableState } from './dto/owed.dto'

export type Settled = {
  amountCents: number
  repaidCents: number
  forgivenCents: number
}

/**
 * `open` while something is left to claim; once nothing is, `forgiven` if
 * some was let go, else `repaid` (#437).
 */
export function receivableState(row: Settled): ReceivableState {
  if (leftCents(row) > 0) return 'open'
  return row.forgivenCents > 0 ? 'forgiven' : 'repaid'
}

/** What is still owed: the share minus what was repaid and let go. */
export function leftCents(row: Settled): number {
  return Math.max(0, row.amountCents - row.repaidCents - row.forgivenCents)
}
