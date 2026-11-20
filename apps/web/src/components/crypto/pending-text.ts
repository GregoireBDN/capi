import type {
  AssetCostDto,
  CryptoAnsweredItemDto,
  CryptoPendingCandidateDto,
  CryptoPendingItemDto,
} from '#/api/types.gen'
import { todayInParis } from '#/components/accounts/dates'
import { formatCents } from '#/lib/money'
import { formatShortDay } from '#/lib/period'

/*
 * Words of « À préciser » (#373): one question per movement the app could
 * not explain, and what each answer says. Quantities are exact text.
 */

/** `0.100000000000000000` → `0,1`: exact text, never a float. */
export function quantityText(quantity: string): string {
  const [whole, fraction = ''] = quantity.split('.')
  const trimmed = fraction.replace(/0+$/, '')
  return trimmed === '' ? whole : `${whole},${trimmed}`
}

/** « 0,1 BTC ». */
export function coins(item: { quantity: string; symbol: string }): string {
  return `${quantityText(item.quantity)} ${item.symbol}`
}

function day(iso: string): string {
  return todayInParis(new Date(iso))
}

/** « 3 févr. », with the year when it is not this one. */
export function shortDay(iso: string, now: Date = new Date()): string {
  return formatShortDay(day(iso), todayInParis(now).slice(0, 4))
}

/** « D’où viennent ces 0,1 BTC ? » */
export function question(item: CryptoPendingItemDto): string {
  if (item.type === 'opening') {
    return `Prix de revient de vos ${coins(item)} arrivés avant le ${shortDay(item.at)} ?`
  }
  return item.type === 'arrival'
    ? `D’où viennent ces ${coins(item)} ?`
    : `Où sont partis ces ${coins(item)} ?`
}

/** When it happened: « Arrivés entre le 3 et le 10 févr. », « Partis le 3 févr. ». */
export function whenText(item: CryptoPendingItemDto, now = new Date()): string {
  const verb = item.type === 'departure' ? 'Partis' : 'Arrivés'
  if (item.type === 'opening') {
    return 'Lus à la première lecture : leur coût n’est pas connu'
  }
  const from = day(item.from)
  const to = day(item.at)
  return from === to
    ? `${verb} le ${shortDay(item.at, now)}`
    : `${verb} entre le ${shortDay(item.from, now)} et le ${shortDay(item.at, now)}`
}

/** « Coinbase · 0,5 BTC · 2 févr. » */
export function candidateText(
  candidate: CryptoPendingCandidateDto,
  symbol: string,
  now = new Date(),
): string {
  return `${candidate.accountName} · ${coins({ quantity: candidate.quantity, symbol })} · ${shortDay(candidate.at, now)}`
}

/** « 0,1 BTC reçus gratuitement », « 0,2 BTC vers Binance »… */
export function answeredText(item: CryptoAnsweredItemDto): string {
  const what = coins(item)
  switch (item.answer) {
    case 'transfer':
      return item.type === 'departure'
        ? `${what} vers ${item.counterpartAccountName ?? 'un autre compte'}`
        : `${what} depuis ${item.counterpartAccountName ?? 'un autre compte'}`
    case 'gift':
      return `${what} reçus gratuitement`
    case 'bought':
      return `${what} achetés ${formatCents(item.costCents ?? 0)}`
    case 'disposed':
      return `${what} vendus ou donnés`
  }
}

/**
 * « Prix de revient 15 000,00 € · résultat +2 000,00 € », then « dont 0,1
 * BTC sans coût connu » (#373): what an asset's coins cost, never a dash.
 */
export function costLines(cost: AssetCostDto): string[] {
  const unknown =
    cost.unknownQuantity !== '0' && /[1-9]/.test(cost.unknownQuantity)
  const allUnknown = unknown && cost.costCents === 0 && cost.gainCents === null
  if (allUnknown) return [`Prix de revient inconnu : à préciser`]
  const gain =
    cost.gainCents === null
      ? ''
      : ` · résultat ${cost.gainCents > 0 ? '+' : ''}${formatCents(cost.gainCents)}`
  return [
    `Prix de revient ${formatCents(cost.costCents)}${gain}`,
    ...(unknown
      ? [
          `dont ${coins({ quantity: cost.unknownQuantity, symbol: cost.symbol })} sans coût connu`,
        ]
      : []),
  ]
}
