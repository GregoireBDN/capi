import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { accountsTable } from '#/accounts/accounts.schema'
import { coreColumns } from '#/database/schema/core.schema'
import { SAVINGS_GOAL_SOURCES } from '#/database/schema/domain-enums'

export const savingsGoalSourceEnum = pgEnum(
  'savings_goal_source',
  SAVINGS_GOAL_SOURCES,
)

/**
 * Something the user saves for (an emergency fund, a trip, a flat deposit):
 * a target amount, an optional target date, and where the amount saved so far
 * comes from (linked accounts' balances or a manual amount).
 */
export const savingsGoalsTable = pgTable(
  'savings_goals',
  {
    ...coreColumns,
    name: varchar('name', { length: 100 }).notNull(),
    targetCents: bigint('target_cents', { mode: 'number' }).notNull(),
    /** Calendar date the target should be reached by; null = no deadline. */
    targetDate: date('target_date', { mode: 'string' }),
    source: savingsGoalSourceEnum('source').notNull().default('accounts'),
    /** Amount saved so far when `source = manual`. */
    manualAmountCents: bigint('manual_amount_cents', { mode: 'number' }),
    /** Hex colour (`#0284c7`), optional. */
    color: varchar('color', { length: 16 }),
    /** Reached or abandoned goals are archived, kept for the record. */
    archivedAt: timestamp('archived_at'),
  },
  (t) => [
    check('savings_goals_target_positive', sql`${t.targetCents} > 0`),
    check(
      'savings_goals_manual_amount_non_negative',
      sql`${t.manualAmountCents} >= 0`,
    ),
  ],
)

/** Accounts whose balances make up a goal's current amount. */
export const savingsGoalAccountsTable = pgTable(
  'savings_goal_accounts',
  {
    ...coreColumns,
    goalId: uuid('goal_id')
      .notNull()
      .references(() => savingsGoalsTable.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accountsTable.id, { onDelete: 'cascade' }),
  },
  (t) => [
    unique('savings_goal_accounts_goal_account_unique').on(
      t.goalId,
      t.accountId,
    ),
    index().on(t.accountId),
  ],
)

/**
 * Durable app-wide settings of the single user, one row per key (e.g.
 * `savings.monthly_target_cents`). Values are JSON; each key's reader
 * validates its own shape.
 */
export const appSettingsTable = pgTable('app_settings', {
  ...coreColumns,
  key: varchar('key', { length: 100 }).notNull().unique(),
  value: jsonb('value').notNull(),
})

export type SelectSavingsGoal = typeof savingsGoalsTable.$inferSelect
export type InsertSavingsGoal = typeof savingsGoalsTable.$inferInsert
