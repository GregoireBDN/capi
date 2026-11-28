import { sql } from 'drizzle-orm'
import type { DatabaseTransaction } from '#/database/database.service'

/**
 * Writes and reads as `userId` for the rest of the open transaction (ADR
 * 0009): sets `app.user_id`, which `app_user_id()` (the `user_id` default,
 * and the row-level security policies of #557) reads. Local to the
 * transaction, so a pooled connection never keeps it.
 */
export async function setOwner(
  tx: Pick<DatabaseTransaction, 'execute'>,
  userId: string,
): Promise<void> {
  await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`)
}
