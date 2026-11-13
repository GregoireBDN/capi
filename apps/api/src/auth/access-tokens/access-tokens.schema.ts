import {
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { coreColumns } from '#/database/schema/core.schema'
import { usersTable } from '#/user/user.schema'

/**
 * `read`: GET routes only. `write`: also the mutating routes that explicitly
 * allow tokens (`@TokenAccess('write')`); it includes `read`.
 */
export const ACCESS_TOKEN_SCOPES = ['read', 'write'] as const
export type AccessTokenScope = (typeof ACCESS_TOKEN_SCOPES)[number]

export const accessTokenScopeEnum = pgEnum(
  'access_token_scope',
  ACCESS_TOKEN_SCOPES,
)

/**
 * Personal access tokens, used by scripts and the MCP server instead of the
 * owner's session cookies. Only the SHA-256 `tokenHash` is stored; the token
 * itself is shown once at creation. `tokenPrefix` (the first characters) lets
 * the owner recognise a token in the list.
 */
export const personalAccessTokensTable = pgTable('personal_access_tokens', {
  ...coreColumns,
  userId: uuid('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  tokenPrefix: varchar('token_prefix', { length: 16 }).notNull(),
  scope: accessTokenScopeEnum('scope').notNull(),
  /** Null = never expires. */
  expiresAt: timestamp('expires_at'),
  lastUsedAt: timestamp('last_used_at'),
  revokedAt: timestamp('revoked_at'),
})

/**
 * One row per API call made with a token: method, route pattern (never the
 * concrete URL or query string, which could carry search text) and status.
 * No amounts, labels or bodies. Pruned after `ACCESS_TOKEN_AUDIT_RETENTION_DAYS`.
 */
export const accessTokenAuditTable = pgTable(
  'access_token_audit',
  {
    ...coreColumns,
    tokenId: uuid('token_id')
      .notNull()
      .references(() => personalAccessTokensTable.id, { onDelete: 'cascade' }),
    method: varchar('method', { length: 10 }).notNull(),
    route: varchar('route', { length: 255 }).notNull(),
    statusCode: integer('status_code').notNull(),
  },
  (table) => [index('access_token_audit_created_at_idx').on(table.createdAt)],
)

export type PersonalAccessToken = typeof personalAccessTokensTable.$inferSelect
export type AccessTokenAuditEntry = typeof accessTokenAuditTable.$inferSelect
