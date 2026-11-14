import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { coreColumns } from '#/database/schema/core.schema'
import { usersTable } from '#/user/user.schema'

export const passwordResetTokensTable = pgTable('password_reset_tokens', {
  ...coreColumns,
  userId: uuid('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
})

export const emailVerificationTokensTable = pgTable('email_verification_tokens', {
  ...coreColumns,
  userId: uuid('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
})

/**
 * Rotating refresh tokens. Each row is one refresh token in a session:
 * - only the SHA-256 `tokenHash` is stored, never the token itself
 * - `familyId` groups every token descending from a single login. Each refresh
 *   rotates the token (old one revoked, new one issued in the same family).
 * - presenting an already-revoked token is treated as theft: the whole family
 *   is revoked (reuse detection).
 * - `revokedAt` supports both rotation and explicit logout revocation.
 */
export const refreshTokensTable = pgTable('refresh_tokens', {
  ...coreColumns,
  userId: uuid('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  familyId: uuid('family_id').notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  /**
   * When the user last proved who they are (password or passkey) in this
   * family; copied on every rotation and put in the access JWT as `auth_time`
   * for routes that need a fresh session. Null for sessions older than #100.
   */
  authenticatedAt: timestamp('authenticated_at'),
})

export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect
export type EmailVerificationToken = typeof emailVerificationTokensTable.$inferSelect
export type RefreshToken = typeof refreshTokensTable.$inferSelect
