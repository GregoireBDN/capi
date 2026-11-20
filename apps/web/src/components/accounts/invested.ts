import type {
  AccountDto,
  AccountPerformanceDto,
  InvestedBaseDto,
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
 * Whether the owner types the account's invested amount (#358, #360): a PEA,
 * a life insurance, employee savings, a wallet or a manual crypto account.
 * Not an exchange, whose exports give it, nor an archived account.
 */
export function takesInvestedBase(
  account: Pick<AccountDto, 'type' | 'cryptoSource' | 'archivedAt'>,
): boolean {
  if (account.archivedAt !== null) return false
  return account.type === 'crypto'
    ? account.cryptoSource !== 'exchange'
    : BASE_TYPES.includes(account.type)
}

/** « 2 janv. 2026 », « 1er mars 2025 ». */
function dayText(date: string): string {
  return formatCalendarDate(date).replace(/^1 /, '1er ')
}

/** What is linked to the account: bank transfers, or coins for crypto. */
function linkedText(count: number, crypto: boolean): string {
  return crypto
    ? plural(count, 'envoi d’une plateforme', 'envois d’une plateforme')
    : plural(count, 'virement lié', 'virements liés')
}

/**
 * Where the account's invested amount comes from, in one short line (#360):
 * « D’après vos exports », « Saisi au 2 janv. 2026 + 3 virements liés »…
 * Null when it is unknown.
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
  >,
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
  const crypto = account.type === 'crypto'
  const unknown =
    unknownCostCount > 0
      ? ` · dont ${plural(unknownCostCount, 'envoi', 'envois')} sans coût connu`
      : ''
  if (crypto && account.cryptoSource === 'exchange') {
    return 'D’après vos exports, au prix d’achat'
  }
  if (contributionsSource === 'base' && investedBase) {
    const linked =
      linkedTransfersCount > 0
        ? ` + ${linkedText(linkedTransfersCount, crypto)}`
        : ''
    return `Saisi au ${dayText(investedBase.on)}${linked}${unknown}`
  }
  if (contributionsSource === 'links') {
    return crypto
      ? `D’après ${linkedText(linkedTransfersCount, true)}, au prix d’achat${unknown}`
      : `D’après ${linkedText(linkedTransfersCount, false)}`
  }
  if (crypto) return 'D’après les montants investis de vos avoirs'
  return contributionsDate
    ? `Saisi sur la valeur du ${dayText(contributionsDate)}`
    : null
}
