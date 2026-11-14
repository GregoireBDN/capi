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
  CRYPTO_CHAINS,
  CRYPTO_KEY_FAMILIES,
  type CryptoChain,
  type CryptoKeyFamily,
} from '#/database/schema/domain-enums'

const LABEL_MAX = 100
/** Long enough to recognize (and refuse) a pasted recovery phrase. */
const PUBLIC_KEY_INPUT_MAX = 500

const CHAINS_DOC = {
  enum: CRYPTO_CHAINS,
  enumName: 'CryptoChain',
  isArray: true,
} as const

/** A public key to read a wallet from (validated and normalized by the API). */
export class WalletKeyInputDto {
  @ApiProperty({
    type: String,
    maxLength: PUBLIC_KEY_INPUT_MAX,
    description:
      'Bitcoin extended public key (xpub, ypub, zpub) or EVM address (0x…). Format and checksum are checked; private keys and recovery phrases are refused.',
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

  @ApiProperty({ type: String, nullable: true })
  label!: string | null

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date
}
