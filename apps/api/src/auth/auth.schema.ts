import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { coreColumns } from '#/database/schema/core.schema'
import { usersTable } from '#/user/user.schema'

export const passwordResetTokensTable = pgTable('password_reset_tokens', {
  ...coreColumns,
  userId: uuid('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
})

export const emailVerificationTokensTable = pgTable(
  'email_verification_tokens',
  {
    ...coreColumns,
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
)

/**
 * Why a refresh token was revoked (#292), so a session's end can be told
 * apart: `rotated` (renewed, its successor has `parent_id` = this row),
 * `superseded` (a successor nobody used, dropped when its sibling was
 * renewed), `reuse` (the family was burned by reuse detection), `lifetime`
 * (absolute lifetime reached), `logout`, `signed_out` (ended from the sessions
 * list) and `password` (password reset or change). Null before #292.
 */
export const REFRESH_TOKEN_REVOKE_REASONS = [
  'rotated',
  'superseded',
  'reuse',
  'lifetime',
  'logout',
  'signed_out',
  'password',
] as const
export type RefreshTokenRevokeReason =
  (typeof REFRESH_TOKEN_REVOKE_REASONS)[number]

/**
 * Rotating refresh tokens. Each row is one refresh token in a session:
 * - only the SHA-256 `tokenHash` is stored, never the token itself
 * - `familyId` groups every token descending from a single login. Each refresh
 *   rotates the token (old one revoked, new one issued in the same family,
 *   `parentId` pointing at the old one).
 * - presenting an already-revoked token is treated as theft: the whole family
 *   is revoked (reuse detection), except a token rotated less than
 *   `SESSION_REFRESH_REUSE_GRACE_MS` ago whose successors were never used
 *   (a lost response, #292).
 * - `revokedAt` supports both rotation and explicit logout revocation;
 *   `revokedReason` says which.
 */
export const refreshTokensTable = pgTable(
  'refresh_tokens',
  {
    ...coreColumns,
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /**
     * When the user last proved who they are (password or passkey) in this
     * family; copied on every rotation and put in the access JWT as `auth_time`
     * for routes that need a fresh session. Null for sessions older than #100.
     */
    authenticatedAt: timestamp('authenticated_at', { withTimezone: true }),
    /**
     * How the family started (`SessionSignInMethod`), copied on every rotation
     * for the sessions list (#217). Null for sessions older than #217.
     */
    signInMethod: varchar('sign_in_method', { length: 16 }).$type<
      'password' | 'passkey' | 'sign_up'
    >(),
    /**
     * Coarse device of the sign-in ("Safari · iPhone", `describeDevice`), copied
     * on every rotation; never the raw User-Agent. Null when unknown.
     */
    device: varchar('device', { length: 64 }),
    /** The token this one was rotated from; null for a sign-in's first token. */
    parentId: uuid('parent_id'),
    revokedReason: varchar('revoked_reason', {
      length: 16,
    }).$type<RefreshTokenRevokeReason>(),
  },
  (table) => [index('refresh_tokens_parent_id_idx').on(table.parentId)],
)

export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect
export type EmailVerificationToken =
  typeof emailVerificationTokensTable.$inferSelect
export type RefreshToken = typeof refreshTokensTable.$inferSelect
