import {
  bigint,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { coreColumns } from '#/database/schema/core.schema'
import { usersTable } from '#/user/user.schema'

/**
 * Passkeys (WebAuthn credentials) of the owner. `credentialId` and `publicKey`
 * are base64url strings as returned by `@simplewebauthn/server`; they identify
 * and verify the credential and are never logged or sent back to the browser
 * (the list shows the row id, name and dates only).
 */
export const webauthnCredentialsTable = pgTable('webauthn_credentials', {
  ...coreColumns,
  userId: uuid('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  credentialId: varchar('credential_id', { length: 1024 }).notNull().unique(),
  publicKey: text('public_key').notNull(),
  /** Signature counter (uint32); synced passkeys always report 0. */
  counter: bigint('counter', { mode: 'number' }).notNull().default(0),
  transports: jsonb('transports').$type<string[]>().notNull().default([]),
  /** `singleDevice` or `multiDevice` (synced, e.g. iCloud Keychain). */
  deviceType: varchar('device_type', { length: 32 }).notNull(),
  backedUp: boolean('backed_up').notNull().default(false),
  /** Shown in the profile, editable. */
  name: varchar('name', { length: 100 }).notNull(),
  lastUsedAt: timestamp('last_used_at'),
})

export const WEBAUTHN_CHALLENGE_PURPOSES = [
  'registration',
  'authentication',
] as const
export type WebauthnChallengePurpose =
  (typeof WEBAUTHN_CHALLENGE_PURPOSES)[number]

export const webauthnChallengePurposeEnum = pgEnum(
  'webauthn_challenge_purpose',
  WEBAUTHN_CHALLENGE_PURPOSES,
)

/**
 * Pending WebAuthn challenges, kept server-side: single use (deleted when a
 * response presents them, whatever the outcome) and short-lived. A
 * registration challenge belongs to the signed-in user; an authentication one
 * has no user (discoverable credentials: the passkey says whose it is).
 */
export const webauthnChallengesTable = pgTable(
  'webauthn_challenges',
  {
    ...coreColumns,
    purpose: webauthnChallengePurposeEnum('purpose').notNull(),
    challenge: varchar('challenge', { length: 255 }).notNull().unique(),
    userId: uuid('user_id').references(() => usersTable.id, {
      onDelete: 'cascade',
    }),
    expiresAt: timestamp('expires_at').notNull(),
  },
  (table) => [index('webauthn_challenges_expires_at_idx').on(table.expiresAt)],
)

export type WebauthnCredential = typeof webauthnCredentialsTable.$inferSelect
export type WebauthnChallenge = typeof webauthnChallengesTable.$inferSelect
