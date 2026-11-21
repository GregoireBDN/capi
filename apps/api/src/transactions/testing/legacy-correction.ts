import { eq, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { transactionsTable } from '#/transactions/transactions.schema'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Executor = PgDatabase<PgQueryResultHKT, any, any>

/**
 * Spec fixtures (#398): an imported row corrected by hand before #398, when
 * corrections were still allowed (`transactions_bank_values_kept` refuses
 * new ones). The bank values are kept the way the old correction kept them;
 * triggers are off for that one update, inside the spec's transaction.
 */
export async function legacyCorrect(
  tx: Executor,
  id: string,
  values: { amountCents?: number; bookingDate?: string },
): Promise<void> {
  // Triggers off for this statement only, without locking the table (specs
  // run side by side on the test database).
  await tx.execute(sql`SET LOCAL session_replication_role = replica`)
  const [current] = await tx
    .select({
      amountCents: transactionsTable.amountCents,
      bookingDate: transactionsTable.bookingDate,
    })
    .from(transactionsTable)
    .where(eq(transactionsTable.id, id))
  await tx
    .update(transactionsTable)
    .set({
      ...(values.amountCents !== undefined
        ? {
            amountCents: values.amountCents,
            originalAmountCents: current.amountCents,
          }
        : {}),
      ...(values.bookingDate !== undefined
        ? {
            bookingDate: values.bookingDate,
            originalBookingDate: current.bookingDate,
          }
        : {}),
    })
    .where(eq(transactionsTable.id, id))
  await tx.execute(sql`SET LOCAL session_replication_role = origin`)
}
