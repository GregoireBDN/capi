import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'
import {
  BITCOIN_ADDRESS_TYPES,
  type BitcoinAddressType,
  CRYPTO_CHAINS,
  CRYPTO_KEY_FAMILIES,
  type CryptoChain,
  type CryptoKeyFamily,
  DERIVABLE_ADDRESS_TYPES,
} from '#/database/schema/domain-enums'

const LABEL_MAX = 100
/** Long enough to recognize (and refuse) a pasted recovery phrase. */
const PUBLIC_KEY_INPUT_MAX = 500

const CHAINS_DOC = {
  enum: CRYPTO_CHAINS,
  enumName: 'CryptoChain',
  isArray: true,
} as const

/**
 * Address type of an `xpub` (Ledger exports `xpub` for every account type),
 * or `detect` to find it on the first sync.
 */
export const WALLET_KEY_ADDRESS_TYPE_CHOICES = [
  ...DERIVABLE_ADDRESS_TYPES,
  'detect',
] as const
export type WalletKeyAddressTypeChoice =
  (typeof WALLET_KEY_ADDRESS_TYPE_CHOICES)[number]

const ADDRESS_TYPE_CHOICE_DOC = {
  enum: WALLET_KEY_ADDRESS_TYPE_CHOICES,
  enumName: 'WalletKeyAddressTypeChoice',
} as const

/** Kind of key as pasted: an extended public key, or a single address. */
export const WALLET_KEY_FORMATS = ['xpub', 'ypub', 'zpub', 'address'] as const
export type WalletKeyFormat = (typeof WALLET_KEY_FORMATS)[number]

/** A public key to read a wallet from (validated and normalized by the API). */
export class WalletKeyInputDto {
  @ApiProperty({
    type: String,
    maxLength: PUBLIC_KEY_INPUT_MAX,
    description:
      'Bitcoin extended public key (xpub, ypub, zpub), Bitcoin mainnet address (1…, 3…, bc1q…, bc1p…) or EVM address (0x…). Format and checksum are checked; private keys and recovery phrases are refused.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(PUBLIC_KEY_INPUT_MAX)
  publicKey!: string

  @ApiPropertyOptional({
    ...CHAINS_DOC,
    description:
      'Chains to read the key on. Bitcoin keys: `bitcoin` only (default). EVM addresses: one or more EVM chains (default `ethereum`).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CRYPTO_CHAINS.length)
  @ArrayUnique()
  @IsIn(CRYPTO_CHAINS, { each: true })
  chains?: CryptoChain[]

  @ApiPropertyOptional({
    ...ADDRESS_TYPE_CHOICE_DOC,
    description:
      'Extended keys only. `xpub`: the address type to derive (default `native_segwit`) or `detect` (first sync). `ypub` / `zpub`: their own type only.',
  })
  @IsOptional()
  @IsIn(WALLET_KEY_ADDRESS_TYPE_CHOICES)
  addressType?: WalletKeyAddressTypeChoice

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: LABEL_MAX,
    example: 'Compte principal',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })
  @IsString()
  @MaxLength(LABEL_MAX)
  label?: string | null
}

/** What the last complete scan of a Bitcoin key found in one type (#268). */
export class WalletKeyScanDto {
  @ApiProperty({ enum: BITCOIN_ADDRESS_TYPES, enumName: 'BitcoinAddressType' })
  addressType!: BitcoinAddressType

  @ApiProperty({
    type: 'integer',
    description:
      'Addresses with history found in this type. 0 on an xpub: probably the wrong type.',
  })
  usedAddresses!: number

  @ApiProperty({ type: String, format: 'date-time' })
  completedAt!: Date
}

export class WalletKeyDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ enum: CRYPTO_KEY_FAMILIES, enumName: 'CryptoKeyFamily' })
  family!: CryptoKeyFamily

  @ApiProperty({
    type: String,
    description: 'The key as stored (EVM addresses EIP-55 checksummed).',
  })
  publicKey!: string

  @ApiProperty(CHAINS_DOC)
  chains!: CryptoChain[]

  @ApiProperty({
    enum: WALLET_KEY_FORMATS,
    enumName: 'WalletKeyFormat',
    nullable: true,
    description:
      'Bitcoin keys: extended key prefix or `address`. Null for EVM addresses.',
  })
  format!: WalletKeyFormat | null

  @ApiProperty({
    enum: BITCOIN_ADDRESS_TYPES,
    enumName: 'BitcoinAddressType',
    isArray: true,
    nullable: true,
    description:
      'Bitcoin keys: address types read. Null for EVM addresses and while the type of an xpub is being detected.',
  })
  addressTypes!: BitcoinAddressType[] | null

  @ApiProperty({
    type: Boolean,
    description:
      'The address type of this xpub is detected on the next sync (none with history found yet).',
  })
  detectingAddressType!: boolean

  @ApiProperty({
    type: WalletKeyScanDto,
    isArray: true,
    description:
      'Bitcoin keys: the last complete scan of each address type read (empty until one completes, and for EVM addresses).',
  })
  scans!: WalletKeyScanDto[]

  @ApiProperty({ type: String, nullable: true })
  label!: string | null

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date
}

/** Changes the address type of an `xpub` key. */
export class UpdateWalletKeyDto {
  @ApiProperty(ADDRESS_TYPE_CHOICE_DOC)
  @IsIn(WALLET_KEY_ADDRESS_TYPE_CHOICES)
  addressType!: WalletKeyAddressTypeChoice
}
