import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '#/database/schema'
import { cryptoMovementsTable } from '#/database/schema'
import { parisToday } from './days'
import type { LinkedFlow } from './performance'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * The coins each crypto account received from an exchange (#296): the
 * withdrawals linked to it, at their cost (null when unknown, #358), on
 * their Europe/Paris day, oldest first.
 */
export async function loadReceivedCoinFlows(
  executor: Db | Tx,
  accountIds: readonly string[],
): Promise<Map<string, LinkedFlow[]>> {
  const byAccount = new Map<string, LinkedFlow[]>()
  if (accountIds.length === 0) return byAccount
  const cm = cryptoMovementsTable
  const rows = await executor
    .select({
      accountId: cm.counterpartAccountId,
      occurredAt: cm.occurredAt,
      costCents: cm.costCents,
    })
    .from(cm)
    .where(
      and(
        inArray(cm.counterpartAccountId, [...accountIds]),
        eq(cm.kind, 'withdrawal'),
        ne(cm.accountId, cm.counterpartAccountId),
      ),
    )
    .orderBy(asc(cm.occurredAt), asc(cm.id))
  for (const row of rows) {
    const list = byAccount.get(row.accountId!) ?? []
    list.push({ date: parisToday(row.occurredAt), amountCents: row.costCents })
    byAccount.set(row.accountId!, list)
  }
  return byAccount
}
