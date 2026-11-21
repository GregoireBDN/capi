/**
 * Share arithmetic of #359, as the API does it: integer cents, a division
 * rounded half to even, the remainder of « parts égales » on the owner.
 */

/** `numerator / denominator` rounded half to even (positive integers). */
export function divideHalfEven(numerator: number, denominator: number): number {
  if (denominator <= 0 || numerator < 0) return 0
  const quotient = Math.floor(numerator / denominator)
  const twiceRest = 2 * (numerator - quotient * denominator)
  if (twiceRest > denominator) return quotient + 1
  if (twiceRest < denominator) return quotient
  return quotient % 2 === 0 ? quotient : quotient + 1
}

export type ShareMode = 'half' | 'equal' | 'amount'

/**
 * Each other person's part of `totalCents` in a mode: half (one person), or
 * equal parts between them and the owner. Null for typed amounts.
 */
export function partOf(
  mode: ShareMode,
  totalCents: number,
  people: number,
): number | null {
  if (mode === 'amount' || people === 0) return null
  return mode === 'half' && people === 1
    ? divideHalfEven(totalCents, 2)
    : divideHalfEven(totalCents, people + 1)
}

/** « Quelqu’un a payé pour moi »: my part of the bill. */
export function myPartOf(
  mode: ShareMode,
  billCents: number,
  people: number,
): number | null {
  if (mode === 'amount') return null
  return divideHalfEven(billCents, mode === 'half' ? 2 : Math.max(2, people))
}

/**
 * What others carry of an expense the owner paid: each share, or, once let
 * go, only what was repaid on it (the rest is his again). « Ma part » is the
 * expense minus this.
 */
export function othersPartCents(item: {
  shares: readonly {
    direction: string
    amountCents: number
    repaidCents: number
    state: string
  }[]
}): number {
  return item.shares
    .filter((s) => s.direction === 'owed_to_me')
    .reduce(
      (sum, s) =>
        sum + (s.state === 'forgiven' ? s.repaidCents : s.amountCents),
      0,
    )
}
