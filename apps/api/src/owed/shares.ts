/**
 * Share arithmetic for money owed (#359). Integer cents only, never a float:
 * a division is rounded half to even, and the remainder of « parts égales »
 * stays with the owner.
 */

/** `numerator / denominator` rounded half to even (both positive integers). */
export function divideHalfEven(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new RangeError('Integers only')
  }
  if (numerator < 0 || denominator <= 0) throw new RangeError('Out of range')
  const quotient = Math.floor(numerator / denominator)
  const twiceRest = 2 * (numerator - quotient * denominator)
  if (twiceRest > denominator) return quotient + 1
  if (twiceRest < denominator) return quotient
  return quotient % 2 === 0 ? quotient : quotient + 1
}

/**
 * Each person's part when `totalCents` is shared equally between `people`
 * (the owner included): the total ÷ n rounded half to even. The owner's
 * part is what is left (`ownPart`), so the parts always add up.
 */
export function equalPart(totalCents: number, people: number): number {
  if (!Number.isInteger(people) || people < 2) {
    throw new RangeError('At least two people share')
  }
  return divideHalfEven(totalCents, people)
}

/** What is left to the owner once the others' parts are taken. */
export function ownPart(
  totalCents: number,
  partsCents: readonly number[],
): number {
  return totalCents - partsCents.reduce((sum, part) => sum + part, 0)
}

/** A share in basis points (5000 = half) of an amount, half to even. */
export function basisPointsOf(amountCents: number, bps: number): number {
  return divideHalfEven(amountCents * bps, 10_000)
}

/** Share of a recurring charge: a fixed amount (capped at the charge) or a rate. */
export function recurringShareOf(
  chargeCents: number,
  share: { bps: number | null; amountCents: number | null },
): number {
  if (share.amountCents !== null)
    return Math.min(share.amountCents, chargeCents)
  return basisPointsOf(chargeCents, share.bps ?? 0)
}
