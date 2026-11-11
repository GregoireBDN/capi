import { pgEnum, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { coreColumns } from '#/database/schema/core.schema'

export const themeEnum = pgEnum('theme', ['light', 'dark', 'auto'])

export const usersTable = pgTable('users', {
  ...coreColumns,
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }),
  theme: themeEnum('theme').notNull().default('auto'),
  emailVerifiedAt: timestamp('email_verified_at'),
})

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  passwordHash: true,
})

export const selectUserSchema = createSelectSchema(usersTable).omit({
  passwordHash: true,
})

export type InsertUser = typeof usersTable.$inferInsert
export type SelectUser = typeof usersTable.$inferSelect

/**
 * The columns a response may carry: an explicit allow-list, so the password
 * hash (or any secret column added later) is never selected into a reply.
 */
export const publicUserColumns = {
  id: usersTable.id,
  email: usersTable.email,
  name: usersTable.name,
  theme: usersTable.theme,
  emailVerifiedAt: usersTable.emailVerifiedAt,
  createdAt: usersTable.createdAt,
  updatedAt: usersTable.updatedAt,
}

export type PublicUser = Omit<SelectUser, 'passwordHash'>
