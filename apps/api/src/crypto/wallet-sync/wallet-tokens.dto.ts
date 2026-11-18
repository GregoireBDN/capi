import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  IsIn,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator'
import { CRYPTO_CHAINS, type CryptoChain } from '#/database/schema/domain-enums'
import { ASSET_ID_PATTERN } from '../dto/crypto.dto'
import type { EvmChain } from './chain-provider'

/** EVM chains a token can be added on by its contract. */
export const TOKEN_CHAINS = CRYPTO_CHAINS.filter(
  (chain): chain is EvmChain => chain !== 'bitcoin',
)

/**
 * A token to read on a wallet's EVM chains ("Ajouter un jeton"): found by
 * name (its price provider id, contracts looked up there), or by its
 * contract address on one chain (#269), read with `eth_call`.
 */
export class AddWalletTokenDto {
  @ApiPropertyOptional({
    type: String,
    description:
      'Price provider asset id (CoinGecko id) of the token. Required unless `contract` is given.',
    example: 'usd-coin',
  })
  @ValidateIf((dto: AddWalletTokenDto) => dto.contract === undefined)
  @IsString()
  @Matches(ASSET_ID_PATTERN, { message: 'assetId must be a provider asset id' })
  assetId?: string

  @ApiPropertyOptional({ type: String, maxLength: 20, example: 'USDC' })
  @ValidateIf((dto: AddWalletTokenDto) => dto.contract === undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(1, 20)
  symbol?: string

  @ApiPropertyOptional({ type: String, maxLength: 100, example: 'USDC' })
  @ValidateIf((dto: AddWalletTokenDto) => dto.contract === undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  name?: string

  @ApiPropertyOptional({
    type: String,
    description:
      'Contract address (`0x…`, EIP-55 checked when mixed case) of a token on `chain`. Only the address is sent to that chain’s RPC.',
    example: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  })
  @ValidateIf((dto: AddWalletTokenDto) => dto.contract !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(42)
  contract?: string

  @ApiPropertyOptional({
    enum: TOKEN_CHAINS,
    enumName: 'CryptoChain',
    description: 'Chain of `contract`. Required with it.',
  })
  @ValidateIf((dto: AddWalletTokenDto) => dto.contract !== undefined)
  @IsIn(TOKEN_CHAINS)
  chain?: EvmChain
}

export class WalletTokenDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({
    type: String,
    example: 'usd-coin',
    description:
      'Price provider id, or `erc20.<chain id>.<contract>` for a token added by its contract (no price).',
  })
  assetId!: string

  @ApiProperty({ type: String, example: 'USDC' })
  symbol!: string

  @ApiProperty({ type: String, example: 'USDC' })
  name!: string

  @ApiProperty({
    enum: CRYPTO_CHAINS,
    enumName: 'CryptoChain',
    nullable: true,
    description: 'Token added by its contract: the chain it is read on.',
  })
  chain!: CryptoChain | null

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Token added by its contract: its address (EIP-55).',
  })
  contract!: string | null

  @ApiProperty({
    type: Boolean,
    description: 'The token has a price provider id (its value is known).',
  })
  priced!: boolean
}
