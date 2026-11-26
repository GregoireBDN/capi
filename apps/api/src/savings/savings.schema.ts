import { jsonb, pgTable, varchar } from 'drizzle-orm/pg-core'
import { coreColumns } from '#/database/schema/core.schema'

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
