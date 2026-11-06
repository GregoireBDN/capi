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
import { CRYPTO_PRICE_SOURCES } from '#/database/schema/domain-enums'

export const cryptoPriceSourceEnum = pgEnum(
  'crypto_price_source',
  CRYPTO_PRICE_SOURCES,
)

/**
 * Quantity of one asset held in one place (a hardware wallet, an exchange)
 * inside a crypto account. Quantities are exact decimals, handled as strings.
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
  },
  (t) => [
    unique('crypto_holdings_account_asset_location_unique').on(
      t.accountId,
      t.assetId,
      t.location,
    ),
    index().on(t.assetId),
    check('crypto_holdings_quantity_non_negative', sql`${t.quantity} >= 0`),
    check(
      'crypto_holdings_invested_non_negative',
      sql`${t.investedCents} >= 0`,
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
export type SelectCryptoPrice = typeof cryptoPricesTable.$inferSelect
