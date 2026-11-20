import { timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Columns of every table. Instants are `timestamptz` (#367): never a
 * `timestamp` without time zone. `updated_at` is maintained by the database
 * (`set_updated_at()` trigger on every table, migration 0038), so raw SQL
 * updates move it too; `$onUpdate` only sets it earlier in Drizzle updates.
 */
export const coreColumns = {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
}
