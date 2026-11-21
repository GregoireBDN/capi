import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '#/database/schema'
import {
  balanceSnapshotsTable,
  positionLinesTable,
  positionStatementsTable,
  securitiesTable,
  securityPricesTable,
} from '#/database/schema'
import type { PositionStatementSource } from '#/database/schema/domain-enums'
import {
  byDay,
  type PricePoint,
  type PriceSeries,
  type Statement,
  valuationDays,
  valueOn,
} from './valuation'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type Executor = Db | Tx

/** A statement as stored, with its id and source. */
export interface StoredStatement extends Statement {
  id: string
  accountId: string
  source: PositionStatementSource
}

const st = positionStatementsTable
const pl = positionLinesTable

/** Canonical decimal text of a `numeric` column (`"12.500000"` → `"12.5"`). */
function canonical(text: string): string {
  if (!text.includes('.')) return text
  const trimmed = text.replace(/0+$/, '').replace(/\.$/, '')
  return trimmed === '' ? '0' : trimmed
}

/** The statements of these accounts, oldest first, with their lines. */
export async function loadStatements(
  executor: Executor,
  accountIds: readonly string[],
): Promise<Map<string, StoredStatement[]>> {
  const byAccount = new Map<string, StoredStatement[]>()
  if (accountIds.length === 0) return byAccount
  const rows = await executor
    .select({
      id: st.id,
      accountId: st.accountId,
      asOf: st.asOf,
      cashCents: st.cashCents,
      source: st.source,
      securityId: pl.securityId,
      quantity: pl.quantity,
      unitCostEur: pl.unitCostEur,
    })
    .from(st)
    .leftJoin(pl, eq(pl.statementId, st.id))
    .where(inArray(st.accountId, [...accountIds]))
    .orderBy(asc(st.asOf), asc(pl.createdAt), asc(pl.id))
  const byId = new Map<string, StoredStatement>()
  for (const row of rows) {
    let statement = byId.get(row.id)
    if (!statement) {
      statement = {
        id: row.id,
        accountId: row.accountId,
        asOf: row.asOf,
        cashCents: row.cashCents,
        source: row.source,
        lines: [],
      }
      byId.set(row.id, statement)
      const list = byAccount.get(row.accountId) ?? []
      list.push(statement)
      byAccount.set(row.accountId, list)
    }
    if (row.securityId !== null && row.quantity !== null) {
      ;(statement.lines as Statement['lines'][number][]).push({
        securityId: row.securityId,
        quantity: canonical(row.quantity),
        unitCostEur:
          row.unitCostEur === null ? null : canonical(row.unitCostEur),
      })
    }
  }
  for (const [id, list] of byAccount) byAccount.set(id, byDay(list))
  return byAccount
}

/** Each security's prices, oldest first. */
export async function loadPrices(
  executor: Executor,
  securityIds: readonly string[],
): Promise<Map<string, PricePoint[]>> {
  const series = new Map<string, PricePoint[]>()
  if (securityIds.length === 0) return series
  const rows = await executor
    .select({
      securityId: securityPricesTable.securityId,
      day: securityPricesTable.day,
      priceEur: securityPricesTable.priceEur,
      source: securityPricesTable.source,
    })
    .from(securityPricesTable)
    .where(inArray(securityPricesTable.securityId, [...securityIds]))
    .orderBy(asc(securityPricesTable.day))
  for (const row of rows) {
    const list = series.get(row.securityId) ?? []
    list.push({
      day: row.day,
      priceEur: canonical(row.priceEur),
      source: row.source,
    })
    series.set(row.securityId, list)
  }
  return series
}

/** Every security held by these statements. */
export function securityIdsOf(statements: readonly Statement[]): string[] {
  return [
    ...new Set(
      statements.flatMap((statement) =>
        statement.lines.map((line) => line.securityId),
      ),
    ),
  ]
}

/** The securities by id. */
export async function loadSecurities(
  executor: Executor,
  ids: readonly string[],
): Promise<Map<string, schema.SelectSecurity>> {
  if (ids.length === 0) return new Map()
  const rows = await executor
    .select()
    .from(securitiesTable)
    .where(inArray(securitiesTable.id, [...ids]))
  return new Map(rows.map((row) => [row.id, row]))
}

/**
 * Rewrites the account's computed values from `from` to `today` (ADR 0006
 * § 5): its computed points on or after `from` are dropped, then one is
 * written for each statement day and each price day of a security held then,
 * when every line has a price; a typed value keeps its day. Run in the
 * transaction of the write that changed the lines or the prices. Returns the
 * number of values written (counts only are ever logged).
 */
export async function revalue(
  tx: Executor,
  accountId: string,
  from: string,
  today: string,
): Promise<number> {
  const s = balanceSnapshotsTable
  await tx
    .delete(s)
    .where(
      and(
        eq(s.accountId, accountId),
        eq(s.source, 'computed'),
        gte(s.date, from),
      ),
    )
  const statements = (await loadStatements(tx, [accountId])).get(accountId)
  if (!statements || statements.length === 0) return 0
  const prices: PriceSeries = await loadPrices(tx, securityIdsOf(statements))
  const rows = valuationDays(statements, prices, from, today).flatMap((day) => {
    const value = valueOn(statements, prices, day)
    return value?.valueCents == null
      ? []
      : [{ accountId, date: day, valueCents: value.valueCents }]
  })
  if (rows.length === 0) return 0
  const written = await tx
    .insert(s)
    .values(rows.map((row) => ({ ...row, source: 'computed' as const })))
    // A typed value wins its day.
    .onConflictDoNothing({ target: [s.accountId, s.date] })
    .returning({ id: s.id })
  return written.length
}

/** Every account holding one of these securities on or after `day`. */
export async function accountsHolding(
  executor: Executor,
  securityId: string,
): Promise<string[]> {
  const rows = await executor
    .selectDistinct({ accountId: st.accountId })
    .from(st)
    .innerJoin(pl, eq(pl.statementId, st.id))
    .where(eq(pl.securityId, securityId))
  return rows.map((row) => row.accountId)
}

/** `sql` fragment: the number of statements of an account. */
export const statementCount = (accountId: string) =>
  sql<number>`(select count(*)::int from ${st} where ${st.accountId} = ${accountId})`
