/**
 * A transfer's other account (`counterpartAccountId`, #296) as an option of
 * `categorize_transactions` (#530): a transfer linked to an investment
 * account counts in its invested amount (#370). Only on transfers, never the
 * transaction's own account; removing a link stays in the app.
 */
import { z } from 'zod'
import type {
  AccountDto,
  AccountPerformanceDto,
  TransactionDto,
  TransactionKind,
} from '../api/types.js'
import type { ApiClient } from '../api/client.js'
import { euros, frenchDate } from '../format.js'
import { isInvestment } from './investments.js'
import { listAccounts, pickAccount } from './lookup.js'
import { ToolInputError } from './tool.js'
import { transactionRef } from './write.js'

export const counterpartSchema = z
  .string()
  .max(100)
  .optional()
  .describe(
    "Transfers only: the owner's other account it goes to or comes from (name), e.g. the PEA; counts in its invested amount.",
  )

/** Refused before any request: a counterpart with a kind other than transfer. */
export function assertCounterpartKind(kind: TransactionKind | undefined) {
  if (kind !== undefined && kind !== 'transfer') throw notTransfer()
}

function notTransfer(rows: TransactionDto[] = []): ToolInputError {
  return new ToolInputError(
    [
      "Seul un virement interne peut être lié à un autre compte (counterpart). Choisissez une catégorie de virement interne, ou retirez counterpart. Rien n'a été modifié.",
      ...rows.map((t) => `- ${transactionRef(t)}`),
    ].join('\n'),
  )
}

export interface TransferLink {
  account: AccountDto
  /** Its invested figures when it is an investment account other than crypto. */
  performance: AccountPerformanceDto | null
}

/** The counterpart account and its invested figures. */
export async function loadTransferLink(
  api: ApiClient,
  name: string,
): Promise<TransferLink> {
  const account = pickAccount(await listAccounts(api), name)
  const performance =
    isInvestment(account) && account.type !== 'crypto'
      ? await api.get<AccountPerformanceDto>(
          `/api/accounts/${account.id}/performance`,
        )
      : null
  return { account, performance }
}

/** Every row must be (or become) a transfer of another account. */
export function assertLinkable(
  link: TransferLink,
  rows: TransactionDto[],
  nextKind: (t: TransactionDto) => TransactionKind,
) {
  const notTransfers = rows.filter((t) => nextKind(t) !== 'transfer')
  if (notTransfers.length > 0) throw notTransfer(notTransfers)
  const own = rows.filter((t) => t.accountId === link.account.id)
  if (own.length > 0) {
    throw new ToolInputError(
      [
        `Ces opérations sont sur ${link.account.name} : un virement se lie à l'autre compte. Rien n'a été modifié.`,
        ...own.map((t) => `- ${transactionRef(t)}`),
      ].join('\n'),
    )
  }
}

export const relinks = (link: TransferLink | null, t: TransactionDto) =>
  link !== null && t.counterpartAccountId !== link.account.id

/** « → PEA », with the account it was linked to before. */
export function linkText(link: TransferLink, t: TransactionDto): string {
  const before = t.counterpartAccountName
    ? ` (était lié à ${t.counterpartAccountName})`
    : ''
  return `→ ${link.account.name}${before}`
}

/**
 * What the new links add to the account's invested amount: a transfer counts
 * after its typed point (base or contributions typed on a value), money paid
 * in adding, money taken out lowering it (#370).
 */
export function investedEffect(
  link: TransferLink,
  rows: TransactionDto[],
): string[] {
  const perf = link.performance
  if (!perf || rows.length === 0) return []
  const source = perf.contributionsSource
  if (
    source !== null &&
    source !== 'links' &&
    source !== 'base' &&
    source !== 'typed'
  )
    return []
  const since =
    source === 'base' || source === 'typed' ? perf.contributionsDate : null
  const counted = rows.filter((t) => since === null || t.bookingDate > since)
  const before = rows.length - counted.length
  const total = counted.reduce((sum, t) => sum - t.amountCents, 0)
  return [
    `Montant investi de ${link.account.name} : ${total < 0 ? '−' : '+'}${euros(Math.abs(total))}${perf.contributionsCents === null ? '' : ` (actuellement ${euros(perf.contributionsCents)})`}.`,
    ...(before > 0 && since
      ? [
          `${before} virement(s) du ${frenchDate(since)} ou avant ne changent pas ce montant : déjà compris dans le montant investi saisi à cette date.`,
        ]
      : []),
  ]
}

/** How to go back: the previous link, or the app when there was none. */
export function linkUndo(link: TransferLink, rows: TransactionDto[]): string[] {
  const byPrevious = new Map<string, string[]>()
  for (const t of rows) {
    if (!t.counterpartAccountName) continue
    byPrevious.set(t.counterpartAccountName, [
      ...(byPrevious.get(t.counterpartAccountName) ?? []),
      t.id,
    ])
  }
  const unlinked = rows.filter((t) => !t.counterpartAccountName).length
  return [
    ...[...byPrevious.entries()].map(
      ([name, ids]) =>
        `- categorize_transactions ids ${JSON.stringify(ids)}, counterpart ${JSON.stringify(name)}`,
    ),
    ...(unlinked > 0
      ? [
          `Lien vers ${link.account.name} de ${unlinked} opération(s) sans lien avant : il se retire dans l'application (éditeur de l'opération) ; aucun outil MCP ne le retire.`,
        ]
      : []),
  ]
}
