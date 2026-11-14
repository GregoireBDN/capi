import { sql } from 'drizzle-orm'
import {
  ACCOUNT_TYPES,
  CRYPTO_ACCOUNT_SOURCES,
  CRYPTO_EXCHANGE_PROVIDERS,
} from '#/database/schema/domain-enums'
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { coreColumns } from '#/database/schema/core.schema'

export const accountTypeEnum = pgEnum('account_type', ACCOUNT_TYPES)
export const cryptoAccountSourceEnum = pgEnum(
  'crypto_account_source',
  CRYPTO_ACCOUNT_SOURCES,
)
export const cryptoExchangeProviderEnum = pgEnum(
  'crypto_exchange_provider',
  CRYPTO_EXCHANGE_PROVIDERS,
)

export const accountsTable = pgTable(
  'accounts',
  {
    ...coreColumns,
    name: varchar('name', { length: 100 }).notNull(),
    type: accountTypeEnum('type').notNull(),
    institution: varchar('institution', { length: 100 }),
    /** Display order in lists and dashboards. */
    position: integer('position').notNull().default(0),
    /** Closed accounts are archived, never deleted, so history stays intact. */
    archivedAt: timestamp('archived_at'),
    /**
     * Crypto accounts only: where the holdings come from (exchange exports,
     * wallet public keys or typed by hand). Set at creation, never changed.
     */
    cryptoSource: cryptoAccountSourceEnum('crypto_source'),
    /** Exchange crypto accounts only: whose exports are imported. */
    cryptoProvider: cryptoExchangeProviderEnum('crypto_provider'),
    /** Last import (exchange) or sync (wallet) of the holdings. */
    cryptoSyncedAt: timestamp('crypto_synced_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'accounts_crypto_source_iff_crypto',
      sql`(${t.type} = 'crypto') = (${t.cryptoSource} IS NOT NULL)`,
    ),
    check(
      'accounts_crypto_provider_iff_exchange',
      sql`(${t.cryptoSource} IS NOT DISTINCT FROM 'exchange') = (${t.cryptoProvider} IS NOT NULL)`,
    ),
  ],
)

/**
 * Dated value of an account. Main source of truth for investment accounts
 * (PEA, life insurance, employee savings, crypto); also used for statement
 * closing balances of transactional accounts.
 */
export const balanceSnapshotsTable = pgTable(
  'balance_snapshots',
  {
    ...coreColumns,
    accountId: uuid('account_id')
      .notNull()
      .references(() => accountsTable.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    valueCents: bigint('value_cents', { mode: 'number' }).notNull(),
    /** Net contributions to date (deposits minus withdrawals), when known. */
    contributionsCents: bigint('contributions_cents', { mode: 'number' }),
    note: text('note'),
  },
  (t) => [
    unique('balance_snapshots_account_date_unique').on(t.accountId, t.date),
    index().on(t.date),
  ],
)

export const insertAccountSchema = createInsertSchema(accountsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export const selectAccountSchema = createSelectSchema(accountsTable)

export const insertBalanceSnapshotSchema = createInsertSchema(
  balanceSnapshotsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export const selectBalanceSnapshotSchema = createSelectSchema(
  balanceSnapshotsTable,
)

export type InsertAccount = typeof accountsTable.$inferInsert
export type SelectAccount = typeof accountsTable.$inferSelect
export type InsertBalanceSnapshot = typeof balanceSnapshotsTable.$inferInsert
export type SelectBalanceSnapshot = typeof balanceSnapshotsTable.$inferSelect
