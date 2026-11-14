import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsString, Length, Matches } from 'class-validator'
import { ASSET_ID_PATTERN } from '../dto/crypto.dto'

/** A token to read on a wallet's EVM chains ("Ajouter un jeton"). */
export class AddWalletTokenDto {
  @ApiProperty({
    type: String,
    description: 'Price provider asset id (CoinGecko id) of the token.',
    example: 'usd-coin',
  })
  @IsString()
  @Matches(ASSET_ID_PATTERN, { message: 'assetId must be a provider asset id' })
  assetId!: string

  @ApiProperty({ type: String, maxLength: 20, example: 'USDC' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(1, 20)
  symbol!: string

  @ApiProperty({ type: String, maxLength: 100, example: 'USDC' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  name!: string
}

export class WalletTokenDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: String, example: 'usd-coin' })
  assetId!: string

  @ApiProperty({ type: String, example: 'USDC' })
  symbol!: string

  @ApiProperty({ type: String, example: 'USDC' })
  name!: string
}
