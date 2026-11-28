import { ownerColumn } from '#/database/schema/owner'
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
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { accountsTable } from '#/accounts/accounts.schema'
import { coreColumns } from '#/database/schema/core.schema'
import type { CategoryIcon } from './category-icons'

export const transactionKindEnum = pgEnum('transaction_kind', TRANSACTION_KINDS)
export const ruleMatchTypeEnum = pgEnum('rule_match_type', RULE_MATCH_TYPES)

export const categoriesTable = pgTable(
  'categories',
  {
    ...coreColumns,
    userId: ownerColumn(),
    /** Stable identifier used by seeds, rules and the history import (e.g. `groceries`). */
    slug: varchar('slug', { length: 64 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    /** Category group: the kind given to transactions filed under this category. */
    kind: transactionKindEnum('kind').notNull(),
    color: varchar('color', { length: 16 }),
    /** One of `CATEGORY_ICONS` (#266); null shows a generic tag. */
    icon: varchar('icon', { length: 32 }).$type<CategoryIcon>(),
    /**
     * Set when the user archives the category: it leaves the pickers but keeps
     * its transactions, rules, budgets and its place in statistics.
     */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [unique('categories_slug_unique').on(t.userId, t.slug)],
)

/**
 * Slugs of default categories the user deleted, so that `pnpm db:seed` (run on
 * every deploy) does not create them again.
 */
export const deletedDefaultCategoriesTable = pgTable(
  'deleted_default_categories',
  {
    ...coreColumns,
    userId: ownerColumn(),
    slug: varchar('slug', { length: 64 }).notNull(),
  },
  (t) => [
    unique('deleted_default_categories_slug_unique').on(t.userId, t.slug),
  ],
)

/**
 * Ordered categorization rules: the first enabled rule (lowest `position`)
 * whose every non-null condition matches wins.
 */
export const categorizationRulesTable = pgTable(
  'categorization_rules',
  {
    ...coreColumns,
    userId: ownerColumn(),
    /** Creation order: breaks ties of the computed order (#299). */
    position: integer('position').notNull(),
    /**
     * Explicit precedence (#299): higher first, before the computed « most
     * specific first » order. 0 unless the owner made a rule win a conflict.
     */
    priority: integer('priority').notNull().default(0),
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
    merchant: varchar('merchant', { length: 255 }),
    /**
     * Destination account of the transfers the rule files (#296): set as
     * their counterpart when they have none. Only used on transfers.
     */
    counterpartAccountId: uuid('counterpart_account_id').references(
      () => accountsTable.id,
      { onDelete: 'set null' },
    ),
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
/**
 * A category as the rules and pickers use it; its owner (ADR 0009) is not
 * part of it, so fixtures and in-memory previews need none.
 */
export type SelectCategory = Omit<typeof categoriesTable.$inferSelect, 'userId'>
export type InsertCategorizationRule =
  typeof categorizationRulesTable.$inferInsert
/** A rule as `categorize` reads it, without its owner (see `SelectCategory`). */
export type SelectCategorizationRule = Omit<
  typeof categorizationRulesTable.$inferSelect,
  'userId'
>
