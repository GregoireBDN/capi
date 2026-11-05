import { and, asc, between, eq, isNotNull, lt, max } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '#/database/schema'
import { transactionsTable } from '#/database/schema'
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
 * `classifyRows`.
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
      bookingDate: transactionsTable.bookingDate,
      amountCents: transactionsTable.amountCents,
      rawLabel: transactionsTable.rawLabel,
      balanceAfterCents: transactionsTable.balanceAfterCents,
      dedupeHash: transactionsTable.dedupeHash,
    })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.accountId, accountId),
        between(
          transactionsTable.bookingDate,
          addDays(from, -tolerance),
          addDays(to, tolerance),
        ),
      ),
    )
    .orderBy(asc(transactionsTable.bookingDate), asc(transactionsTable.id))

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
    isNotNull(transactionsTable.balanceAfterCents),
  )
  const [latest] = await db
    .select({ day: max(transactionsTable.bookingDate) })
    .from(transactionsTable)
    .where(and(withBalance, lt(transactionsTable.bookingDate, before)))
  if (!latest?.day) return null

  const rows = await db
    .select({
      amountCents: transactionsTable.amountCents,
      balanceAfterCents: transactionsTable.balanceAfterCents,
    })
    .from(transactionsTable)
    .where(and(withBalance, eq(transactionsTable.bookingDate, latest.day)))

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
