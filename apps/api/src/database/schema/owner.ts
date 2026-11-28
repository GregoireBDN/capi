import { sql } from 'drizzle-orm'
import { uuid } from 'drizzle-orm/pg-core'
import { usersTable } from '#/user/user.schema'

/**
 * The owner of a private row (ADR 0009, #555). Filled in by the database:
 * `app_user_id()` reads the request's `app.user_id` setting (and, until the
 * request scope of #557, falls back to the only user), so an insert made
 * without an owner is refused by `NOT NULL` instead of creating an
 * ownerless row. Deleting the user deletes every row they own.
 */
export const ownerColumn = () =>
  uuid('user_id')
    .notNull()
    .default(sql`app_user_id()`)
    .references(() => usersTable.id, { onDelete: 'cascade' })
