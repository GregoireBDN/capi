import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '#/database/schema'
import {
  envelopeMovementsTable,
  envelopesTable,
  transactionLinesView,
  transactionSplitsTable,
  transactionsTable,
} from '#/database/schema'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx

/** One expense line of a transaction: its category and the owner's part. */
export interface PaidLine {
  categoryId: string | null
  /** Signed cents, the owner's part (`transaction_lines.amount_cents`). */
  amountCents: number
}

export interface CategoryPaid {
  categoryId: string | null
  /** Positive cents: what the envelope paid in this category. */
  paidCents: number
}

/**
 * What an envelope paid of a transaction (`spendCents`, the ledger row:
 * negative for an expense, positive for a refund), per category (ADR 0008
 * §5): its expense lines in their order, each at most its owner's part and
 * only lines of the same sign. What the lines cannot take is not attributed
 * (a share added after the envelope paid).
 */
export function attributeSpend(
  spendCents: number,
  lines: readonly PaidLine[],
): CategoryPaid[] {
  const sign = Math.sign(spendCents)
  let left = Math.abs(spendCents)
  const paid: CategoryPaid[] = []
  for (const line of lines) {
    if (left === 0) break
    if (Math.sign(line.amountCents) !== sign) continue
    const take = Math.min(left, Math.abs(line.amountCents))
    left -= take
    const index = paid.findIndex((p) => p.categoryId === line.categoryId)
    if (index >= 0) paid[index].paidCents += -sign * take
    else paid.push({ categoryId: line.categoryId, paidCents: -sign * take })
  }
  return paid
}

export interface EnvelopePaidRow {
  /** `YYYY-MM` of the expense's booking day. */
  month: string
  envelopeId: string
  envelopeName: string
  envelopeIcon: string | null
  envelopeColor: string | null
  categoryId: string | null
  /** Positive cents paid by the envelope (a refund is negative). */
  paidCents: number
}

/**
 * What envelopes paid of the expenses booked from `from` (included) to
 * `until` (excluded), per month, envelope and category.
 */
export async function envelopePaid(
  executor: Executor,
  from: string,
  until: string,
): Promise<EnvelopePaidRow[]> {
  const m = envelopeMovementsTable
  const t = transactionsTable
  const spends = await executor
    .select({
      transactionId: t.id,
      bookingDate: t.bookingDate,
      amountCents: m.amountCents,
      envelopeId: envelopesTable.id,
      envelopeName: envelopesTable.name,
      envelopeIcon: envelopesTable.icon,
      envelopeColor: envelopesTable.color,
    })
    .from(m)
    .innerJoin(t, eq(t.id, m.transactionId))
    .innerJoin(envelopesTable, eq(envelopesTable.id, m.envelopeId))
    .where(
      and(
        eq(m.reason, 'spend'),
        gte(t.bookingDate, from),
        lt(t.bookingDate, until),
      ),
    )
  if (spends.length === 0) return []

  const l = transactionLinesView
  const s = transactionSplitsTable
  const lineRows = await executor
    .select({
      id: l.id,
      categoryId: l.categoryId,
      amountCents: l.amountCents,
    })
    .from(l)
    .leftJoin(s, eq(s.id, l.splitId))
    .where(
      and(
        inArray(
          l.id,
          spends.map((spend) => spend.transactionId),
        ),
        eq(l.kind, 'expense'),
      ),
    )
    .orderBy(asc(l.id), sql`coalesce(${s.position}, 0)`)
  const lines = new Map<string, PaidLine[]>()
  for (const row of lineRows) {
    const list = lines.get(row.id) ?? []
    list.push({ categoryId: row.categoryId, amountCents: row.amountCents })
    lines.set(row.id, list)
  }

  const out: EnvelopePaidRow[] = []
  for (const spend of spends) {
    for (const part of attributeSpend(
      spend.amountCents,
      lines.get(spend.transactionId) ?? [],
    )) {
      out.push({
        month: spend.bookingDate.slice(0, 7),
        envelopeId: spend.envelopeId,
        envelopeName: spend.envelopeName,
        envelopeIcon: spend.envelopeIcon,
        envelopeColor: spend.envelopeColor,
        categoryId: part.categoryId,
        paidCents: part.paidCents,
      })
    }
  }
  return out
}
