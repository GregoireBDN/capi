import { sql } from 'drizzle-orm'
import {
  ACCOUNT_TYPES,
  CRYPTO_ACCOUNT_SOURCES,
  CRYPTO_EXCHANGE_PROVIDERS,
  SNAPSHOT_SOURCES,
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
export const snapshotSourceEnum = pgEnum('snapshot_source', SNAPSHOT_SOURCES)
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
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    /**
     * Crypto accounts only: where the holdings come from (exchange exports,
     * wallet public keys or typed by hand). Set at creation, never changed.
     */
    cryptoSource: cryptoAccountSourceEnum('crypto_source'),
    /** Exchange crypto accounts only: whose exports are imported. */
    cryptoProvider: cryptoExchangeProviderEnum('crypto_provider'),
    /** Last import (exchange) or sync (wallet) of the holdings. */
    cryptoSyncedAt: timestamp('crypto_synced_at', { withTimezone: true }),
    /**
     * Wallet crypto accounts only: when the last sync attempt failed (the
     * last known holdings are kept and shown as stale); null once a sync
     * succeeds.
     */
    cryptoSyncFailedAt: timestamp('crypto_sync_failed_at', {
      withTimezone: true,
    }),
    /**
     * The last complete read of a wallet's chains, or the last edit of a
     * manual account's lines (#373): what rose or fell since is recorded as
     * observed movements dated after it. Null until the first read, which
     * records the opening position.
     */
    cryptoObservedAt: timestamp('crypto_observed_at', { withTimezone: true }),
    /**
     * What the owner invested in it up to `investedBaseOn` (« Investi au
     * … »), typed by hand, never overwritten by a valuation: PEA,
     * compte-titres (#414), life insurance and employee savings (#360). The bank transfers linked to the
     * account after that day add on top. Never a crypto account, whose cost
     * follows its coins (#373: one replay, the owner's answers per movement),
     * nor a cash account.
     */
    investedBaseCents: bigint('invested_base_cents', { mode: 'number' }),
    investedBaseOn: date('invested_base_on', { mode: 'string' }),
    /**
     * The day the account was opened (ADR 0006): a PEA's 5-year mark is
     * counted from it (a compte-titres has none, #414). Investment accounts
     * that take an invested base only.
     */
    openedOn: date('opened_on', { mode: 'string' }),
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
    // Sync times of the holdings: crypto accounts only (#367).
    check(
      'accounts_crypto_sync_only_crypto',
      sql`${t.type} = 'crypto' or (${t.cryptoSyncedAt} is null and ${t.cryptoSyncFailedAt} is null)`,
    ),
    check(
      'accounts_crypto_observed_only_wallet_or_manual',
      sql`${t.cryptoObservedAt} IS NULL OR ${t.cryptoSource} IN ('wallet', 'manual')`,
    ),
    check(
      'accounts_invested_base_both',
      sql`(${t.investedBaseCents} IS NULL) = (${t.investedBaseOn} IS NULL)`,
    ),
    // `type::text`: an enum value added by a migration can't be used as an
    // enum in the same transaction (`securities`, #414).
    check(
      'accounts_invested_base_type',
      sql`${t.investedBaseCents} IS NULL OR (${t.investedBaseCents} >= 0 AND ${t.type}::text IN ('brokerage', 'securities', 'life_insurance', 'employee_savings'))`,
    ),
    check(
      'accounts_opened_on_type',
      sql`${t.openedOn} IS NULL OR ${t.type}::text IN ('brokerage', 'securities', 'life_insurance', 'employee_savings')`,
    ),
  ],
)

/**
 * Dated value of an account. Main source of truth for investment accounts
 * (PEA, compte-titres, life insurance, employee savings, crypto); also used for statement
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
    /**
     * `typed` (statements, values typed by hand or through the MCP) or
     * `computed` (a crypto account's daily close, #366: never edited).
     */
    source: snapshotSourceEnum('source').notNull().default('typed'),
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
