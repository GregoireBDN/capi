import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import {
  accountsTable,
  categoriesTable,
  categorizationRulesTable,
  contactsTable,
  cryptoHoldingsTable,
  cryptoImportsTable,
  cryptoMovementsTable,
  cryptoWalletKeysTable,
  cryptoWalletTokensTable,
  dividendsTable,
  envelopesTable,
  importProfilesTable,
  importsTable,
  receivableOffsetsTable,
  receivablePaymentsTable,
  receivablesTable,
  recurringItemsTable,
  transactionsTable,
} from '#/database/schema'

/** A private table a path names a row of (ADR 0009): its id and owner. */
export type OwnedTable = PgTable & { id: PgColumn; userId: PgColumn }

/**
 * Path parameters that are no row id: global reference data (an asset id,
 * an ISIN with its price day) and parts of a row named by its parent (a
 * month, a snapshot's date, a statement's day, a line of an import).
 */
export const NOT_ROW_IDS = new Set([
  'assetId',
  'isin',
  'day',
  'month',
  'date',
  'asOf',
  'lineNumber',
])

/** Sub-resource ids, whatever the route. */
const BY_NAME: Record<string, OwnedTable> = {
  holdingId: cryptoHoldingsTable,
  keyId: cryptoWalletKeysTable,
  tokenId: cryptoWalletTokensTable,
  dividendId: dividendsTable,
  categoryId: categoriesTable,
  transactionId: transactionsTable,
}

/** `:id` by the route it is in, the most specific first. */
const ID_BY_ROUTE: [RegExp, OwnedTable][] = [
  [/^\/api\/accounts\//, accountsTable],
  [/^\/api\/categories\//, categoriesTable],
  [/^\/api\/categorization-rules\//, categorizationRulesTable],
  [/^\/api\/imports\//, importsTable],
  [/^\/api\/import-profiles\//, importProfilesTable],
  [/^\/api\/recurring\//, recurringItemsTable],
  [/^\/api\/transactions\//, transactionsTable],
  [/^\/api\/contacts\//, contactsTable],
  [/^\/api\/receivables\/offsets\//, receivableOffsetsTable],
  [/^\/api\/receivables\/payments\//, receivablePaymentsTable],
  [/^\/api\/receivables\//, receivablesTable],
  [/^\/api\/crypto-movements\//, cryptoMovementsTable],
  [/^\/api\/crypto-imports\//, cryptoImportsTable],
  [/^\/api\/envelopes\//, envelopesTable],
]

/**
 * The table whose row a path parameter names (`/api/accounts/:id` →
 * `accounts`), `null` for one that names no row, `undefined` when nobody
 * said: `app.routes.spec.ts` fails on a new route whose ids are not here.
 */
export function ownedTableOf(
  route: string,
  param: string,
): OwnedTable | null | undefined {
  if (NOT_ROW_IDS.has(param)) return null
  if (param !== 'id') return BY_NAME[param]
  return ID_BY_ROUTE.find(([pattern]) => pattern.test(route))?.[1]
}
