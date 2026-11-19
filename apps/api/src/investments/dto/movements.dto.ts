import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator'
import { ACCOUNT_TYPES, type AccountType } from '#/database/schema/domain-enums'

export class MovementAccountDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ enum: ACCOUNT_TYPES, enumName: 'AccountType' })
  type!: AccountType
}

export class InvestmentMovementDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'The transaction (`bank`) or crypto movement (`crypto`).',
  })
  id!: string

  @ApiProperty({
    enum: ['bank', 'crypto'],
    enumName: 'InvestmentMovementSource',
    description:
      '`bank`: a transfer from a bank account linked to an investment account (euros); `crypto`: coins withdrawn from or deposited to an exchange.',
  })
  source!: 'bank' | 'crypto'

  @ApiProperty({
    type: String,
    format: 'date',
    description: 'Booking day; Europe/Paris day of a crypto movement.',
  })
  date!: string

  @ApiProperty({
    type: MovementAccountDto,
    nullable: true,
    description: 'Where it left from; null when not linked.',
  })
  from!: MovementAccountDto | null

  @ApiProperty({
    type: MovementAccountDto,
    nullable: true,
    description: 'Where it went; null when not linked.',
  })
  to!: MovementAccountDto | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Euros moved (`bank`, positive), or the cost of the coins withdrawn (`crypto`, average cost; null when unknown or for a deposit).',
  })
  amountCents!: number | null

  @ApiProperty({ type: String, nullable: true, example: 'BTC' })
  asset!: string | null

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Exact quantity moved (positive), crypto movements only.',
    example: '0.0125',
  })
  quantity!: string | null

  @ApiProperty({
    enum: ['withdrawal', 'deposit'],
    enumName: 'CryptoTransferKind',
    nullable: true,
    description:
      'Crypto movements: coins leaving the exchange (`from` = the exchange) or reaching it (`to` = the exchange).',
  })
  cryptoKind!: 'withdrawal' | 'deposit' | null

  @ApiProperty({
    type: Boolean,
    description:
      'A crypto movement whose other account can be set (`PATCH /crypto-movements/{id}`).',
  })
  linkable!: boolean
}

export class InvestmentMovementsDto {
  @ApiProperty({ type: String, format: 'date' })
  from!: string

  @ApiProperty({ type: String, format: 'date' })
  to!: string

  @ApiProperty({
    type: [InvestmentMovementDto],
    description: 'Newest first.',
  })
  items!: InvestmentMovementDto[]
}

export class InvestmentMovementsQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 120,
    default: 12,
    description: 'Calendar months covered, the current one included.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  months?: number

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Only the movements of this account: bank transfers linked to it, and the crypto movements leaving or reaching it.',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string
}

export class LinkCryptoMovementDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'The owner’s other crypto account the coins went to (withdrawal) or came from (deposit); null unlinks it.',
  })
  @IsOptional()
  @IsUUID()
  counterpartAccountId!: string | null
}
