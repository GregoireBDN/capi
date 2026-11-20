import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  pgView,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { accountsTable } from '#/accounts/accounts.schema'
import {
  categoriesTable,
  categorizationRulesTable,
  transactionKindEnum,
} from '#/categories/categories.schema'
import { coreColumns } from '#/database/schema/core.schema'
import { importsTable } from '#/imports/imports.schema'
import { recurringItemsTable } from '#/recurring/recurring.schema'

export const transactionsTable = pgTable(
  'transactions',
  {
    ...coreColumns,
    accountId: uuid('account_id')
      .notNull()
      .references(() => accountsTable.id, { onDelete: 'restrict' }),
    /** Null for transactions entered by hand. */
    importId: uuid('import_id').references(() => importsTable.id, {
      onDelete: 'cascade',
    }),
    bookingDate: date('booking_date', { mode: 'string' }).notNull(),
    valueDate: date('value_date', { mode: 'string' }),
    /** Signed integer cents: negative = money out, positive = money in. */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    /** Running balance after this row, as given by the bank export. */
    balanceAfterCents: bigint('balance_after_cents', { mode: 'number' }),
    rawLabel: text('raw_label').notNull(),
    merchant: varchar('merchant', { length: 255 }),
    kind: transactionKindEnum('kind').notNull(),
    categoryId: uuid('category_id').references(() => categoriesTable.id, {
      onDelete: 'set null',
    }),
    /** Rule that set the category; null when set by hand or by the history import. */
    ruleId: uuid('rule_id').references(() => categorizationRulesTable.id, {
      onDelete: 'set null',
    }),
    needsReview: boolean('needs_review').notNull().default(false),
    /** Exceptional expense or income, excluded from monthly averages. */
    isOneOff: boolean('is_one_off').notNull().default(false),
    note: text('note'),
    /**
     * The owner's other account a `transfer` goes to (money out) or comes
     * from (money in) (#296): set by hand, by a rule's destination account or
     * by matching the two sides of a transfer between cash accounts. Only on
     * transfers; net contributions of an investment account are derived from
     * the transfers linked to it (`investments/performance.ts`).
     */
    counterpartAccountId: uuid('counterpart_account_id').references(
      () => accountsTable.id,
      { onDelete: 'set null' },
    ),
    /**
     * Expense noted by hand during the month (#137), before the bank export
     * that will replace it. Never counts as imported data (`coverage/`), is
     * left out of the dedupe of imports, and is reconciled with the matching
     * bank row on import (`imports/reconcile/`).
     */
    manual: boolean('manual').notNull().default(false),
    /**
     * Payment of a prepaid subscription (#314): the recurring item whose term
     * it pays upfront. It counts in its month's spending but, its cost being
     * spread over the term, is left out of averages and budget suggestions
     * like a one-off (`transactionLinesView.isOneOff`).
     */
    prepaidItemId: uuid('prepaid_item_id').references(
      () => recurringItemsTable.id,
      { onDelete: 'set null' },
    ),
    /**
     * Bank values of an imported row whose amount or date was corrected by
     * hand (#74): null until then. `amountCents` / `bookingDate` hold the
     * corrected values, which statistics use; the bank's data (balances,
     * continuity, dedupe of later imports, coverage) reads `bankAmountCents`
     * / `bankBookingDate`. Only on imported rows (check constraint).
     */
    originalAmountCents: bigint('original_amount_cents', { mode: 'number' }),
    originalBookingDate: date('original_booking_date', { mode: 'string' }),
    /**
     * Amount and booking date as the bank gave them (#367): the original of a
     * corrected row, else the row's own. Computed by Postgres (generated
     * stored columns), never written; every reader of bank data (balances,
     * coverage, dedupe, continuity, month-close gaps) reads these.
     */
    bankAmountCents: bigint('bank_amount_cents', { mode: 'number' })
      .notNull()
      .generatedAlwaysAs(sql`coalesce(original_amount_cents, amount_cents)`),
    bankBookingDate: date('bank_booking_date', { mode: 'string' })
      .notNull()
      .generatedAlwaysAs(sql`coalesce(original_booking_date, booking_date)`),
    /**
     * Identity of the row in its source, computed by the importer. Re-importing
     * the same row yields the same hash; legitimate identical transactions on
     * the same day get distinct hashes through their occurrence index (see
     * `imports/dedupe/dedupe.ts`).
     */
    dedupeHash: varchar('dedupe_hash', { length: 64 }).notNull(),
  },
  (t) => [
    unique('transactions_account_dedupe_hash_unique').on(
      t.accountId,
      t.dedupeHash,
    ),
    index().on(t.accountId, t.bookingDate),
    index().on(t.bookingDate),
    index().on(t.categoryId),
    index().on(t.importId),
    index().on(t.counterpartAccountId),
    index().on(t.prepaidItemId),
    // Bank data of an account by day: balances, coverage, dedupe, continuity.
    index('transactions_account_bank_booking_date_idx')
      .on(t.accountId, t.bankBookingDate)
      .where(sql`not ${t.manual}`),
    // The review queue and its count in the sidebar.
    index('transactions_needs_review_idx')
      .on(t.bookingDate)
      .where(sql`${t.needsReview}`),
    check(
      'transactions_counterpart_not_own_account',
      sql`${t.counterpartAccountId} <> ${t.accountId}`,
    ),
    // A row is entered by hand iff it has no import (#367).
    check(
      'transactions_manual_iff_no_import',
      sql`${t.manual} = (${t.importId} is null)`,
    ),
    check(
      'transactions_manual_iff_manual_hash',
      sql`${t.manual} = (${t.dedupeHash} like 'manual:%')`,
    ),
    check(
      'transactions_counterpart_only_on_transfers',
      sql`${t.counterpartAccountId} is null or ${t.kind} = 'transfer'`,
    ),
    check(
      'transactions_prepaid_only_on_expenses',
      sql`${t.prepaidItemId} is null or ${t.kind} = 'expense'`,
    ),
    // A hand correction keeps the bank's values: imported rows only.
    check(
      'transactions_correction_only_on_bank_rows',
      sql`not ${t.manual} or (${t.originalAmountCents} is null and ${t.originalBookingDate} is null)`,
    ),
  ],
)

/**
 * Parts of a transaction split between several categories (#74): one row per
 * part, same sign as the transaction, summing exactly to its amount. The
 * transaction keeps the category of its largest part for display; statistics
 * and budgets read the parts through `transactionLinesView`.
 */
export const transactionSplitsTable = pgTable(
  'transaction_splits',
  {
    ...coreColumns,
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactionsTable.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categoriesTable.id, { onDelete: 'restrict' }),
    /** Signed integer cents, same sign as the transaction. */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    position: integer('position').notNull(),
  },
  (t) => [
    unique('transaction_splits_position_unique').on(
      t.transactionId,
      t.position,
    ),
    index().on(t.categoryId),
  ],
)

/**
 * One line per category of each transaction: the transaction itself when it
 * is not split, else one line per part (its category, amount and kind,
 * everything else from the transaction). Statistics that count per category
 * (spending, budgets, month report, savings flows, transaction totals) read
 * this view, so a split counts in each of its categories.
 *
 * A part's kind follows its category (#357, `splitPartKind`): an incoming
 * part in an expense category is a refund of that category, an incoming part
 * in an income category is income. A transfer's parts, and a part in a
 * transfer category, keep the transaction's kind. The kind is read from the
 * category, not stored on the part: a category's kind cannot change while
 * transactions use it, and a deleted category's parts move to one of the
 * same kind, so nothing has to be kept in step.
 */
export const transactionLinesView = pgView('transaction_lines', {
  id: uuid('id').notNull(),
  splitId: uuid('split_id'),
  accountId: uuid('account_id').notNull(),
  importId: uuid('import_id'),
  bookingDate: date('booking_date', { mode: 'string' }).notNull(),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  rawLabel: text('raw_label').notNull(),
  merchant: varchar('merchant', { length: 255 }),
  /** The transaction's kind, or for a split part its own (`splitPartKind`). */
  kind: transactionKindEnum('kind').notNull(),
  categoryId: uuid('category_id'),
  needsReview: boolean('needs_review').notNull(),
  /**
   * Left out of averages: the transaction's one-off flag, or a prepaid
   * subscription payment (#314), whose cost is spread over its term.
   */
  isOneOff: boolean('is_one_off').notNull(),
  manual: boolean('manual').notNull(),
  /** The prepaid subscription this payment is for (#314). */
  prepaidItemId: uuid('prepaid_item_id'),
}).as(
  sql`select t.id, s.id as split_id, t.account_id, t.import_id, t.booking_date, case when s.id is null then t.amount_cents else s.amount_cents end as amount_cents, t.raw_label, t.merchant, case when s.id is null or t.kind = 'transfer' or sc.kind = 'transfer' then t.kind else sc.kind end as kind, case when s.id is null then t.category_id else s.category_id end as category_id, t.needs_review, (t.is_one_off or t.prepaid_item_id is not null) as is_one_off, t.manual, t.prepaid_item_id from transactions t left join transaction_splits s on s.transaction_id = t.id left join categories sc on sc.id = s.category_id`,
)

/** Amount as the bank gave it: the original of a corrected row. */
export const bankAmountCents = transactionsTable.bankAmountCents

/** Booking date as the bank gave it: the original of a corrected row. */
export const bankBookingDate = transactionsTable.bankBookingDate

export const insertTransactionSchema = createInsertSchema(
  transactionsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export const selectTransactionSchema = createSelectSchema(transactionsTable)

export type SelectTransactionSplit = typeof transactionSplitsTable.$inferSelect
export type InsertTransaction = typeof transactionsTable.$inferInsert
export type SelectTransaction = typeof transactionsTable.$inferSelect
