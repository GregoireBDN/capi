import type { ReceivableDirection } from '#/database/schema/domain-enums'

/** An open item of one contact, as the offset plan reads it. */
export interface OffsetItem {
  id: string
  direction: ReceivableDirection
  /** The expense's day: older items are settled first. */
  date: string
  leftCents: number
}

export interface OffsetPlan {
  owedToMeCents: number
  iOweCents: number
  /** Settled on each side: the smaller of the two totals. */
  amountCents: number
  /** Both sides, each adding up to `amountCents`, oldest first. */
  items: { receivableId: string; amountCents: number }[]
}

/**
 * « Compenser » (#484): what one contact owes the owner against what he owes
 * them. The smaller total is settled on each side, the oldest open items
 * first (then by id, so the plan is the same every time).
 */
export function planOffset(items: OffsetItem[]): OffsetPlan {
  const open = items
    .filter((item) => item.leftCents > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const side = (direction: ReceivableDirection) =>
    open.filter((item) => item.direction === direction)
  const owed = side('owed_to_me')
  const owing = side('i_owe')
  const owedToMeCents = total(owed)
  const iOweCents = total(owing)
  const amountCents = Math.min(owedToMeCents, iOweCents)
  return {
    owedToMeCents,
    iOweCents,
    amountCents,
    items:
      amountCents === 0
        ? []
        : [...take(owed, amountCents), ...take(owing, amountCents)],
  }
}

function total(items: OffsetItem[]): number {
  return items.reduce((sum, item) => sum + item.leftCents, 0)
}

/** `amountCents` taken from the items in order. */
function take(
  items: OffsetItem[],
  amountCents: number,
): { receivableId: string; amountCents: number }[] {
  const result: { receivableId: string; amountCents: number }[] = []
  let rest = amountCents
  for (const item of items) {
    if (rest === 0) break
    const part = Math.min(rest, item.leftCents)
    result.push({ receivableId: item.id, amountCents: part })
    rest -= part
  }
  return result
}
