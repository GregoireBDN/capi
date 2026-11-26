import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { coreColumns } from '#/database/schema/core.schema'
import {
  RECEIVABLE_DIRECTIONS,
  RECEIVABLE_ORIGINS,
} from '#/database/schema/domain-enums'
import { recurringItemsTable } from '#/recurring/recurring.schema'
import {
  transactionSplitsTable,
  transactionsTable,
} from '#/transactions/transactions.schema'
import { contactsTable } from './contacts.schema'

export const receivableDirectionEnum = pgEnum(
  'receivable_direction',
  RECEIVABLE_DIRECTIONS,
)
export const receivableOriginEnum = pgEnum(
  'receivable_origin',
  RECEIVABLE_ORIGINS,
)

/**
 * What a contact owes the owner on an expense he paid (`owed_to_me`), or
 * what the owner owes a contact who paid for him (`i_owe`, on the manual
 * expense « Payé par … » holding his part), #359. One row per expense and
 * person. Its state is computed, never stored: « à rembourser » while
 * something is left (the share minus what was repaid and let go),
 * « remboursé » once nothing is and nothing was let go, « abandonné » once
 * nothing is and some was let go (#437; reversible).
 *
 * The `transaction_lines` view reads them (ADR 0005, R8): the owner's
 * spending is his part on the day of the expense, a linked repayment is
 * neither income nor spending, the part let go comes back into (or, for
 * `i_owe`, leaves) his spending.
 */
export const receivablesTable = pgTable(
  'receivables',
  {
    ...coreColumns,
    direction: receivableDirectionEnum('direction').notNull(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactionsTable.id, { onDelete: 'cascade' }),
    /**
     * The part of a split expense the share reduces: required when the
     * expense is split, null otherwise (splitting a shared expense is
     * refused).
     */
    splitId: uuid('split_id').references(() => transactionSplitsTable.id, {
      onDelete: 'cascade',
    }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contactsTable.id, { onDelete: 'restrict' }),
    /** Positive integer cents. */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    origin: receivableOriginEnum('origin').notNull().default('manual'),
    /** Shared recurring item that made it (`origin = recurring`). */
    recurringItemId: uuid('recurring_item_id').references(
      () => recurringItemsTable.id,
      { onDelete: 'set null' },
    ),
    note: text('note'),
    /**
     * `i_owe` only: the whole bill the contact paid (« addition 90 € »),
     * of which `amountCents` is the owner's part. Shown, never counted.
     */
    billCents: bigint('bill_cents', { mode: 'number' }),
    /**
     * « Je ne me fais pas rembourser » (or, for `i_owe`, « … ne veut pas
     * être remboursé »): the part let go, positive cents, 0 when nothing
     * was (#437). Repaid + let go never exceed the share (the
     * `receivables_settled_within_share` triggers).
     */
    forgivenCents: bigint('forgiven_cents', { mode: 'number' })
      .notNull()
      .default(0),
    /** When some was last let go: set iff `forgivenCents > 0`. */
    forgivenAt: timestamp('forgiven_at', { withTimezone: true }),
    forgivenNote: text('forgiven_note'),
  },
  (t) => [
    unique('receivables_transaction_contact_unique').on(
      t.transactionId,
      t.contactId,
    ),
    index().on(t.contactId),
    index().on(t.recurringItemId),
    check('receivables_amount_positive', sql`${t.amountCents} > 0`),
    check(
      'receivables_forgiven_within_share',
      sql`${t.forgivenCents} >= 0 and ${t.forgivenCents} <= ${t.amountCents}`,
    ),
    check(
      'receivables_forgiven_dated',
      sql`(${t.forgivenCents} > 0) = (${t.forgivenAt} is not null)`,
    ),
    check(
      'receivables_bill_covers_amount',
      sql`${t.billCents} is null or ${t.billCents} >= ${t.amountCents}`,
    ),
  ],
)

/**
 * « Compenser » (#484): what a contact owes the owner and what he owes them
 * settled against each other, `amountCents` on each side, without a
 * transfer. Its repayments (`receivable_payments.offset_id`, without a
 * transaction) are on the contact's items of both directions, adding up to
 * `amountCents` on each side: the deferred `receivable_offsets_balanced`
 * trigger says so, so an offset is made and undone as one (deleting it
 * deletes its repayments). Like « Réglé autrement », it has no line in
 * `transaction_lines`: no statistic moves.
 */
export const receivableOffsetsTable = pgTable(
  'receivable_offsets',
  {
    ...coreColumns,
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contactsTable.id, { onDelete: 'restrict' }),
    /** Settled on each side, positive integer cents. */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    offsetOn: date('offset_on', { mode: 'string' }).notNull(),
    /** Made by « Toujours compenser » rather than by the owner's tap. */
    automatic: boolean('automatic').notNull().default(false),
  },
  (t) => [
    index().on(t.contactId),
    check('receivable_offsets_amount_positive', sql`${t.amountCents} > 0`),
  ],
)

/**
 * Repayments of receivables (#359): a transfer (incoming for `owed_to_me`,
 * outgoing for `i_owe`) linked to one or several receivables, partly or in
 * full, or « Réglé autrement » without a transaction (cash, in kind). The
 * linked part of the transfer settles the debt: it is neither income nor
 * spending; what is left of it stays in its own category.
 */
export const receivablePaymentsTable = pgTable(
  'receivable_payments',
  {
    ...coreColumns,
    /**
     * `restrict` (#438): a repaid share is never removed implicitly, its
     * repayment would count as income. The deliberate wholesale deletes
     * (undoing an import, deleting an account) delete the repayments first
     * (`deletePaymentsOfShares`).
     */
    receivableId: uuid('receivable_id')
      .notNull()
      .references(() => receivablesTable.id, { onDelete: 'restrict' }),
    /** The repayment transfer; null for « Réglé autrement ». */
    transactionId: uuid('transaction_id').references(
      () => transactionsTable.id,
      { onDelete: 'cascade' },
    ),
    /** The part of a split repayment transfer it is taken from. */
    splitId: uuid('split_id').references(() => transactionSplitsTable.id, {
      onDelete: 'cascade',
    }),
    /** Positive integer cents. */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    paidOn: date('paid_on', { mode: 'string' }).notNull(),
    note: text('note'),
    /**
     * The offset this repayment is one side of (#484): no transaction then,
     * deleted with it.
     */
    offsetId: uuid('offset_id').references(() => receivableOffsetsTable.id, {
      onDelete: 'cascade',
    }),
  },
  (t) => [
    index().on(t.receivableId),
    index().on(t.transactionId),
    index().on(t.offsetId),
    check(
      'receivable_payments_offset_without_transaction',
      sql`${t.offsetId} is null or ${t.transactionId} is null`,
    ),
    check('receivable_payments_amount_positive', sql`${t.amountCents} > 0`),
    check(
      'receivable_payments_split_needs_transaction',
      sql`${t.splitId} is null or ${t.transactionId} is not null`,
    ),
  ],
)

export type SelectReceivable = typeof receivablesTable.$inferSelect
export type SelectReceivableOffset = typeof receivableOffsetsTable.$inferSelect
export type SelectReceivablePayment =
  typeof receivablePaymentsTable.$inferSelect
