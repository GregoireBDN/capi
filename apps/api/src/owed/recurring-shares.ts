import { and, eq, gt, gte, isNotNull, lt, notExists, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '#/database/schema'
import {
  receivablesTable,
  recurringItemsTable,
  transactionSplitsTable,
  transactionsTable,
} from '#/database/schema'
import { normalizeLabel } from '#/imports/normalize/label'
import { recurringShareOf } from './shares'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx

/**
 * Gives each charge of a recurring item shared with a contact (#359) its
 * receivable (`origin = recurring`): the debits of the item's account and
 * merchant booked from `shareFrom` on (before its cancellation date), not
 * one-off, not split, that have no share yet (a charge shared by hand keeps
 * its own). The share is the item's at the time: changing it later changes
 * later charges only. Each run only looks at the charges created since the
 * previous one (`shareAppliedAt`), so a share removed by hand from a charge
 * is never made again. Idempotent; returns how many receivables it made.
 * Runs after every detection (so after every import) and when a share is
 * set. Only `itemId`'s charges when given.
 */
export async function applyRecurringShares(
  executor: Executor,
  itemId?: string,
): Promise<number> {
  const r = recurringItemsTable
  const items = await executor
    .select({
      id: r.id,
      accountId: r.accountId,
      merchantKey: r.merchantKey,
      direction: r.direction,
      contactId: r.shareContactId,
      bps: r.shareBps,
      amountCents: r.shareAmountCents,
      from: r.shareFrom,
      endedOn: r.endedOn,
      appliedAt: r.shareAppliedAt,
    })
    .from(r)
    .where(
      and(
        eq(r.status, 'confirmed'),
        eq(r.direction, 'debit'),
        isNotNull(r.shareContactId),
        itemId === undefined ? undefined : eq(r.id, itemId),
      ),
    )

  let created = 0
  const t = transactionsTable
  for (const item of items) {
    if (item.contactId === null || item.from === null) continue
    const charges = await executor
      .select({
        id: t.id,
        amountCents: t.amountCents,
        rawLabel: t.rawLabel,
      })
      .from(t)
      .where(
        and(
          item.appliedAt === null ? undefined : gt(t.createdAt, item.appliedAt),
          eq(t.accountId, item.accountId),
          eq(t.kind, 'expense'),
          eq(t.isOneOff, false),
          sql`${t.amountCents} < 0`,
          gte(t.bookingDate, item.from),
          item.endedOn === null ? undefined : lt(t.bookingDate, item.endedOn),
          notExists(
            executor
              .select({ id: receivablesTable.id })
              .from(receivablesTable)
              .where(
                and(
                  eq(receivablesTable.transactionId, t.id),
                  eq(receivablesTable.direction, 'owed_to_me'),
                ),
              ),
          ),
          notExists(
            executor
              .select({ id: transactionSplitsTable.id })
              .from(transactionSplitsTable)
              .where(eq(transactionSplitsTable.transactionId, t.id)),
          ),
        ),
      )
    const values = charges
      .filter(
        (charge) =>
          normalizeLabel(charge.rawLabel, charge.amountCents).merchantKey ===
          item.merchantKey,
      )
      .map((charge) => ({
        direction: 'owed_to_me' as const,
        transactionId: charge.id,
        contactId: item.contactId!,
        amountCents: recurringShareOf(-charge.amountCents, {
          bps: item.bps,
          amountCents: item.amountCents,
        }),
        origin: 'recurring' as const,
        recurringItemId: item.id,
      }))
      .filter((value) => value.amountCents > 0)
    await executor
      .update(r)
      .set({ shareAppliedAt: sql`now()` })
      .where(eq(r.id, item.id))
    if (values.length === 0) continue
    const inserted = await executor
      .insert(receivablesTable)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: receivablesTable.id })
    created += inserted.length
  }
  return created
}
