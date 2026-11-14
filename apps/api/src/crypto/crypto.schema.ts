import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { accountsTable } from '#/accounts/accounts.schema'
import { coreColumns } from '#/database/schema/core.schema'
import {
  CRYPTO_CHAINS,
  CRYPTO_HOLDING_ORIGINS,
  CRYPTO_KEY_FAMILIES,
  CRYPTO_PRICE_SOURCES,
} from '#/database/schema/domain-enums'

export const cryptoPriceSourceEnum = pgEnum(
  'crypto_price_source',
  CRYPTO_PRICE_SOURCES,
)
export const cryptoHoldingOriginEnum = pgEnum(
  'crypto_holding_origin',
  CRYPTO_HOLDING_ORIGINS,
)
export const cryptoKeyFamilyEnum = pgEnum(
  'crypto_key_family',
  CRYPTO_KEY_FAMILIES,
)
export const cryptoChainEnum = pgEnum('crypto_chain', CRYPTO_CHAINS)

/**
 * Quantity of one asset held in one place (a hardware wallet, an exchange)
 * inside a crypto account. Quantities are exact decimals, handled as strings.
 * Lines computed from an import or a sync are read-only and kept apart from
 * the lines typed by hand (`origin`), so neither overwrites the other.
 */
export const cryptoHoldingsTable = pgTable(
  'crypto_holdings',
  {
    ...coreColumns,
    accountId: uuid('account_id')
      .notNull()
      .references(() => accountsTable.id, { onDelete: 'cascade' }),
    /** Price provider asset id (CoinGecko id, e.g. `bitcoin`). */
    assetId: varchar('asset_id', { length: 100 }).notNull(),
    /** Ticker shown in lists (`BTC`). */
    symbol: varchar('symbol', { length: 20 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    quantity: numeric('quantity', { precision: 38, scale: 18 }).notNull(),
    /** Wallet or exchange label; empty when the account has a single place. */
    location: varchar('location', { length: 100 }).notNull().default(''),
    /** Total EUR invested in this holding, when known. */
    investedCents: bigint('invested_cents', { mode: 'number' }),
    note: text('note'),
    origin: cryptoHoldingOriginEnum('origin').notNull().default('manual'),
  },
  (t) => [
    unique('crypto_holdings_account_asset_location_origin_unique').on(
      t.accountId,
      t.assetId,
      t.location,
      t.origin,
    ),
    index().on(t.assetId),
    check('crypto_holdings_quantity_non_negative', sql`${t.quantity} >= 0`),
    check(
      'crypto_holdings_invested_non_negative',
      sql`${t.investedCents} >= 0`,
    ),
  ],
)

/**
 * Public key of a self-custody wallet account: a Bitcoin extended public key
 * or an EVM address, and the chains to read it on. A public key reveals the
 * whole wallet history: never log it and never send it anywhere but the wallet
 * sync. A key belongs to one account only, so a wallet is never counted twice.
 */
export const cryptoWalletKeysTable = pgTable(
  'crypto_wallet_keys',
  {
    ...coreColumns,
    accountId: uuid('account_id')
      .notNull()
      .references(() => accountsTable.id, { onDelete: 'cascade' }),
    family: cryptoKeyFamilyEnum('family').notNull(),
    /** Validated key; EVM addresses in their EIP-55 checksummed form. */
    publicKey: varchar('public_key', { length: 150 }).notNull().unique(),
    chains: cryptoChainEnum('chains').array().notNull(),
    label: varchar('label', { length: 100 }),
  },
  (t) => [
    index().on(t.accountId),
    check(
      'crypto_wallet_keys_chains_not_empty',
      sql`cardinality(${t.chains}) > 0`,
    ),
  ],
)

/** Last known EUR price of an asset: cache of the price API, or manual. */
export const cryptoPricesTable = pgTable(
  'crypto_prices',
  {
    ...coreColumns,
    assetId: varchar('asset_id', { length: 100 }).notNull().unique(),
    priceEur: numeric('price_eur', { precision: 38, scale: 12 }).notNull(),
    source: cryptoPriceSourceEnum('source').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
  },
  (t) => [check('crypto_prices_price_non_negative', sql`${t.priceEur} >= 0`)],
)

export type SelectCryptoHolding = typeof cryptoHoldingsTable.$inferSelect
export type InsertCryptoHolding = typeof cryptoHoldingsTable.$inferInsert
export type SelectCryptoWalletKey = typeof cryptoWalletKeysTable.$inferSelect
export type SelectCryptoPrice = typeof cryptoPricesTable.$inferSelect
