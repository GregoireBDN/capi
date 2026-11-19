import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '#/database/schema'
import {
  accountsTable,
  TRANSACTIONAL_ACCOUNT_TYPES,
  transactionsTable,
} from '#/database/schema'
import { addDays } from '#/imports/dedupe/calendar-date'
import {
  matchTransfers,
  TRANSFER_MATCH_TOLERANCE_DAYS,
  type TransferSide,
} from './match-transfers'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx

/** Ids read per query, well under the Postgres parameter limit. */
const CHUNK = 1000

const t = transactionsTable

/** Unlinked transfers of the open cash accounts matching `where`. */
function unlinkedTransfers(executor: Executor, where: ReturnType<typeof and>) {
  return executor
    .select({
      id: t.id,
      accountId: t.accountId,
      bookingDate: t.bookingDate,
      amountCents: t.amountCents,
    })
    .from(t)
    .innerJoin(accountsTable, eq(accountsTable.id, t.accountId))
    .where(
      and(
        eq(t.kind, 'transfer'),
        isNull(t.counterpartAccountId),
        isNull(accountsTable.archivedAt),
        inArray(accountsTable.type, [...TRANSACTIONAL_ACCOUNT_TYPES]),
        where,
      ),
    )
}

/**
 * Links the two sides of transfers between the owner's cash accounts
 * (#296): each of the transactions `ids` that is an unlinked transfer gets,
 * with its other side (opposite amount on another open cash account, at most
 * `TRANSFER_MATCH_TOLERANCE_DAYS` days apart, see `matchTransfers`), the
 * other's account as counterpart. Rows already linked (by hand, by a rule or
 * earlier) are never touched, so unlinking a row by hand sticks: only new
 * rows are passed here (an import's, the demo's). Returns the pairs linked.
 */
export async function linkMatchingTransfers(
  executor: Executor,
  ids: readonly string[],
): Promise<number> {
  const fresh: TransferSide[] = []
  for (let start = 0; start < ids.length; start += CHUNK) {
    fresh.push(
      ...(await unlinkedTransfers(
        executor,
        and(inArray(t.id, ids.slice(start, start + CHUNK))),
      )),
    )
  }
  if (fresh.length === 0) return 0
  const dates = fresh.map((row) => row.bookingDate).sort()
  const candidates = await unlinkedTransfers(
    executor,
    and(
      gte(t.bookingDate, addDays(dates[0], -TRANSFER_MATCH_TOLERANCE_DAYS)),
      lte(t.bookingDate, addDays(dates.at(-1)!, TRANSFER_MATCH_TOLERANCE_DAYS)),
    ),
  )
  const pairs = matchTransfers(fresh, candidates)
  if (pairs.length === 0) return 0

  for (let start = 0; start < pairs.length; start += CHUNK / 2) {
    const values = sql.join(
      pairs
        .slice(start, start + CHUNK / 2)
        .flatMap((pair) => [
          sql`(${pair.out.id}::uuid, ${pair.in.accountId}::uuid)`,
          sql`(${pair.in.id}::uuid, ${pair.out.accountId}::uuid)`,
        ]),
      sql`, `,
    )
    await executor.execute(sql`
      update ${transactionsTable} as t
      set counterpart_account_id = v.counterpart_account_id,
          updated_at = now()
      from (values ${values}) as v(id, counterpart_account_id)
      where t.id = v.id and t.counterpart_account_id is null
    `)
  }
  return pairs.length
}
