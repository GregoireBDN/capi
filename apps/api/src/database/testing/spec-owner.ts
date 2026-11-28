import { type SQL, sql } from 'drizzle-orm'
import type { DatabaseTransaction } from '#/database/database.service'
import { APP_ROLE } from '#/database/app-role'
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
  // Read and write as the API does: row-level security applies (#557).
  await tx.execute(sql.raw(`set local role ${APP_ROLE}`))
  return owner.id
}

/**
 * Runs `write` as the tables' owner, then reads as the API again: for a
 * spec that builds data from before a rule by switching it off (a trigger,
 * replica mode), which `capi_app` may not do.
 */
export async function asTableOwner<T>(
  tx: { execute(query: SQL): PromiseLike<unknown> },
  write: () => Promise<T>,
): Promise<T> {
  await tx.execute(sql`reset role`)
  try {
    return await write()
  } finally {
    await tx.execute(sql.raw(`set local role ${APP_ROLE}`))
  }
}
