import {
  RULE_MATCH_TYPES,
  TRANSACTION_KINDS,
} from '#/database/schema/domain-enums'
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { accountsTable } from '#/accounts/accounts.schema'
import { coreColumns } from '#/database/schema/core.schema'

export const transactionKindEnum = pgEnum('transaction_kind', TRANSACTION_KINDS)
export const ruleMatchTypeEnum = pgEnum('rule_match_type', RULE_MATCH_TYPES)

export const categoriesTable = pgTable('categories', {
  ...coreColumns,
  /** Stable identifier used by seeds, rules and the history import (e.g. `groceries`). */
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  /** Category group: the kind given to transactions filed under this category. */
  kind: transactionKindEnum('kind').notNull(),
  color: varchar('color', { length: 16 }),
})

/**
 * Ordered categorization rules: the first enabled rule (lowest `position`)
 * whose every non-null condition matches wins.
 */
export const categorizationRulesTable = pgTable(
  'categorization_rules',
  {
    ...coreColumns,
    position: integer('position').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    // Conditions
    matchType: ruleMatchTypeEnum('match_type').notNull().default('contains'),
    labelPattern: varchar('label_pattern', { length: 255 }).notNull(),
    accountId: uuid('account_id').references(() => accountsTable.id, {
      onDelete: 'cascade',
    }),
    minAmountCents: bigint('min_amount_cents', { mode: 'number' }),
    maxAmountCents: bigint('max_amount_cents', { mode: 'number' }),
    // Outcome
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categoriesTable.id, { onDelete: 'cascade' }),
    /** Overrides the category's kind when set (e.g. an internal transfer filed under savings). */
    kind: transactionKindEnum('kind'),
    merchant: varchar('merchant', { length: 255 }),
  },
  (t) => [index().on(t.position)],
)

export const insertCategorySchema = createInsertSchema(categoriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export const selectCategorySchema = createSelectSchema(categoriesTable)

export const insertCategorizationRuleSchema = createInsertSchema(
  categorizationRulesTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export const selectCategorizationRuleSchema = createSelectSchema(
  categorizationRulesTable,
)

export type InsertCategory = typeof categoriesTable.$inferInsert
export type SelectCategory = typeof categoriesTable.$inferSelect
export type InsertCategorizationRule =
  typeof categorizationRulesTable.$inferInsert
export type SelectCategorizationRule =
  typeof categorizationRulesTable.$inferSelect
