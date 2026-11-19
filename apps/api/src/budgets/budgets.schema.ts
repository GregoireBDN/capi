import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { categoriesTable } from '#/categories/categories.schema'
import { coreColumns } from '#/database/schema/core.schema'

/**
 * Monthly spending targets per expense category, effective-dated: the target
 * of a month is the row of the category with the latest `effectiveFrom` on or
 * before that month, so changing a target never rewrites past months.
 *
 * A row whose `monthlyTargetCents` is null ends the budget from its month on
 * (`DELETE /budgets/:categoryId`): earlier months keep their target, later
 * months have none until a new target is set.
 *
 * Only `expense` categories can have a budget (checked by `BudgetsService`).
 */
export const budgetsTable = pgTable(
  'budgets',
  {
    ...coreColumns,
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categoriesTable.id, { onDelete: 'cascade' }),
    /** First day of the month the target applies from (`YYYY-MM-01`). */
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    /** Positive integer cents per month; null = no budget from this month on. */
    monthlyTargetCents: integer('monthly_target_cents'),
    note: text('note'),
    /**
     * Envelope: followed during the month on the dashboard (« Budget »),
     * with expenses noted by hand (#137). Carried over like the note.
     */
    tracked: boolean('tracked').notNull().default(false),
  },
  (t) => [
    unique('budgets_category_effective_from_unique').on(
      t.categoryId,
      t.effectiveFrom,
    ),
    index().on(t.effectiveFrom),
    check(
      'budgets_effective_from_first_of_month',
      sql`extract(day from ${t.effectiveFrom}) = 1`,
    ),
    check(
      'budgets_monthly_target_positive',
      sql`${t.monthlyTargetCents} is null or ${t.monthlyTargetCents} > 0`,
    ),
  ],
)

export type InsertBudget = typeof budgetsTable.$inferInsert
export type SelectBudget = typeof budgetsTable.$inferSelect
