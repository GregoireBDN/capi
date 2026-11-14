import {
  bigint,
  boolean,
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
     * Expense noted by hand during the month (#137), before the bank export
     * that will replace it. Never counts as imported data (`coverage/`), is
     * left out of the dedupe of imports, and is reconciled with the matching
     * bank row on import (`imports/reconcile/`).
     */
    manual: boolean('manual').notNull().default(false),
    /**
     * Bank values of an imported row whose amount or date was corrected by
     * hand (#74): null until then. `amountCents` / `bookingDate` hold the
     * corrected values, which statistics use; the bank's data (balances,
     * continuity, dedupe of later imports, coverage) keeps reading these
     * through `bankAmountCents` / `bankBookingDate`.
     */
    originalAmountCents: bigint('original_amount_cents', { mode: 'number' }),
    originalBookingDate: date('original_booking_date', { mode: 'string' }),
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
 * is not split, else one line per part (its category and amount, everything
 * else from the transaction). Statistics that count per category (spending,
 * budgets, month report, savings flows, transaction totals) read this view,
 * so a split counts in each of its categories.
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
  kind: transactionKindEnum('kind').notNull(),
  categoryId: uuid('category_id'),
  needsReview: boolean('needs_review').notNull(),
  isOneOff: boolean('is_one_off').notNull(),
  manual: boolean('manual').notNull(),
}).as(
  sql`select t.id, s.id as split_id, t.account_id, t.import_id, t.booking_date, case when s.id is null then t.amount_cents else s.amount_cents end as amount_cents, t.raw_label, t.merchant, t.kind, case when s.id is null then t.category_id else s.category_id end as category_id, t.needs_review, t.is_one_off, t.manual from transactions t left join transaction_splits s on s.transaction_id = t.id`,
)

/** Amount as the bank gave it: the original of a corrected row. */
export const bankAmountCents =
  sql<number>`coalesce(${transactionsTable.originalAmountCents}, ${transactionsTable.amountCents})`.mapWith(
    Number,
  )

/** Booking date as the bank gave it: the original of a corrected row. */
export const bankBookingDate = sql<string>`coalesce(${transactionsTable.originalBookingDate}, ${transactionsTable.bookingDate})`

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
