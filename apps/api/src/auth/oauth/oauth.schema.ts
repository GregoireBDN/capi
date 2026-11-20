import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { accessTokenScopeEnum } from '#/auth/access-tokens/access-tokens.schema'
import { coreColumns } from '#/database/schema/core.schema'
import { usersTable } from '#/user/user.schema'

/**
 * OAuth clients registered through Dynamic Client Registration (RFC 7591) by
 * the claude.ai connectors (#78). Public clients only: no secret. A client is
 * just a self-declared name and redirect URIs (from the allow-list); it gets
 * nothing without the owner's consent.
 */
export const oauthClientsTable = pgTable('oauth_clients', {
  ...coreColumns,
  clientId: varchar('client_id', { length: 64 }).notNull().unique(),
  clientName: varchar('client_name', { length: 100 }).notNull(),
  redirectUris: text('redirect_uris').array().notNull(),
})

/**
 * One connection approved by the owner: a client, a scope (`read` or `write`,
 * the token scopes) and the resource (MCP URL) its tokens are for. Revoking
 * it revokes its tokens. Lives at most `OAUTH_GRANT_MAX_LIFETIME_MS`.
 */
export const oauthGrantsTable = pgTable(
  'oauth_grants',
  {
    ...coreColumns,
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => oauthClientsTable.id, { onDelete: 'cascade' }),
    scope: accessTokenScopeEnum('scope').notNull(),
    resource: varchar('resource', { length: 512 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('oauth_grants_user_id_idx').on(table.userId)],
)

/**
 * Authorization codes (single use, PKCE S256). `usedAt` is set by the
 * exchange; `grantId` remembers the grant it produced so a replayed code
 * revokes it (OAuth 2.1 §4.1.3).
 */
export const oauthAuthorizationCodesTable = pgTable(
  'oauth_authorization_codes',
  {
    ...coreColumns,
    codeHash: varchar('code_hash', { length: 64 }).notNull().unique(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => oauthClientsTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    redirectUri: text('redirect_uri').notNull(),
    codeChallenge: varchar('code_challenge', { length: 64 }).notNull(),
    scope: accessTokenScopeEnum('scope').notNull(),
    resource: varchar('resource', { length: 512 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    grantId: uuid('grant_id').references(() => oauthGrantsTable.id, {
      onDelete: 'cascade',
    }),
  },
)

export const OAUTH_TOKEN_KINDS = ['access', 'refresh'] as const
export type OAuthTokenKind = (typeof OAUTH_TOKEN_KINDS)[number]
export const oauthTokenKindEnum = pgEnum('oauth_token_kind', OAUTH_TOKEN_KINDS)

/**
 * Access and refresh tokens of a grant, as SHA-256 hashes. A refresh token is
 * rotated on use (`rotatedAt` + `revokedAt`); presenting it again revokes the
 * whole grant (reuse detection).
 */
export const oauthTokensTable = pgTable(
  'oauth_tokens',
  {
    ...coreColumns,
    grantId: uuid('grant_id')
      .notNull()
      .references(() => oauthGrantsTable.id, { onDelete: 'cascade' }),
    kind: oauthTokenKindEnum('kind').notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    index('oauth_tokens_grant_id_idx').on(table.grantId),
    index('oauth_tokens_expires_at_idx').on(table.expiresAt),
  ],
)

/**
 * One row per API call made with an OAuth access token, like
 * `access_token_audit`: method, route pattern and status, never the URL,
 * query, body, amounts or labels. Kept `OAUTH_AUDIT_RETENTION_DAYS`.
 */
export const oauthAuditTable = pgTable(
  'oauth_audit',
  {
    ...coreColumns,
    grantId: uuid('grant_id')
      .notNull()
      .references(() => oauthGrantsTable.id, { onDelete: 'cascade' }),
    method: varchar('method', { length: 10 }).notNull(),
    route: varchar('route', { length: 255 }).notNull(),
    statusCode: integer('status_code').notNull(),
  },
  (table) => [index('oauth_audit_created_at_idx').on(table.createdAt)],
)

export type OAuthClient = typeof oauthClientsTable.$inferSelect
export type OAuthGrant = typeof oauthGrantsTable.$inferSelect
export type OAuthToken = typeof oauthTokensTable.$inferSelect
