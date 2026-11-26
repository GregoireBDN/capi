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
    // Part let go, part repaid (#437): say how much was let go.
    const what =
      item.forgivenCents < item.amountCents
        ? `${formatCents(item.forgivenCents)} abandonnés`
        : 'Abandonné'
    return item.forgivenAt
      ? `${what} le ${formatCalendarDate(item.forgivenAt.slice(0, 10))}`
      : what
  }
  if (item.state === 'repaid') {
    const last = item.payments.at(-1)
    return last
      ? `Remboursé le ${formatCalendarDate(last.paidOn)}`
      : 'Remboursé'
  }
  const settled = [
    item.repaidCents > 0 ? `${formatCents(item.repaidCents)} reçus` : null,
    item.forgivenCents > 0
      ? `${formatCents(item.forgivenCents)} abandonnés`
      : null,
  ].filter(Boolean)
  return settled.length > 0
    ? `${settled.join(' · ')} sur ${formatCents(item.amountCents)}`
    : 'À rembourser'
}

/**
 * The net position with someone owed both ways (#484), after a colon
 * (« Net : … », « Il restera : … »): « Camille vous doit 15 € », « vous
 * devez 15 € à Camille », « quittes ».
 */
export function netText(name: string, netCents: number): string {
  if (netCents === 0) return 'quittes'
  return netCents > 0
    ? `${name} vous doit ${formatCents(netCents)}`
    : `vous devez ${formatCents(-netCents)} à ${name}`
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
