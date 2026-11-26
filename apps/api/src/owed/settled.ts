import { ConflictException } from '@nestjs/common'
import { and, inArray, isNotNull, or, type SQLWrapper, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '#/database/schema'
import {
  receivableOffsetsTable,
  receivablePaymentsTable,
  receivablesTable,
} from '#/database/schema'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx

/** Answered (409) when a repaid or let-go share would be removed (#438). */
export const SETTLED_SHARE_MESSAGE =
  'A share already repaid or let go cannot be removed'

/**
 * A share with repayments, or one let go, is never removed implicitly
 * (#438): removing it would unlink its repayments, whose money would then
 * count as income (or, for `i_owe`, as spending) without a word. The owner
 * unlinks the repayments, or claims the share again, first.
 *
 * Throws 409 when one of the receivables on `transactionIds` (any
 * direction) is repaid, even partly, or let go. The database refuses the
 * repaid case too (`receivable_payments.receivable_id` `ON DELETE
 * RESTRICT`).
 */
export async function assertNoSettledShare(
  executor: Executor,
  transactionIds: string[],
): Promise<void> {
  if (transactionIds.length === 0) return
  const [settled] = await executor
    .select({ id: receivablesTable.id })
    .from(receivablesTable)
    .where(
      and(
        inArray(receivablesTable.transactionId, transactionIds),
        or(
          sql`${receivablesTable.forgivenCents} > 0`,
          sql`exists (select 1 from ${receivablePaymentsTable} where ${receivablePaymentsTable.receivableId} = ${receivablesTable.id})`,
        ),
      ),
    )
    .limit(1)
  if (settled) throw new ConflictException(SETTLED_SHARE_MESSAGE)
}

/**
 * Deletes the repayments linked to the receivables on the transactions
 * `transactionIds` selects (a subquery), for
 * the deliberate wholesale deletes that remove them with their expense:
 * undoing an import (#371, counted in its warning) and deleting an account
 * (#297), with the offsets touching them, both sides (#484). Every other
 * path is refused by the database
 * (`ON DELETE RESTRICT`).
 */
export async function deletePaymentsOfShares(
  executor: Executor,
  transactionIds: SQLWrapper,
): Promise<void> {
  const shares = executor
    .select({ id: receivablesTable.id })
    .from(receivablesTable)
    .where(inArray(receivablesTable.transactionId, transactionIds))
  // An offset touching one of them is undone whole (#484): the other side
  // is owed again, as before the offset.
  await executor.delete(receivableOffsetsTable).where(
    inArray(
      receivableOffsetsTable.id,
      executor
        .select({ id: receivablePaymentsTable.offsetId })
        .from(receivablePaymentsTable)
        .where(
          and(
            isNotNull(receivablePaymentsTable.offsetId),
            inArray(receivablePaymentsTable.receivableId, shares),
          ),
        ),
    ),
  )
  await executor
    .delete(receivablePaymentsTable)
    .where(inArray(receivablePaymentsTable.receivableId, shares))
}
