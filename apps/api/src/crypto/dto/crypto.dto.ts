import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import {
  CRYPTO_ACCOUNT_SOURCES,
  CRYPTO_CHAINS,
  CRYPTO_EXCHANGE_PROVIDERS,
  CRYPTO_HOLDING_ORIGINS,
  CRYPTO_PRICE_SOURCES,
  type CryptoAccountSource,
  type CryptoExchangeProvider,
  type CryptoChain,
  type CryptoHoldingOrigin,
  type CryptoPriceSource,
} from '#/database/schema/domain-enums'

/** Why a wallet sync could not read a chain (#250). */
export const WALLET_SYNC_FAILURES = [
  'timeout',
  'network',
  'rate_limited',
  'http',
  'malformed',
  'rpc',
  'wrong_chain',
  'tokens',
  'unexpected',
] as const
export type WalletSyncFailure = (typeof WALLET_SYNC_FAILURES)[number]

/** Provider asset ids: CoinGecko-style slugs (`bitcoin`, `avalanche-2`). */
export const ASSET_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/
/** `numeric(38, 18)`: up to 20 integer digits and 18 decimals. */
export const QUANTITY_PATTERN = /^\d{1,20}(\.\d{1,18})?$/
/** `numeric(38, 12)`: up to 26 integer digits and 12 decimals. */
export const PRICE_PATTERN = /^\d{1,26}(\.\d{1,12})?$/
const NOTE_MAX = 500

const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )

/** Trims, and turns an empty string into `null`. */
const trimToNull = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })

const ASSET_ID_DOC = {
  type: String,
  description: 'Price provider asset id (CoinGecko id).',
  example: 'bitcoin',
} as const
const QUANTITY_DOC = {
  type: String,
  description:
    'Quantity as an exact decimal string with a dot (up to 18 decimals).',
  example: '0.12345678',
} as const
const INVESTED_DOC = {
  type: 'integer',
  nullable: true,
  minimum: 0,
  description: 'Total EUR invested in this holding, in cents, when known.',
} as const

/** Full replacement of a holding: omitted optional fields are cleared. */
export class SaveHoldingDto {
  @ApiProperty(ASSET_ID_DOC)
  @IsString()
  @Matches(ASSET_ID_PATTERN, { message: 'assetId must be a provider asset id' })
  assetId!: string

  @ApiProperty({ type: String, maxLength: 20, example: 'BTC' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(1, 20)
  symbol!: string

  @ApiProperty({ type: String, maxLength: 100, example: 'Bitcoin' })
  @trim()
  @IsString()
  @Length(1, 100)
  name!: string

  @ApiProperty(QUANTITY_DOC)
  @IsString()
  @Matches(QUANTITY_PATTERN, {
    message: 'quantity must be a decimal with at most 18 decimals',
  })
  quantity!: string

  @ApiPropertyOptional({
    type: String,
    maxLength: 100,
    description: 'Wallet or exchange label; empty for a single place.',
    example: 'Ledger',
  })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  location?: string

  @ApiPropertyOptional(INVESTED_DOC)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  investedCents?: number | null

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: NOTE_MAX })
  @IsOptional()
  @trimToNull()
  @IsString()
  @MaxLength(NOTE_MAX)
  note?: string | null
}

export class HoldingDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty(ASSET_ID_DOC)
  assetId!: string

  @ApiProperty({ type: String })
  symbol!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty(QUANTITY_DOC)
  quantity!: string

  @ApiProperty({ type: String, description: 'Empty for a single place.' })
  location!: string

  @ApiProperty(INVESTED_DOC)
  investedCents!: number | null

  @ApiProperty({ type: String, nullable: true })
  note!: string | null

  @ApiProperty({
    enum: CRYPTO_HOLDING_ORIGINS,
    enumName: 'CryptoHoldingOrigin',
    description:
      '`import` (exchange export) and `sync` (wallet) lines are derived and read-only; `manual` lines are typed by hand. Imports and syncs never replace manual lines.',
  })
  origin!: CryptoHoldingOrigin
}

export class ValuedHoldingDto extends HoldingDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Last known EUR price per unit (exact decimal), if any.',
    example: '61234.56',
  })
  priceEur!: string | null

  // `null` listed in the enum so the generated client types it as nullable.
  @ApiProperty({ enum: [...CRYPTO_PRICE_SOURCES, null], nullable: true })
  priceSource!: CryptoPriceSource | null

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  priceFetchedAt!: string | null

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Change of the price over 24 hours in percent, signed exact decimal, as the price API gave it with the price; null for manual prices or without one.',
    example: '-1.25',
  })
  priceChange24hPercent!: string | null

  @ApiProperty({
    type: Boolean,
    description:
      'Price API price older than the cache TTL: the last refresh failed.',
  })
  priceStale!: boolean

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'quantity × price in cents, rounded half to even.',
  })
  valueCents!: number | null

  @ApiProperty({ type: 'integer', nullable: true })
  gainCents!: number | null
}

/** Coins of one asset whose cost is unknown (#373, « sans coût connu »). */
export class UnknownCostDto {
  @ApiProperty({ type: String, description: 'Price id.' })
  assetId!: string

  @ApiProperty({ type: String })
  symbol!: string

  @ApiProperty({ type: String, description: 'Exact decimal quantity.' })
  quantity!: string
}

/**
 * What one asset of an account cost (#373, « Prix de revient »): the cost
 * of the coins whose cost is known (average cost, carried across transfers
 * between the owner's accounts) and those whose cost is unknown.
 */
export class AssetCostDto {
  @ApiProperty({ type: String, description: 'Price id.' })
  assetId!: string

  @ApiProperty({ type: String })
  symbol!: string

  @ApiProperty({ type: String, description: 'Exact decimal quantity held.' })
  quantity!: string

  @ApiProperty({
    type: 'integer',
    description: 'Cost of the coins held whose cost is known, in cents.',
  })
  costCents!: number

  @ApiProperty({
    type: String,
    description: 'Part of the quantity whose cost is unknown ("0" if none).',
  })
  unknownQuantity!: string

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Without a price: null.',
  })
  valueCents!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Value of the coins whose cost is known minus that cost; null without a price or when no coin has a known cost.',
  })
  gainCents!: number | null
}

/** Gains realised by sales into euros (#373), computed by the replay. */
export class RealisedGainsDto {
  @ApiProperty({
    type: 'integer',
    description: 'Gains of the sales of the current year (Europe/Paris).',
  })
  yearCents!: number

  @ApiProperty({ type: 'integer', description: 'Gains of every sale.' })
  totalCents!: number

  @ApiProperty({ type: 'integer', description: 'Sales counted.' })
  count!: number

  @ApiProperty({
    type: 'integer',
    description: 'Sales of coins whose cost is wholly unknown: no gain.',
  })
  unknownCount!: number
}

export class HoldingsTotalsDto {
  @ApiProperty({
    type: 'integer',
    description: 'Sum over the holdings that have a price.',
  })
  valueCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'What the account invested (#373): the cost of the coins it holds whose cost is known, plus the euros waiting on an exchange; null when it holds nothing of known cost.',
  })
  investedCents!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Value of the coins of known cost and of the euros minus `investedCents`; null while a price is missing.',
  })
  gainCents!: number | null

  @ApiProperty({ type: 'integer' })
  missingPriceCount!: number

  @ApiProperty({ type: 'integer' })
  staleCount!: number

  @ApiProperty({
    type: 'integer',
    description: 'Assets held with coins of unknown cost (`unknown`).',
  })
  withoutInvestedCount!: number

  @ApiProperty({
    type: [UnknownCostDto],
    description: 'Coins held whose cost is unknown, per asset (#373).',
  })
  unknown!: UnknownCostDto[]

  @ApiProperty({
    type: 'integer',
    description:
      'Euros waiting on an exchange (#373): in the value at face value.',
  })
  fiatCents!: number
}

export class ValuationSnapshotDto {
  @ApiProperty({ type: String, format: 'date' })
  date!: string

  @ApiProperty({ type: 'integer' })
  valueCents!: number

  @ApiProperty({ type: 'integer', nullable: true })
  contributionsCents!: number | null
}

/** A chain the latest wallet sync could not read (#250). */
export class WalletSyncChainFailureDto {
  @ApiProperty({ enum: CRYPTO_CHAINS, enumName: 'CryptoChain' })
  chain!: CryptoChain

  @ApiProperty({
    enum: WALLET_SYNC_FAILURES,
    enumName: 'WalletSyncFailure',
    description:
      '`rate_limited`: the endpoint refused too many requests (HTTP 429); `tokens`: the token contracts could not be looked up.',
  })
  reason!: WalletSyncFailure

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'End of the rate-limit backoff: the chain is not asked before (page loads and "Synchroniser" alike). Null when nothing waits.',
  })
  retryAt!: string | null
}

/** Sync state of a wallet account (#129). */
export class WalletSyncStatusDto {
  @ApiProperty({
    type: Boolean,
    description:
      'Whether the server reads wallets on chain (`WALLET_SYNC_ENABLED`). Off: holdings are typed by hand.',
  })
  enabled!: boolean

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Last successful sync.',
  })
  syncedAt!: string | null

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'When the last sync attempt failed on at least one chain: the lines of the failed chains are those of an earlier sync (stale), the other chains were read at `syncedAt`. Null once a sync reads every chain.',
  })
  failedAt!: string | null

  @ApiProperty({
    type: [WalletSyncChainFailureDto],
    description:
      'Chains the last attempt could not read, while `failedAt` is set. Kept in memory: empty after a server restart until the next sync.',
  })
  failedChains!: WalletSyncChainFailureDto[]

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'When every failed chain may be asked again (latest end of their rate-limit backoffs); null when nothing waits.',
  })
  retryAt!: string | null

  @ApiProperty({
    type: Boolean,
    description:
      'A sync of this wallet is running on the server (one a refresh started that outlived its wait): its lines change when it ends (#381).',
  })
  syncing!: boolean
}

export class AccountHoldingsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: [ValuedHoldingDto] })
  holdings!: ValuedHoldingDto[]

  @ApiProperty({ type: HoldingsTotalsDto })
  totals!: HoldingsTotalsDto

  @ApiProperty({
    type: Boolean,
    description: 'Every holding has a price, so the total values the account.',
  })
  complete!: boolean

  @ApiProperty({
    type: ValuationSnapshotDto,
    nullable: true,
    description:
      "Today's live value at the stored prices, never stored (#366); null while a holding has no price or the account was never valued.",
  })
  snapshot!: ValuationSnapshotDto | null

  @ApiProperty({ type: Boolean })
  priceApiEnabled!: boolean

  @ApiProperty({
    type: Boolean,
    description: 'A price refresh was attempted in this request and failed.',
  })
  refreshFailed!: boolean

  @ApiProperty({
    type: WalletSyncStatusDto,
    nullable: true,
    description: 'Wallet accounts only (null otherwise).',
  })
  sync!: WalletSyncStatusDto | null

  @ApiProperty({
    type: Boolean,
    description:
      'A live refresh (`mode=auto`) would do something now (#381): a price older than the cache TTL not asked since, or a wallet due a sync. The page fires it after showing these stored values.',
  })
  refreshDue!: boolean

  @ApiProperty({
    type: [AssetCostDto],
    description: 'Cost of each asset the account holds (#373).',
  })
  costs!: AssetCostDto[]

  @ApiProperty({ type: RealisedGainsDto })
  realised!: RealisedGainsDto
}

export class CryptoSummaryAccountDto extends AccountHoldingsDto {
  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: String, nullable: true })
  institution!: string | null
}

export class CryptoSummaryDto {
  @ApiProperty({ type: [CryptoSummaryAccountDto] })
  accounts!: CryptoSummaryAccountDto[]

  @ApiProperty({ type: HoldingsTotalsDto })
  totals!: HoldingsTotalsDto

  @ApiProperty({ type: Boolean })
  priceApiEnabled!: boolean

  @ApiProperty({
    type: Boolean,
    description: 'A price refresh was attempted in this request and failed.',
  })
  refreshFailed!: boolean
}

/** Where an asset of the portfolio is held: one account (#295). */
export class PortfolioPlaceDto {
  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ ...QUANTITY_DOC, description: 'Its locations summed.' })
  quantity!: string

  @ApiProperty({ type: 'integer', nullable: true })
  valueCents!: number | null
}

/** One asset of the portfolio, summed over every open crypto account. */
export class PortfolioAssetDto {
  @ApiProperty(ASSET_ID_DOC)
  assetId!: string

  @ApiProperty({ type: String })
  symbol!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({
    ...QUANTITY_DOC,
    description: 'Exact sum over every account and location.',
  })
  quantity!: string

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Last known EUR price per unit (exact decimal), if any.',
  })
  priceEur!: string | null

  @ApiProperty({ enum: [...CRYPTO_PRICE_SOURCES, null], nullable: true })
  priceSource!: CryptoPriceSource | null

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  priceFetchedAt!: string | null

  @ApiProperty({ type: Boolean })
  priceStale!: boolean

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Change of the price over 24 hours in percent (signed exact decimal); null for manual prices.',
    example: '2.4',
  })
  change24hPercent!: string | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      "Sum of its lines' values (each quantity × price rounded half to even); null without a price.",
  })
  valueCents!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'What the value moved over 24 hours, from the price change.',
  })
  change24hCents!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Cost of the coins held whose cost is known (#373); null when none is.',
  })
  investedCents!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Value of the coins of known cost minus `investedCents`; null without a price or a known cost.',
  })
  gainCents!: number | null

  @ApiProperty({
    type: String,
    description: 'Part of the quantity whose cost is unknown ("0" if none).',
  })
  unknownQuantity!: string

  @ApiProperty({
    type: Boolean,
    description:
      'False for a token known by its contract only: it never gets a price.',
  })
  priceable!: boolean

  @ApiProperty({
    type: [PortfolioPlaceDto],
    description: 'The accounts holding it, largest value first.',
  })
  places!: PortfolioPlaceDto[]
}

export class PortfolioTotalsDto {
  @ApiProperty({
    type: 'integer',
    description: 'Sum over the assets that have a price.',
  })
  valueCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Sum of the change over 24 hours of the assets that have one; null if none.',
  })
  change24hCents!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'The cost of every priced coin held whose cost is known, plus the euros waiting on exchanges (#373): it moves with buys, sales and costs given, never with transfers; null if none.',
  })
  investedCents!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Value of those coins and euros minus what was invested; coins of unknown cost are left out.',
  })
  gainCents!: number | null

  @ApiProperty({
    type: 'integer',
    description: 'Priced assets held with coins of unknown cost.',
  })
  withoutInvestedCount!: number

  @ApiProperty({
    type: [String],
    description: 'Tickers of those assets, largest value first.',
  })
  withoutInvestedSymbols!: string[]

  @ApiProperty({
    type: [UnknownCostDto],
    description: 'Coins of unknown cost per asset, largest value first.',
  })
  unknown!: UnknownCostDto[]

  @ApiProperty({
    type: 'integer',
    description: 'Euros waiting on the exchanges (in `valueCents`).',
  })
  fiatCents!: number

  @ApiProperty({ type: RealisedGainsDto })
  realised!: RealisedGainsDto

  @ApiProperty({
    type: 'integer',
    description: 'Assets waiting for a price (contract-only tokens excluded).',
  })
  missingPriceCount!: number

  @ApiProperty({ type: 'integer' })
  staleCount!: number
}

/** « Où sont mes cryptos » : an open crypto account and how fresh it is. */
export class PortfolioAccountDto {
  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: String, nullable: true })
  institution!: string | null

  @ApiProperty({
    enum: [...CRYPTO_ACCOUNT_SOURCES, null],
    enumName: 'CryptoAccountSource',
    nullable: true,
  })
  source!: CryptoAccountSource | null

  @ApiProperty({
    enum: [...CRYPTO_EXCHANGE_PROVIDERS, null],
    enumName: 'CryptoExchangeProvider',
    nullable: true,
  })
  provider!: CryptoExchangeProvider | null

  @ApiProperty({
    type: 'integer',
    description: 'Value of its priced holdings.',
  })
  valueCents!: number

  @ApiProperty({ type: 'integer' })
  holdingCount!: number

  @ApiProperty({
    type: 'integer',
    description: 'Its holdings waiting for a price.',
  })
  missingPriceCount!: number

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      "When its holdings were last fed: an exchange's last committed export, a wallet's last sync, a manual account's last edited line. Null when never.",
  })
  updatedAt!: string | null

  @ApiProperty({
    type: WalletSyncStatusDto,
    nullable: true,
    description: 'Wallet accounts only (null otherwise).',
  })
  sync!: WalletSyncStatusDto | null
}

/** The Crypto page (#295): assets across accounts, then the accounts. */
export class CryptoPortfolioDto {
  @ApiProperty({
    type: [PortfolioAssetDto],
    description:
      'Priced assets by value, largest first, then those without a price by symbol. Fiat lines are left out.',
  })
  assets!: PortfolioAssetDto[]

  @ApiProperty({ type: PortfolioTotalsDto })
  totals!: PortfolioTotalsDto

  @ApiProperty({
    type: [PortfolioAccountDto],
    description: 'Open crypto accounts, in the accounts order.',
  })
  accounts!: PortfolioAccountDto[]

  @ApiProperty({ type: Boolean })
  priceApiEnabled!: boolean

  @ApiProperty({ type: Boolean })
  walletSyncEnabled!: boolean

  @ApiProperty({
    type: Boolean,
    description: 'A price refresh was attempted in this request and failed.',
  })
  refreshFailed!: boolean

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'When the most recent price was fetched or typed.',
  })
  pricesAt!: string | null

  @ApiProperty({
    type: Boolean,
    description:
      "At least one account has today's live value (every holding priced; never stored, #366).",
  })
  valued!: boolean

  @ApiProperty({
    type: Boolean,
    description:
      'A live refresh (`POST /crypto/portfolio/refresh?mode=auto`) would do something now (#381): a price older than the cache TTL not asked since, or a wallet due a sync. Per-asset staleness is `assets[].priceStale`.',
  })
  refreshDue!: boolean
}

/** What this server reads by itself, for the forms that depend on it. */
export class CryptoSettingsDto {
  @ApiProperty({
    type: Boolean,
    description: 'Prices come from the price API (else typed by hand).',
  })
  priceApiEnabled!: boolean

  @ApiProperty({
    type: Boolean,
    description:
      'Wallet accounts are read on chain from their public keys (`WALLET_SYNC_ENABLED`); off, they stay empty until holdings are typed by hand.',
  })
  walletSyncEnabled!: boolean
}

export class ManualPriceDto {
  @ApiProperty({
    type: String,
    description:
      'EUR price per unit, exact decimal with a dot (≤ 12 decimals).',
    example: '0.000123',
  })
  @IsString()
  @Matches(PRICE_PATTERN, {
    message: 'priceEur must be a decimal with at most 12 decimals',
  })
  priceEur!: string
}

export class CryptoPriceDto {
  @ApiProperty(ASSET_ID_DOC)
  assetId!: string

  @ApiProperty({ type: String })
  priceEur!: string

  @ApiProperty({ enum: CRYPTO_PRICE_SOURCES })
  source!: CryptoPriceSource

  @ApiProperty({ type: String, format: 'date-time' })
  fetchedAt!: string
}

export class CryptoAssetDto {
  @ApiProperty(ASSET_ID_DOC)
  id!: string

  @ApiProperty({ type: String, example: 'BTC' })
  symbol!: string

  @ApiProperty({ type: String, example: 'Bitcoin' })
  name!: string

  @ApiProperty({ type: 'integer', nullable: true })
  rank!: number | null
}
