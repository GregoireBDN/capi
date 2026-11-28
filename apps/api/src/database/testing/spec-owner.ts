import { sql } from 'drizzle-orm'
import type { DatabaseTransaction } from '#/database/database.service'
import { setOwner } from '#/database/owner-scope'
import { usersTable } from '#/user/user.schema'

type Tx = Pick<DatabaseTransaction, 'execute' | 'insert'>

/**
 * Gives the rolled-back transaction of a database spec an owner (ADR 0009,
 * #555): a user, set as `app.user_id` for the rest of the transaction, so
 * the rows the spec writes have one. Idempotent within a transaction (nested
 * service transactions are savepoints and keep the setting).
 */
export async function asSpecOwner(tx: Tx): Promise<string> {
  const current = await tx.execute<{ id: string | null }>(
    sql`select nullif(current_setting('app.user_id', true), '') as id`,
  )
  const existing = current[0]?.id
  if (existing) return existing
  const [owner] = await tx
    .insert(usersTable)
    .values({ email: 'spec-owner@capi.test', name: 'Spec owner' })
    .returning({ id: usersTable.id })
  await setOwner(tx, owner.id)
  return owner.id
}
