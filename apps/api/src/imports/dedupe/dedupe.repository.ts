import { and, asc, between, eq, isNotNull, lt, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '#/database/schema'
import {
  bankAmountCents,
  bankBookingDate,
  transactionsTable,
} from '#/database/schema'
import { normalizeLabel } from '#/imports/normalize/label'
import { addDays, toEpochDay } from './calendar-date'
import { endOfDayBalance } from './continuity'
import {
  type ClassifyOptions,
  DEFAULT_DATE_TOLERANCE_DAYS,
  type ExistingTransaction,
} from './dedupe'

/**
 * Database reads for the import preview: the existing transactions a file is
 * deduplicated against, and the balance it must continue from. Read-only; the
 * import service (#10) calls them inside its own transaction.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** The database or an open transaction. */
export type DedupeExecutor = Db | Tx

/**
 * Transactions of `accountId` booked between `from` and `to` (inclusive),
 * padded on both sides by the date tolerance of probable duplicates so rows
 * at the edges of the file can still be matched. Pass the same options as to
 * `classifyRows`. Expenses noted by hand are left out: they are not bank rows
 * and are matched by `matchManualExpenses` instead.
 */
export async function loadExistingForRange(
  db: DedupeExecutor,
  accountId: string,
  from: string,
  to: string,
  options: ClassifyOptions = {},
): Promise<ExistingTransaction[]> {
  if (toEpochDay(from) > toEpochDay(to)) {
    throw new RangeError('from must not be after to')
  }
  const tolerance = options.dateToleranceDays ?? DEFAULT_DATE_TOLERANCE_DAYS
  const rows = await db
    .select({
      id: transactionsTable.id,
      // Bank values: a row corrected by hand (#74) still matches its source.
      bookingDate: bankBookingDate,
      amountCents: bankAmountCents,
      rawLabel: transactionsTable.rawLabel,
      balanceAfterCents: transactionsTable.balanceAfterCents,
      dedupeHash: transactionsTable.dedupeHash,
    })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.accountId, accountId),
        // Expenses noted by hand are reconciled apart (`imports/reconcile/`).
        eq(transactionsTable.manual, false),
        between(
          bankBookingDate,
          addDays(from, -tolerance),
          addDays(to, tolerance),
        ),
      ),
    )
    .orderBy(asc(bankBookingDate), asc(transactionsTable.id))

  return rows.map((row) => ({
    ...row,
    merchantKey: normalizeLabel(row.rawLabel, row.amountCents).merchantKey,
  }))
}

/**
 * Balance of `accountId` at the end of the last day strictly before `before`
 * that has transactions with a running balance; null when there is none, or
 * when that day's balances do not chain (see `endOfDayBalance`).
 */
export async function loadPreviousBalance(
  db: DedupeExecutor,
  accountId: string,
  before: string,
): Promise<number | null> {
  toEpochDay(before) // validates the date
  const withBalance = and(
    eq(transactionsTable.accountId, accountId),
    // Bank rows only (the partial index of bank data, #367).
    eq(transactionsTable.manual, false),
    isNotNull(transactionsTable.balanceAfterCents),
  )
  const [latest] = await db
    .select({ day: sql<string | null>`max(${bankBookingDate})` })
    .from(transactionsTable)
    .where(and(withBalance, lt(bankBookingDate, before)))
  if (!latest?.day) return null

  const rows = await db
    .select({
      amountCents: bankAmountCents,
      balanceAfterCents: transactionsTable.balanceAfterCents,
    })
    .from(transactionsTable)
    .where(and(withBalance, eq(bankBookingDate, latest.day)))

  return endOfDayBalance(
    rows.flatMap((r) =>
      r.balanceAfterCents === null
        ? []
        : [
            {
              amountCents: r.amountCents,
              balanceAfterCents: r.balanceAfterCents,
            },
          ],
    ),
  )
}
