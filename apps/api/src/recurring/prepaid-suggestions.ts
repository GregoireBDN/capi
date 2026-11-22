import { and, eq, inArray, lt, ne } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '#/database/schema'
import { recurringItemsTable, transactionsTable } from '#/database/schema'
import type { TransactionKind } from '#/database/schema/domain-enums'
import { normalizeLabel } from '#/imports/normalize/label'
import { seriesKey } from './detect'
import {
  PREPAID_SUGGESTED_TERM,
  PREPAID_SUGGESTION_MIN_CENTS,
  prepaidSuggestion,
} from './prepaid'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** The fields of a transaction the suggestion reads. */
export interface PrepaidSuggestionRow {
  id: string
  accountId: string | null
  bookingDate: string
  /** Signed cents. */
  amountCents: number
  rawLabel: string
  kind: TransactionKind
  prepaidItemId: string | null
}

/** « Prépayé 12 mois ? » on a large debit (#439). */
export interface PrepaidSuggestion {
  kind: 'renewal' | 'first'
  termMonths: number
  /** The merchant's charge about a year before (`renewal` only). */
  earlierOn: string | null
}

/**
 * « Prépayé 12 mois ? » for the large debits among `rows` (#439): an
 * expense of at least `PREPAID_SUGGESTION_MIN_CENTS` on an account, not
 * paying a prepaid item yet, whose merchant has no confirmed or dismissed
 * series on that account (the owner already said what it is), judged by
 * `prepaidSuggestion` from the merchant's earlier debits. Labels and amounts
 * stay in memory, never logged.
 */
export async function prepaidSuggestions(
  executor: Db | Tx,
  rows: readonly PrepaidSuggestionRow[],
): Promise<Map<string, PrepaidSuggestion>> {
  const suggestions = new Map<string, PrepaidSuggestion>()
  const candidates = rows
    .filter(
      (row) =>
        row.accountId !== null &&
        row.kind === 'expense' &&
        row.prepaidItemId === null &&
        -row.amountCents >= PREPAID_SUGGESTION_MIN_CENTS,
    )
    .map((row) => ({
      ...row,
      accountId: row.accountId!,
      merchantKey:
        normalizeLabel(row.rawLabel, row.amountCents).merchantKey?.slice(
          0,
          255,
        ) ?? null,
    }))
    .filter((row) => row.merchantKey)
  if (candidates.length === 0) return suggestions

  const accountIds = [...new Set(candidates.map((row) => row.accountId))]
  const latest = candidates.reduce(
    (max, row) => (row.bookingDate > max ? row.bookingDate : max),
    candidates[0].bookingDate,
  )
  const [earlier, items] = await Promise.all([
    executor
      .select({
        accountId: transactionsTable.accountId,
        bookingDate: transactionsTable.bookingDate,
        amountCents: transactionsTable.amountCents,
        rawLabel: transactionsTable.rawLabel,
      })
      .from(transactionsTable)
      .where(
        and(
          inArray(transactionsTable.accountId, accountIds),
          eq(transactionsTable.kind, 'expense'),
          lt(transactionsTable.amountCents, 0),
          lt(transactionsTable.bookingDate, latest),
        ),
      ),
    executor
      .select({
        accountId: recurringItemsTable.accountId,
        merchantKey: recurringItemsTable.merchantKey,
      })
      .from(recurringItemsTable)
      .where(
        and(
          inArray(recurringItemsTable.accountId, accountIds),
          eq(recurringItemsTable.direction, 'debit'),
          ne(recurringItemsTable.status, 'suggested'),
        ),
      ),
  ])
  const settled = new Set(
    items.map((item) => seriesKey(item.accountId, item.merchantKey, 'debit')),
  )
  const datesByKey = new Map<string, string[]>()
  for (const row of earlier) {
    const merchantKey = normalizeLabel(
      row.rawLabel,
      row.amountCents,
    ).merchantKey?.slice(0, 255)
    if (!merchantKey || row.accountId === null) continue
    const key = seriesKey(row.accountId, merchantKey, 'debit')
    const dates = datesByKey.get(key) ?? []
    dates.push(row.bookingDate)
    datesByKey.set(key, dates)
  }
  for (const row of candidates) {
    const key = seriesKey(row.accountId, row.merchantKey!, 'debit')
    if (settled.has(key)) continue
    const suggestion = prepaidSuggestion(
      row.bookingDate,
      datesByKey.get(key) ?? [],
    )
    if (suggestion) {
      suggestions.set(row.id, {
        ...suggestion,
        termMonths: PREPAID_SUGGESTED_TERM,
      })
    }
  }
  return suggestions
}
