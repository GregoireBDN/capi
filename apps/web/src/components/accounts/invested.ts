import type {
  AccountDto,
  AccountPerformanceDto,
  InvestedBaseDto,
  UnknownCostDto,
} from '#/api/types.gen'
import { formatCalendarDate } from '#/lib/money'
import { plural } from '#/lib/plural'

/** The account's invested base, when it has one. */
export function investedBaseOf(
  account: Pick<AccountDto, 'investedBaseCents' | 'investedBaseOn'>,
): InvestedBaseDto | null {
  return account.investedBaseCents === null || account.investedBaseOn === null
    ? null
    : { amountCents: account.investedBaseCents, on: account.investedBaseOn }
}

const BASE_TYPES: readonly AccountDto['type'][] = [
  'brokerage',
  'life_insurance',
  'employee_savings',
]

/**
 * Whether the owner types the account's invested amount (#360): a PEA, a
 * life insurance or employee savings, not archived. Never a crypto account,
 * whose cost follows its coins (#373: the cost of coins from elsewhere is
 * given in « À préciser »).
 */
export function takesInvestedBase(
  account: Pick<AccountDto, 'type' | 'cryptoSource' | 'archivedAt'>,
): boolean {
  if (account.archivedAt !== null) return false
  return BASE_TYPES.includes(account.type)
}

/** « 2 janv. 2026 », « 1er mars 2025 ». */
function dayText(date: string): string {
  return formatCalendarDate(date).replace(/^1 /, '1er ')
}

/** « 0,1 BTC », exact. */
export function coinText(coin: Pick<UnknownCostDto, 'quantity' | 'symbol'>) {
  return `${coin.quantity.replace('.', ',')} ${coin.symbol}`
}

/** « 0,1 BTC et 2 ETH sans coût connu », or null. */
export function unknownCostText(
  unknown: readonly Pick<UnknownCostDto, 'quantity' | 'symbol'>[],
): string | null {
  if (unknown.length === 0) return null
  const coins = unknown.map(coinText)
  const list =
    coins.length === 1
      ? coins[0]
      : `${coins.slice(0, -1).join(', ')} et ${coins.at(-1)}`
  return `${list} sans coût connu`
}

/**
 * Where the account's invested amount comes from, in one short line (#360,
 * #373): « D’après vos exports », « Saisi au 2 janv. 2026 + 3 virements
 * liés », « Au prix d’achat des cryptos reçues »… Null when it is unknown.
 */
export function investedSourceText(
  account: Pick<AccountDto, 'type' | 'cryptoSource'>,
  performance: Pick<
    AccountPerformanceDto,
    | 'contributionsCents'
    | 'contributionsDate'
    | 'contributionsSource'
    | 'investedBase'
    | 'linkedTransfersCount'
    | 'unknownCostCount'
  > & { unknownCost?: AccountPerformanceDto['unknownCost'] },
): string | null {
  const {
    contributionsCents,
    contributionsDate,
    contributionsSource,
    investedBase,
    linkedTransfersCount,
    unknownCostCount,
  } = performance
  if (contributionsCents === null) return null
  if (account.type === 'crypto') {
    const unknown = unknownCostText(performance.unknownCost ?? [])
    const base =
      account.cryptoSource === 'exchange'
        ? 'D’après vos exports, au prix d’achat'
        : linkedTransfersCount > 0
          ? 'Au prix d’achat des cryptos reçues de vos plateformes'
          : 'Au prix de revient de vos cryptos'
    return unknown ? `${base} · hors ${unknown}` : base
  }
  const linked =
    linkedTransfersCount > 0
      ? ` + ${plural(linkedTransfersCount, 'virement lié', 'virements liés')}`
      : ''
  const unknown =
    unknownCostCount > 0
      ? ` · dont ${plural(unknownCostCount, 'virement', 'virements')} de montant inconnu`
      : ''
  if (contributionsSource === 'base' && investedBase) {
    return `Saisi au ${dayText(investedBase.on)}${linked}${unknown}`
  }
  if (contributionsSource === 'lines') {
    return 'D’après le prix de revient de vos lignes'
  }
  if (contributionsSource === 'links') {
    return `D’après ${plural(linkedTransfersCount, 'virement lié', 'virements liés')}${unknown}`
  }
  return contributionsDate
    ? `Saisi sur la valeur du ${dayText(contributionsDate)}${linked}${unknown}`
    : null
}
