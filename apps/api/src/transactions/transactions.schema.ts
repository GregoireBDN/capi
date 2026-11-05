import {
  bigint,
  boolean,
  date,
  index,
  pgTable,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
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
     * Identity of the row in its source, computed by the importer. Re-importing
     * the same row yields the same hash; legitimate identical transactions on
     * the same day get distinct hashes (the running balance differs).
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

export const insertTransactionSchema = createInsertSchema(
  transactionsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export const selectTransactionSchema = createSelectSchema(transactionsTable)

export type InsertTransaction = typeof transactionsTable.$inferInsert
export type SelectTransaction = typeof transactionsTable.$inferSelect
