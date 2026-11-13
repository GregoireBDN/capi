import { and, eq, isNotNull, max, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '#/database/schema'
import { importsTable, transactionsTable } from '#/database/schema'
import { parisToday } from '#/investments/days'
import { type MonthPeriod, monthPeriod } from './period'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** The database or an open transaction. */
export type Executor = Db | Tx

/**
 * Date the data is complete up to, per account and overall.
 *
 * For an account: the later of its latest booked transaction and the end of
 * its latest committed import (a statement may end on days without any
 * row), never after today in Europe/Paris (a deferred card debit can be
 * booked ahead). Overall: the latest of the accounts, so one account
 * imported less often (a savings account with a few transfers a year) does
 * not hold back the figures of the others. Investment accounts, valued by
 * snapshots, have no transactions and do not count.
 */
export async function dataUntilByAccount(
  executor: Executor,
  now: Date = new Date(),
): Promise<Map<string, string>> {
  const t = transactionsTable
  const i = importsTable
  const [booked, imported] = await Promise.all([
    executor
      .select({ accountId: t.accountId, last: max(t.bookingDate) })
      .from(t)
      .groupBy(t.accountId),
    executor
      .select({ accountId: i.accountId, last: max(i.periodEnd) })
      .from(i)
      .where(and(isNotNull(i.committedAt), isNotNull(i.periodEnd)))
      .groupBy(i.accountId),
  ])
  const today = parisToday(now)
  const result = new Map<string, string>()
  for (const { accountId, last } of [...booked, ...imported]) {
    if (last === null) continue
    const capped = last < today ? last : today
    const known = result.get(accountId)
    if (known === undefined || capped > known) result.set(accountId, capped)
  }
  return result
}

/** Latest day with data, overall or for one account (see above). */
export async function dataUntil(
  executor: Executor,
  { accountId, now = new Date() }: { accountId?: string; now?: Date } = {},
): Promise<string | null> {
  const t = transactionsTable
  const i = importsTable
  const [[booked], [imported]] = await Promise.all([
    executor
      .select({ last: max(t.bookingDate) })
      .from(t)
      .where(accountId === undefined ? undefined : eq(t.accountId, accountId)),
    executor
      .select({ last: sql<string | null>`max(${i.periodEnd})` })
      .from(i)
      .where(
        and(
          isNotNull(i.committedAt),
          accountId === undefined ? undefined : eq(i.accountId, accountId),
        ),
      ),
  ])
  const candidates = [booked?.last, imported?.last].filter(
    (day): day is string => typeof day === 'string',
  )
  if (candidates.length === 0) return null
  const latest = candidates.reduce((a, b) => (a > b ? a : b))
  const today = parisToday(now)
  return latest < today ? latest : today
}

/**
 * Period of `month` (or of the default month when absent) for the data in
 * scope: one call for every page that compares months.
 */
export async function resolvePeriod(
  executor: Executor,
  month: string | undefined,
  { accountId, now = new Date() }: { accountId?: string; now?: Date } = {},
): Promise<MonthPeriod> {
  const until = await dataUntil(executor, { accountId, now })
  const today = parisToday(now)
  const probe = monthPeriod(month ?? today.slice(0, 7), until, today)
  return month === undefined
    ? monthPeriod(probe.defaultMonth, until, today)
    : probe
}
