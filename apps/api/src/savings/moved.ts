import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '#/database/schema'
import { accountsTable, transactionsTable } from '#/database/schema'

type Db = PostgresJsDatabase<typeof schema>
type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * The transfer categories on a checking account that « Mis de côté » reads
 * (see `SavingsService` for the whole rule, shared with Mouvements' « Épargne »,
 * #410).
 */
export const MOVED_CATEGORIES = {
  savings: 'savings_transfer',
  investments: 'investment_transfer',
} as const

/**
 * Whether any `savings` account has transaction rows: then the moves to
 * savings are read on the savings accounts themselves, else on the checking
 * side (`savings_transfer`).
 */
export async function savingsAccountsHaveRows(
  executor: Executor,
): Promise<boolean> {
  const t = transactionsTable
  const [row] = await executor
    .select({ id: t.id })
    .from(t)
    .innerJoin(accountsTable, eq(accountsTable.id, t.accountId))
    .where(eq(accountsTable.type, 'savings'))
    .limit(1)
  return row !== undefined
}
