import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import { WalletKeyInputDto } from '#/crypto/wallet-keys/wallet-keys.dto'
import {
  ACCOUNT_TYPES,
  type AccountType,
  CRYPTO_ACCOUNT_SOURCES,
  CRYPTO_EXCHANGE_PROVIDERS,
  type CryptoAccountSource,
  type CryptoExchangeProvider,
} from '#/database/schema/domain-enums'

const NAME_MAX = 100
const INSTITUTION_MAX = 100
/** Keys given when a wallet account is created (more can be added later). */
const WALLET_KEYS_MAX = 20
/** `accounts.position` is a Postgres `integer`. */
const POSITION_MAX = 2_147_483_647

const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )

/** Trims, and turns an empty string into `null` ("no institution"). */
const trimToNull = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })

/** Present and non-null when sent; may be omitted (PATCH semantics). */
const NotNullIfPresent = () =>
  ValidateIf((_object: object, value: unknown) => value !== undefined)

const TYPE_DOC = {
  enum: ACCOUNT_TYPES,
  enumName: 'AccountType',
  description:
    '`checking` and `savings` are bank accounts (fed by imports, balance from transactions); `meal_voucher` is the meal-voucher card (titres-restaurant): its transactions are entered by hand, its balance comes from them and it never takes an import; the others are investment accounts (balance from dated value snapshots).',
} as const

// `null` listed in the enums so the generated client types them as nullable.
const CRYPTO_SOURCE_DOC = {
  enum: [...CRYPTO_ACCOUNT_SOURCES, null],
  enumName: 'CryptoAccountSource',
  nullable: true,
  description:
    'Crypto accounts only (null otherwise): where the holdings come from. `exchange` = computed from imported exports, `wallet` = read from public keys, `manual` = typed by hand. Set at creation.',
} as const
const CRYPTO_PROVIDER_DOC = {
  enum: [...CRYPTO_EXCHANGE_PROVIDERS, null],
  enumName: 'CryptoExchangeProvider',
  nullable: true,
  description: 'Exchange crypto accounts only (null otherwise).',
} as const

export class AccountDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty(TYPE_DOC)
  type!: AccountType

  @ApiProperty({ type: String, nullable: true })
  institution!: string | null

  @ApiProperty({
    type: 'integer',
    description: 'Display order in lists (ascending).',
  })
  position!: number

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Set when the account is archived (closed accounts are never deleted).',
  })
  archivedAt!: Date | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Current balance in cents. Transactional accounts: the most recent of the end-of-day running balance and the latest balance snapshot (the snapshot wins a tie), plus the transactions booked after that day; else the sum of all amounts. Investment accounts: latest value snapshot. Null when there is no data, or when the latest balances do not tell the end-of-day balance.',
  })
  balanceCents!: number | null

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description:
      'Calendar date the balance is known at (latest transaction or snapshot).',
  })
  balanceDate!: string | null

  @ApiProperty(CRYPTO_SOURCE_DOC)
  cryptoSource!: CryptoAccountSource | null

  @ApiProperty(CRYPTO_PROVIDER_DOC)
  cryptoProvider!: CryptoExchangeProvider | null

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Last import (exchange) or sync (wallet) of the holdings; null until the first one.',
  })
  cryptoSyncedAt!: Date | null

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date
}

export class ListAccountsQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description: 'Also return archived accounts.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  includeArchived?: boolean
}

export class CreateAccountDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: NAME_MAX })
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(NAME_MAX)
  name!: string

  @ApiProperty(TYPE_DOC)
  @IsIn(ACCOUNT_TYPES)
  type!: AccountType

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: INSTITUTION_MAX,
    example: 'CIC',
  })
  @IsOptional()
  @trimToNull()
  @IsString()
  @MaxLength(INSTITUTION_MAX)
  institution?: string | null

  @ApiPropertyOptional({
    enum: CRYPTO_ACCOUNT_SOURCES,
    enumName: 'CryptoAccountSource',
    description:
      'Crypto accounts only: where the holdings come from (default `manual`). A `manual` account can later become an exchange or a wallet (`PUT /accounts/:id/crypto-source`).',
  })
  @IsOptional()
  @IsIn(CRYPTO_ACCOUNT_SOURCES)
  cryptoSource?: CryptoAccountSource

  @ApiPropertyOptional({
    enum: CRYPTO_EXCHANGE_PROVIDERS,
    enumName: 'CryptoExchangeProvider',
    description:
      'Required for an `exchange` crypto account, refused otherwise.',
  })
  @IsOptional()
  @IsIn(CRYPTO_EXCHANGE_PROVIDERS)
  cryptoProvider?: CryptoExchangeProvider

  @ApiPropertyOptional({
    type: [WalletKeyInputDto],
    maxItems: WALLET_KEYS_MAX,
    description:
      'At least one for a `wallet` crypto account, refused otherwise. Each key is validated (format and checksum) before anything is saved.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(WALLET_KEYS_MAX)
  @ValidateNested({ each: true })
  @Type(() => WalletKeyInputDto)
  walletKeys?: WalletKeyInputDto[]
}

/** Sources a `manual` crypto account can be turned into. */
export const CONVERTIBLE_CRYPTO_SOURCES = ['exchange', 'wallet'] as const

/**
 * Turns a `manual` crypto account into an exchange (with its provider) or a
 * wallet (with its public keys), e.g. one set up by hand before it could be
 * read from its exports or keys.
 */
export class ChangeCryptoSourceDto {
  @ApiProperty({
    enum: CONVERTIBLE_CRYPTO_SOURCES,
    description: 'The new source: `exchange` or `wallet`.',
  })
  @IsIn(CONVERTIBLE_CRYPTO_SOURCES)
  cryptoSource!: (typeof CONVERTIBLE_CRYPTO_SOURCES)[number]

  @ApiPropertyOptional({
    enum: CRYPTO_EXCHANGE_PROVIDERS,
    enumName: 'CryptoExchangeProvider',
    description: 'Required for `exchange`, refused for `wallet`.',
  })
  @IsOptional()
  @IsIn(CRYPTO_EXCHANGE_PROVIDERS)
  cryptoProvider?: CryptoExchangeProvider

  @ApiPropertyOptional({
    type: [WalletKeyInputDto],
    maxItems: WALLET_KEYS_MAX,
    description:
      'At least one for `wallet`, refused for `exchange`. Validated (format and checksum) before anything is saved.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(WALLET_KEYS_MAX)
  @ValidateNested({ each: true })
  @Type(() => WalletKeyInputDto)
  walletKeys?: WalletKeyInputDto[]
}

/**
 * Partial update: omitted fields are left unchanged. The type cannot change
 * (transactional and investment accounts are fed differently).
 */
export class UpdateAccountDto {
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: NAME_MAX })
  @NotNullIfPresent()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(NAME_MAX)
  name?: string

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: INSTITUTION_MAX,
  })
  @IsOptional()
  @trimToNull()
  @IsString()
  @MaxLength(INSTITUTION_MAX)
  institution?: string | null

  @ApiPropertyOptional({ type: 'integer', minimum: 0 })
  @NotNullIfPresent()
  @IsInt()
  @Min(0)
  @Max(POSITION_MAX)
  position?: number

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'true archives the account (kept with its history), false restores it.',
  })
  @NotNullIfPresent()
  @IsBoolean()
  archived?: boolean
}

const count = (description: string) =>
  ApiProperty({ type: 'integer', minimum: 0, description })

/**
 * What deleting an account takes with it (#297), for the confirmation. Budgets
 * and categories are never touched; closed months keep their frozen report.
 */
export class AccountDeletionPreviewDto {
  @count('Transactions of the account, imported or entered by hand.')
  transactions!: number

  @count('Bank imports and crypto exchange imports of the account.')
  imports!: number

  @count('Balance or value snapshots.')
  snapshots!: number

  @count('Crypto holding lines (imported, synced or typed by hand).')
  cryptoHoldings!: number

  @count('Wallet public keys and tokens read for the account.')
  walletKeys!: number

  @count('Recurring items (subscriptions, fixed costs) found on the account.')
  recurringItems!: number

  @count('Categorization rules limited to this account.')
  rules!: number

  @count('Savings goals counting this account (the goals themselves stay).')
  savingsGoals!: number

  @count(
    'Closed months with data of this account: their frozen report keeps its figures.',
  )
  closedMonths!: number
}
