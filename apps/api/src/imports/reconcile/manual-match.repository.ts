import { and, asc, between, eq } from 'drizzle-orm'
import { categoriesTable, transactionsTable } from '#/database/schema'
import type { TransactionKind } from '#/database/schema/domain-enums'
import type { DedupeExecutor } from '#/imports/dedupe/dedupe.repository'
import { type ManualExpense, manualLookupRange } from './manual-match'

/** A manual expense with what its bank row takes over from it. */
export interface StoredManualExpense extends ManualExpense {
  categoryId: string | null
  categoryName: string | null
  kind: TransactionKind
  note: string | null
  isOneOff: boolean
}

/**
 * Manual expenses of `accountId` around `periodStart`–`periodEnd` (padded by
 * the match tolerance). `lock` takes row locks, for the commit: an expense
 * edited or deleted meanwhile waits for it.
 */
export async function loadManualExpenses(
  executor: DedupeExecutor,
  accountId: string,
  periodStart: string,
  periodEnd: string,
  { lock = false }: { lock?: boolean } = {},
): Promise<StoredManualExpense[]> {
  const t = transactionsTable
  const { from, to } = manualLookupRange(periodStart, periodEnd)
  const query = executor
    .select({
      id: t.id,
      bookingDate: t.bookingDate,
      amountCents: t.amountCents,
      rawLabel: t.rawLabel,
      categoryId: t.categoryId,
      categoryName: categoriesTable.name,
      kind: t.kind,
      note: t.note,
      isOneOff: t.isOneOff,
    })
    .from(t)
    .leftJoin(categoriesTable, eq(categoriesTable.id, t.categoryId))
    .where(
      and(
        eq(t.accountId, accountId),
        eq(t.manual, true),
        between(t.bookingDate, from, to),
      ),
    )
    .orderBy(asc(t.bookingDate), asc(t.id))
  return lock ? query.for('update', { of: t }) : query
}

/**
 * Note the bank row keeps from the manual expense it replaces: its note, or
 * else the label typed when it was noted (a label left empty defaults to the
 * category name, which says nothing more).
 */
export function noteFromManual(
  manual: Pick<StoredManualExpense, 'note' | 'rawLabel' | 'categoryName'>,
): string | null {
  if (manual.note) return manual.note
  const label = manual.rawLabel.trim()
  return label === '' || label === manual.categoryName ? null : label
}
