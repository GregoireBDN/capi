import { and, eq, isNotNull, type SQL, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '#/database/schema'
import {
  type AbsorbedManual,
  type InsertTransaction,
  type SelectTransaction,
  transactionSplitsTable,
  transactionsTable,
} from '#/database/schema'
import { manualDedupeHash } from '#/transactions/manual-transactions.service'
import { TRANSFER_MATCH_TOLERANCE_DAYS } from '#/transactions/transfer-links/match-transfers'

/**
 * What undoing a committed import costs the owner (#371, ADR 0005 R5).
 * Deleting an import deletes the rows it wrote with everything done on them
 * by hand, and re-importing the file brings back the bank rows, not the
 * edits: the confirmation says how many rows that is. The manual
 * transactions the rows absorbed on reconciliation are not lost: they are
 * put back as manual transactions.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx

const t = transactionsTable

export interface UndoImpact {
  /** Rows edited by hand, absorbed rows left out (they are put back). */
  editedCount: number
  /** Manual transactions absorbed by reconciliation, put back on undo. */
  absorbedManualCount: number
}

/**
 * A row edited by hand: something on it that re-importing the file would
 * not give back.
 *
 * - filed by hand (a category without a rule: chosen in the preview or
 *   later), a kind changed without a category, the one-off flag. Left out
 *   of a spreadsheet history import, whose rows come with the sheet's own
 *   category and flag (`byHand` false);
 * - a note, a split, a correction of the amount or the date, a prepaid
 *   subscription link;
 * - a transfer link that neither the row's rule nor matching would set
 *   again: no rule with that destination, and no other side (the opposite
 *   amount on that account, linked back, at most
 *   `TRANSFER_MATCH_TOLERANCE_DAYS` days apart).
 */
function editedByHand(byHand: boolean): SQL {
  const filedByHand = byHand
    ? sql`(${t.categoryId} is not null and ${t.ruleId} is null)
        or (${t.categoryId} is null and ${t.kind} <> (case when ${t.bankAmountCents} > 0 then 'income' else 'expense' end)::transaction_kind)
        or ${t.isOneOff}
        or `
    : sql``
  return sql`(${filedByHand}${t.note} is not null
    or exists (select 1 from transaction_splits s where s.transaction_id = ${t.id})
    or ${t.originalAmountCents} is not null
    or ${t.originalBookingDate} is not null
    or ${t.prepaidItemId} is not null
    or (${t.counterpartAccountId} is not null
      and not exists (
        select 1 from categorization_rules r
        where r.id = ${t.ruleId} and r.counterpart_account_id = ${t.counterpartAccountId}
      )
      and not exists (
        select 1 from transactions m
        where m.account_id = ${t.counterpartAccountId}
          and m.counterpart_account_id = ${t.accountId}
          and m.kind = 'transfer'
          and m.amount_cents = -${t.amountCents}
          and abs(m.booking_date - ${t.bookingDate}) <= ${TRANSFER_MATCH_TOLERANCE_DAYS}
      )))`
}

/** What undoing the import `importId` deletes and puts back. */
export async function undoImpact(
  executor: Executor,
  importId: string,
  source: string,
): Promise<UndoImpact> {
  const [row] = await executor
    .select({
      editedCount:
        sql<number>`count(*) filter (where ${t.absorbedManual} is null and ${editedByHand(source !== 'spreadsheet')})`.mapWith(
          Number,
        ),
      absorbedManualCount:
        sql<number>`count(*) filter (where ${t.absorbedManual} is not null)`.mapWith(
          Number,
        ),
    })
    .from(t)
    .where(eq(t.importId, importId))
  return row ?? { editedCount: 0, absorbedManualCount: 0 }
}

type AbsorbingRow = Pick<
  SelectTransaction,
  | 'accountId'
  | 'bookingDate'
  | 'amountCents'
  | 'kind'
  | 'categoryId'
  | 'needsReview'
  | 'isOneOff'
  | 'note'
  | 'counterpartAccountId'
  | 'prepaidItemId'
  | 'originalBookingDate'
> & { absorbedManual: AbsorbedManual }

/**
 * The manual transaction a bank row absorbed, as the owner left it: its own
 * day and typed label, and the row's current category, kind, flags, link
 * and amount (all carried over at reconciliation, and maybe edited since).
 * The day is the bank's only when the owner corrected the row's date. The
 * note the row got from the typed label (`noteFromManual`) goes back to
 * being the label; a note written since stays.
 */
export function restoredManual(row: AbsorbingRow): InsertTransaction {
  const absorbed = row.absorbedManual
  const labelAsNote =
    absorbed.note === null && row.note === absorbed.rawLabel.trim()
  return {
    accountId: row.accountId,
    importId: null,
    bookingDate:
      row.originalBookingDate !== null ? row.bookingDate : absorbed.bookingDate,
    amountCents: row.amountCents,
    rawLabel: absorbed.rawLabel,
    kind: row.kind,
    categoryId: row.categoryId,
    ruleId: null,
    needsReview: row.needsReview,
    isOneOff: row.isOneOff,
    note: labelAsNote ? null : row.note,
    counterpartAccountId: row.counterpartAccountId,
    prepaidItemId: row.prepaidItemId,
    manual: true,
    dedupeHash: manualDedupeHash(),
  }
}

/**
 * Puts back, as manual transactions, the ones the rows of `importId`
 * absorbed, each with the split of its row. Run before the rows are
 * deleted. Returns how many were put back.
 */
export async function restoreAbsorbedManual(
  tx: Tx,
  importId: string,
): Promise<number> {
  const rows = await tx
    .select({
      id: t.id,
      accountId: t.accountId,
      bookingDate: t.bookingDate,
      amountCents: t.amountCents,
      kind: t.kind,
      categoryId: t.categoryId,
      needsReview: t.needsReview,
      isOneOff: t.isOneOff,
      note: t.note,
      counterpartAccountId: t.counterpartAccountId,
      prepaidItemId: t.prepaidItemId,
      originalBookingDate: t.originalBookingDate,
      absorbedManual: t.absorbedManual,
    })
    .from(t)
    .where(and(eq(t.importId, importId), isNotNull(t.absorbedManual)))
  for (const { id, absorbedManual, ...row } of rows) {
    const [restored] = await tx
      .insert(t)
      .values(restoredManual({ ...row, absorbedManual: absorbedManual! }))
      .returning({ id: t.id })
    await tx
      .update(transactionSplitsTable)
      .set({ transactionId: restored.id })
      .where(eq(transactionSplitsTable.transactionId, id))
  }
  return rows.length
}
