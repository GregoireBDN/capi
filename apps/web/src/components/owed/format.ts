import type { ReceivableDirection, ReceivableDto } from '#/api/types.gen'
import { formatCalendarDate, formatCents } from '#/lib/money'

/** An open item older than this shows in the warning colour. */
export const OLD_AFTER_DAYS = 30

/** « depuis 39 j » */
export function ageText(days: number | null): string | null {
  if (days === null) return null
  return days === 0 ? 'depuis aujourd’hui' : `depuis ${days} j`
}

/** The page's two lists. */
export type OwedSide = 'owed' | 'owe'

export function directionOf(side: OwedSide): ReceivableDirection {
  return side === 'owed' ? 'owed_to_me' : 'i_owe'
}

/** « Remboursé », « Abandonné »… of a settled item, with its day. */
export function stateText(item: ReceivableDto): string {
  if (item.state === 'forgiven') {
    return item.forgivenAt
      ? `Abandonné le ${formatCalendarDate(item.forgivenAt.slice(0, 10))}`
      : 'Abandonné'
  }
  if (item.state === 'repaid') {
    const last = item.payments.at(-1)
    return last
      ? `Remboursé le ${formatCalendarDate(last.paidOn)}`
      : 'Remboursé'
  }
  return item.repaidCents > 0
    ? `${formatCents(item.repaidCents)} reçus sur ${formatCents(item.amountCents)}`
    : 'À rembourser'
}

/** Search of the « Dépenses partagées » pages: `?side=owe` shows « Je dois ». */
export interface OwedSearch {
  side?: 'owe'
}

export function validateOwedSearch(
  search: Record<string, unknown>,
): OwedSearch {
  return search.side === 'owe' ? { side: 'owe' } : {}
}
