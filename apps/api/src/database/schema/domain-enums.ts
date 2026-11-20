/**
 * Domain value lists backing the Postgres enums. The web app gets them through
 * the generated OpenAPI client. Changing a list requires a new migration.
 */

export const ACCOUNT_TYPES = [
  'checking',
  'savings',
  'brokerage',
  'life_insurance',
  'employee_savings',
  'crypto',
  'meal_voucher',
] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

/** Balance comes from transactions (imported, or entered by hand). */
export const TRANSACTIONAL_ACCOUNT_TYPES = [
  'checking',
  'savings',
  'meal_voucher',
] as const satisfies readonly AccountType[]

/**
 * Bank accounts, fed by statement imports: the transactional accounts but
 * the meal-voucher card (#298), whose transactions are all entered by hand.
 * Only they are checked for imports up to date and projected by the
 * end-of-month forecast.
 */
export const BANK_ACCOUNT_TYPES = [
  'checking',
  'savings',
] as const satisfies readonly AccountType[]

/** Tracked by dated value snapshots. */
export const INVESTMENT_ACCOUNT_TYPES = [
  'brokerage',
  'life_insurance',
  'employee_savings',
  'crypto',
] as const satisfies readonly AccountType[]

/** `transfer` = move between the user's own accounts, never counted as income or expense. */
export const TRANSACTION_KINDS = ['expense', 'income', 'transfer'] as const
export type TransactionKind = (typeof TRANSACTION_KINDS)[number]

export const RULE_MATCH_TYPES = ['contains', 'regex'] as const
export type RuleMatchType = (typeof RULE_MATCH_TYPES)[number]

export const IMPORT_SOURCES = ['cic_csv', 'spreadsheet'] as const
export type ImportSource = (typeof IMPORT_SOURCES)[number]

export const RECURRING_CADENCES = [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
] as const
export type RecurringCadence = (typeof RECURRING_CADENCES)[number]

/** `debit` = money out (subscriptions, rent), `credit` = money in (salary). */
export const RECURRING_DIRECTIONS = ['debit', 'credit'] as const
export type RecurringDirection = (typeof RECURRING_DIRECTIONS)[number]

/** `fixed` = same price every time (±1 % or ±1 €), `variable` otherwise. */
export const RECURRING_AMOUNT_TYPES = ['fixed', 'variable'] as const
export type RecurringAmountType = (typeof RECURRING_AMOUNT_TYPES)[number]

/** Detected items start `suggested`; `dismissed` ones are never suggested again. */
export const RECURRING_STATUSES = [
  'suggested',
  'confirmed',
  'dismissed',
] as const
export type RecurringStatus = (typeof RECURRING_STATUSES)[number]

/** `provider` = fetched from the price API, `manual` = entered by the user. */
export const CRYPTO_PRICE_SOURCES = ['provider', 'manual'] as const
export type CryptoPriceSource = (typeof CRYPTO_PRICE_SOURCES)[number]

/**
 * Where a value snapshot comes from (#366): `typed` (a statement, a value
 * entered by hand or through the MCP) or `computed` (a crypto account's daily
 * close, holdings × that day's price), which is never edited or deleted.
 */
export const SNAPSHOT_SOURCES = ['typed', 'computed'] as const
export type SnapshotSource = (typeof SNAPSHOT_SOURCES)[number]

/**
 * Where a savings goal's current amount comes from: the balances of its
 * linked accounts, or an amount entered by hand.
 */
export const SAVINGS_GOAL_SOURCES = ['accounts', 'manual'] as const
export type SavingsGoalSource = (typeof SAVINGS_GOAL_SOURCES)[number]

/**
 * Where a crypto account's holdings come from: an exchange's exports
 * (`exchange`), a self-custody wallet read from its public keys (`wallet`), or
 * typed by hand (`manual`, the only source before #127).
 */
export const CRYPTO_ACCOUNT_SOURCES = ['exchange', 'wallet', 'manual'] as const
export type CryptoAccountSource = (typeof CRYPTO_ACCOUNT_SOURCES)[number]

/** Exchanges whose exports can be imported (`other` = any other one). */
export const CRYPTO_EXCHANGE_PROVIDERS = [
  'binance',
  'coinbase',
  'other',
] as const
export type CryptoExchangeProvider = (typeof CRYPTO_EXCHANGE_PROVIDERS)[number]

/**
 * Kind of public key of a wallet: Bitcoin (an extended public key xpub, ypub,
 * zpub, or a single address) or an EVM address (`0x…`, the same on every EVM
 * chain).
 */
export const CRYPTO_KEY_FAMILIES = ['bitcoin', 'evm'] as const
export type CryptoKeyFamily = (typeof CRYPTO_KEY_FAMILIES)[number]

/**
 * Bitcoin address types: legacy P2PKH (`1…`, BIP44), nested SegWit
 * P2SH-P2WPKH (`3…`, BIP49), native SegWit P2WPKH (`bc1q…`, BIP84) and
 * Taproot (`bc1p…`, single addresses only). An extended key derives one or
 * more of the first three; a single address has its own.
 */
export const BITCOIN_ADDRESS_TYPES = [
  'legacy',
  'nested_segwit',
  'native_segwit',
  'taproot',
] as const
export type BitcoinAddressType = (typeof BITCOIN_ADDRESS_TYPES)[number]

/** Address types an extended public key can be derived as. */
export const DERIVABLE_ADDRESS_TYPES = [
  'legacy',
  'nested_segwit',
  'native_segwit',
] as const satisfies readonly BitcoinAddressType[]
export type DerivableAddressType = (typeof DERIVABLE_ADDRESS_TYPES)[number]

/** Chains a wallet key can be read on. */
export const CRYPTO_CHAINS = [
  'bitcoin',
  'ethereum',
  'arbitrum',
  'base',
  'optimism',
  'polygon',
  'bsc',
] as const
export type CryptoChain = (typeof CRYPTO_CHAINS)[number]

/** Chains of each key family (an EVM address is the same on all of them). */
export const CRYPTO_CHAINS_BY_FAMILY = {
  bitcoin: ['bitcoin'],
  evm: ['ethereum', 'arbitrum', 'base', 'optimism', 'polygon', 'bsc'],
} as const satisfies Record<CryptoKeyFamily, readonly CryptoChain[]>

/**
 * Where a holding line comes from: an exchange export (`import`), a wallet
 * sync (`sync`) or typed by hand (`manual`). Imports and syncs only ever
 * replace their own lines, never manual ones.
 */
export const CRYPTO_HOLDING_ORIGINS = ['import', 'sync', 'manual'] as const
export type CryptoHoldingOrigin = (typeof CRYPTO_HOLDING_ORIGINS)[number]

/**
 * What a crypto movement does. An exchange export's lines (#128): moves
 * between the owner's own places (`deposit`, `withdrawal`,
 * `transfer_internal`) only move quantities, none of them is income or
 * expense; `other` is an operation type the parser does not know, its
 * quantity still counts in the holdings. A wallet's or a manual account's
 * (#373): `observed_in` / `observed_out`, a rise or a fall of an asset seen
 * between two reads of the chain (or two edits of its lines).
 */
export const CRYPTO_MOVEMENT_KINDS = [
  'buy',
  'sell',
  'convert',
  'fee',
  'deposit',
  'withdrawal',
  'transfer_internal',
  'income',
  'other',
  'observed_in',
  'observed_out',
] as const
export type CryptoMovementKind = (typeof CRYPTO_MOVEMENT_KINDS)[number]

/** The kinds a wallet or a manual crypto account records (#373). */
export const OBSERVED_MOVEMENT_KINDS = ['observed_in', 'observed_out'] as const

/**
 * How the owner answered a movement the app could not explain (#373, « À
 * préciser »): coins that arrived were `bought` elsewhere (their cost typed)
 * or came as a `gift` (cost 0: an airdrop, staking rewards); coins that left
 * were `disposed` of (sold or given: they leave at average cost). A
 * movement that is one side of a transfer is linked instead.
 */
export const CRYPTO_MOVEMENT_RESOLUTIONS = [
  'bought',
  'gift',
  'disposed',
] as const
export type CryptoMovementResolution =
  (typeof CRYPTO_MOVEMENT_RESOLUTIONS)[number]

/** Who linked the two sides of a crypto transfer (#373). */
export const CRYPTO_TRANSFER_MATCHES = ['auto', 'manual'] as const
export type CryptoTransferMatch = (typeof CRYPTO_TRANSFER_MATCHES)[number]

/** Exchange export formats that can be imported. */
export const CRYPTO_IMPORT_FORMATS = ['binance_csv', 'coinbase_csv'] as const
export type CryptoImportFormat = (typeof CRYPTO_IMPORT_FORMATS)[number]

/**
 * Who owes whom on an expense (#359): `owed_to_me` = the owner advanced
 * money for a contact, `i_owe` = a contact paid for the owner.
 */
export const RECEIVABLE_DIRECTIONS = ['owed_to_me', 'i_owe'] as const
export type ReceivableDirection = (typeof RECEIVABLE_DIRECTIONS)[number]

/** How a receivable was made: by hand, or from a shared recurring item. */
export const RECEIVABLE_ORIGINS = ['manual', 'recurring'] as const
export type ReceivableOrigin = (typeof RECEIVABLE_ORIGINS)[number]
