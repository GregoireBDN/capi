import { ownerColumn } from '#/database/schema/owner'
import { jsonb, pgTable, unique, varchar } from 'drizzle-orm/pg-core'
import { coreColumns } from '#/database/schema/core.schema'

/**
 * Durable settings of a user, one row per user and key (e.g.
 * `savings.monthly_target_cents`). Values are JSON; each key's reader
 * validates its own shape.
 */
export const appSettingsTable = pgTable(
  'app_settings',
  {
    ...coreColumns,
    userId: ownerColumn(),
    key: varchar('key', { length: 100 }).notNull(),
    value: jsonb('value').notNull(),
  },
  (t) => [unique('app_settings_key_unique').on(t.userId, t.key)],
)
