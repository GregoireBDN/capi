import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { accountsTable } from '#/accounts/accounts.schema'
import { coreColumns } from '#/database/schema/core.schema'
import {
  BITCOIN_ADDRESS_TYPES,
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
export const bitcoinAddressTypeEnum = pgEnum(
  'bitcoin_address_type',
  BITCOIN_ADDRESS_TYPES,
)

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
    /**
     * Bitcoin keys: the address types read. An extended key derives each of
     * them (Ledger exports `xpub` for every account type, so it is chosen by
     * the owner or detected); a single address has its own. Null for EVM
     * addresses and for an extended key whose type is still to be detected.
     */
    addressTypes: bitcoinAddressTypeEnum('address_types').array(),
    /**
     * The owner asked to detect the extended key's address types: the next
     * sync checks the first receive address of each type and keeps those with
     * history.
     */
    detectAddressTypes: boolean('detect_address_types')
      .notNull()
      .default(false),
  },
  (t) => [
    index().on(t.accountId),
    check(
      'crypto_wallet_keys_chains_not_empty',
      sql`cardinality(${t.chains}) > 0`,
    ),
  ],
)

/**
 * Resumable scan of a Bitcoin key in one address type (#268): an extended key
 * is read address by address on a rate-limited public endpoint, so what each
 * pass read is kept (`crypto_bitcoin_scan_addresses`) and a pass interrupted
 * by a rate limit resumes where it stopped. A single address is a scan of one
 * address (branch 0, index 0). `passStartedAt` is set while a pass runs (the
 * addresses read since belong to it); `completedAt` is the end of the last
 * complete pass.
 */
export const cryptoBitcoinScansTable = pgTable(
  'crypto_bitcoin_scans',
  {
    ...coreColumns,
    keyId: uuid('key_id')
      .notNull()
      .references(() => cryptoWalletKeysTable.id, { onDelete: 'cascade' }),
    addressType: bitcoinAddressTypeEnum('address_type').notNull(),
    passStartedAt: timestamp('pass_started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    unique('crypto_bitcoin_scans_key_type_unique').on(t.keyId, t.addressType),
  ],
)

/**
 * Last read state of one derived address of a scan, by branch (0 receive, 1
 * change) and index: the address itself is derived again from the key, never
 * stored.
 */
export const cryptoBitcoinScanAddressesTable = pgTable(
  'crypto_bitcoin_scan_addresses',
  {
    ...coreColumns,
    scanId: uuid('scan_id')
      .notNull()
      .references(() => cryptoBitcoinScansTable.id, { onDelete: 'cascade' }),
    branch: smallint('branch').notNull(),
    addressIndex: integer('address_index').notNull(),
    /** The address appeared in a transaction (mempool included). */
    used: boolean('used').notNull(),
    /** Confirmed balance in satoshis when read. */
    balanceSats: bigint('balance_sats', { mode: 'bigint' }).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('crypto_bitcoin_scan_addresses_unique').on(
      t.scanId,
      t.branch,
      t.addressIndex,
    ),
    check('crypto_bitcoin_scan_addresses_branch', sql`${t.branch} in (0, 1)`),
    check(
      'crypto_bitcoin_scan_addresses_index_non_negative',
      sql`${t.addressIndex} >= 0`,
    ),
    check(
      'crypto_bitcoin_scan_addresses_balance_non_negative',
      sql`${t.balanceSats} >= 0`,
    ),
  ],
)

/**
 * Tokens a wallet account reads on its EVM chains ("Ajouter un jeton"), on
 * top of the native coins and the assets it already holds. Their contracts
 * are looked up from the price provider by asset id.
 */
export const cryptoWalletTokensTable = pgTable(
  'crypto_wallet_tokens',
  {
    ...coreColumns,
    accountId: uuid('account_id')
      .notNull()
      .references(() => accountsTable.id, { onDelete: 'cascade' }),
    /**
     * Price provider asset id (CoinGecko id, e.g. `usd-coin`), or for a
     * token added by its contract `erc20.<chain id>.<contract>` (no price).
     */
    assetId: varchar('asset_id', { length: 100 }).notNull(),
    symbol: varchar('symbol', { length: 20 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    /**
     * A token added by its contract address (#269): the chain it is read
     * on, its contract (EIP-55) and decimals, read with `eth_call`. Null for
     * a token found by name, whose contracts come from the price provider.
     */
    chain: cryptoChainEnum('chain'),
    contract: varchar('contract', { length: 42 }),
    decimals: smallint('decimals'),
  },
  (t) => [
    unique('crypto_wallet_tokens_account_asset_unique').on(
      t.accountId,
      t.assetId,
    ),
    check(
      'crypto_wallet_tokens_contract_complete',
      sql`(${t.chain} is null) = (${t.contract} is null) and (${t.contract} is null) = (${t.decimals} is null)`,
    ),
    check(
      'crypto_wallet_tokens_decimals_range',
      sql`${t.decimals} between 0 and 36`,
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
    /**
     * Change of the EUR price over 24 hours in percent, signed (#295), as the
     * price API gave it with the price; null for manual prices.
     */
    change24hPercent: numeric('change_24h_percent', {
      precision: 12,
      scale: 4,
    }),
    source: cryptoPriceSourceEnum('source').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
  },
  (t) => [check('crypto_prices_price_non_negative', sql`${t.priceEur} >= 0`)],
)

export type SelectCryptoHolding = typeof cryptoHoldingsTable.$inferSelect
export type InsertCryptoHolding = typeof cryptoHoldingsTable.$inferInsert
export type SelectCryptoWalletKey = typeof cryptoWalletKeysTable.$inferSelect
export type SelectCryptoWalletToken =
  typeof cryptoWalletTokensTable.$inferSelect
export type SelectCryptoBitcoinScan =
  typeof cryptoBitcoinScansTable.$inferSelect
export type SelectCryptoPrice = typeof cryptoPricesTable.$inferSelect
