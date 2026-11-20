/**
 * Shared pieces of the write tools (#77). Every write tool works in two steps:
 * without `confirm: true` it only reads and returns a preview of exactly what
 * would change; with `confirm: true` it re-reads the current state, applies
 * only what is still needed (so a repeated call changes nothing more) and
 * lists what changed with a way to undo it. No tool deletes anything.
 */
import { z } from 'zod'
import type { TransactionDto, TransactionListDto } from '../api/types.js'
import type { ApiClient } from '../api/client.js'
import { frenchDate, signedEuros } from '../format.js'
import { UUID_PATTERN } from './lookup.js'
import { ToolInputError } from './tool.js'

/** Most transactions one write tool call may change (one page of the API list). */
export const MAX_TRANSACTION_IDS = 100

export const confirmSchema = z
  .boolean()
  .optional()
  .describe(
    'Leave out for a preview (nothing is written). true applies exactly the previewed change: only after showing the preview to the owner and getting their explicit agreement.',
  )

export const transactionIdsSchema = z
  .array(z.string().regex(UUID_PATTERN))
  .min(1)
  .max(MAX_TRANSACTION_IDS)
  .describe(
    `Transaction ids (the "id" shown by search_transactions or review_queue), 1 to ${MAX_TRANSACTION_IDS}.`,
  )

export const PREVIEW_FOOTER =
  "Aperçu seulement : rien n'a été modifié. Montrez-le au propriétaire et, s'il est d'accord, rappelez l'outil avec les mêmes arguments et confirm: true."

export const PREVIEW_HEADER = 'APERÇU — rien n’a encore été modifié.'

/** Its account, or who paid it for the owner (#359, « Payé pour moi »). */
export function accountOf(t: TransactionDto): string {
  return (
    t.accountName ?? `payé par ${t.paidByContactName ?? 'quelqu’un d’autre'}`
  )
}

/** Short one-line description of a transaction, with its id. */
export function transactionRef(t: TransactionDto): string {
  return `${frenchDate(t.bookingDate)} · ${signedEuros(t.amountCents)} · ${t.rawLabel} · ${accountOf(t)} (id ${t.id})`
}

/**
 * The current state of the given transactions, in one request. Unknown ids
 * stop the tool before anything is written.
 */
export async function loadTransactions(
  api: ApiClient,
  ids: string[],
): Promise<TransactionDto[]> {
  const unique = [...new Set(ids.map((id) => id.toLowerCase()))]
  if (unique.length !== ids.length) {
    throw new ToolInputError('La liste contient deux fois la même opération.')
  }
  const list = await api.get<TransactionListDto>('/api/transactions', {
    ids: unique.join(','),
    limit: MAX_TRANSACTION_IDS,
  })
  const byId = new Map(list.items.map((t) => [t.id.toLowerCase(), t]))
  const missing = unique.filter((id) => !byId.has(id))
  if (missing.length > 0) {
    throw new ToolInputError(
      `Opération(s) introuvable(s) : ${missing.join(', ')}. Rien n'a été modifié ; retrouvez les ids avec search_transactions.`,
    )
  }
  return unique.map((id) => byId.get(id) as TransactionDto)
}

/**
 * Applies the same change to `ids`: `PATCH` for one transaction, the bulk
 * route (one database transaction) for several.
 */
export async function updateTransactions(
  api: ApiClient,
  ids: string[],
  changes: Record<string, unknown>,
): Promise<void> {
  if (ids.length === 1 && ids[0]) {
    await api.send('PATCH', `/api/transactions/${ids[0]}`, changes)
  } else if (ids.length > 1) {
    await api.send('POST', '/api/transactions/bulk-update', {
      ...changes,
      ids,
    })
  }
}
