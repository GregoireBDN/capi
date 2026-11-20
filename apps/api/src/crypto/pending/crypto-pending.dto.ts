import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator'
import {
  CRYPTO_MOVEMENT_KINDS,
  type CryptoMovementKind,
} from '#/database/schema/domain-enums'

export const PENDING_TYPES = ['opening', 'arrival', 'departure'] as const
export const CRYPTO_ANSWERS = [
  'transfer',
  'bought',
  'gift',
  'disposed',
] as const
export type CryptoAnswer = (typeof CRYPTO_ANSWERS)[number]

/** Largest cost an answer takes: 100 M€. */
const MAX_COST_CENTS = 10_000_000_000

/** A movement of another account that could be the other side. */
export class CryptoPendingCandidateDto {
  @ApiProperty({ type: String, format: 'uuid' })
  movementId!: string

  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: String })
  accountName!: string

  @ApiProperty({ enum: CRYPTO_MOVEMENT_KINDS, enumName: 'CryptoMovementKind' })
  kind!: CryptoMovementKind

  @ApiProperty({ type: String, description: 'Exact decimal magnitude.' })
  quantity!: string

  @ApiProperty({ type: String, format: 'date-time' })
  at!: string
}

/** One movement the app could not explain (« À préciser », #373). */
export class CryptoPendingItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  movementId!: string

  @ApiProperty({
    enum: PENDING_TYPES,
    enumName: 'CryptoPendingType',
    description:
      '`opening`: coins of the first read whose cost is unknown (« arrivés avant le … »); `arrival`: « D’où viennent ces … ? »; `departure`: « Où sont partis ces … ? ».',
  })
  type!: (typeof PENDING_TYPES)[number]

  @ApiProperty({ type: String })
  assetId!: string

  @ApiProperty({ type: String })
  symbol!: string

  @ApiProperty({
    type: String,
    description:
      'Exact decimal magnitude; an opening: its part of unknown cost.',
  })
  quantity!: string

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'At the earliest (the read before), else `at`.',
  })
  from!: string

  @ApiProperty({ type: String, format: 'date-time' })
  at!: string

  @ApiProperty({
    type: [CryptoPendingCandidateDto],
    description:
      'What could be its other side, closest in time first (an opening: withdrawals from an exchange before it).',
  })
  candidates!: CryptoPendingCandidateDto[]
}

/** A movement answered or linked, to show and undo. */
export class CryptoAnsweredItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  movementId!: string

  @ApiProperty({ enum: PENDING_TYPES, enumName: 'CryptoPendingType' })
  type!: (typeof PENDING_TYPES)[number]

  @ApiProperty({ type: String })
  assetId!: string

  @ApiProperty({ type: String })
  symbol!: string

  @ApiProperty({ type: String })
  quantity!: string

  @ApiProperty({ type: String, format: 'date-time' })
  at!: string

  @ApiProperty({ enum: CRYPTO_ANSWERS, enumName: 'CryptoAnswer' })
  answer!: CryptoAnswer

  @ApiProperty({ type: 'integer', nullable: true })
  costCents!: number | null

  @ApiProperty({ type: String, nullable: true })
  counterpartAccountName!: string | null
}

export class CryptoPendingDto {
  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: [CryptoPendingItemDto], description: 'Oldest first.' })
  items!: CryptoPendingItemDto[]

  @ApiProperty({
    type: [CryptoAnsweredItemDto],
    description: 'Answered or linked, newest first.',
  })
  answered!: CryptoAnsweredItemDto[]
}

export class AnswerCryptoMovementDto {
  @ApiProperty({
    enum: CRYPTO_ANSWERS,
    enumName: 'CryptoAnswer',
    description:
      '`transfer`: the other side is `counterpartMovementId` (« Depuis une plateforme », « Vers une plateforme »); `bought`: arrived coins bought elsewhere, at `costCents`; `gift`: received for free (cost 0); `disposed`: departed coins sold or given (they leave at average cost).',
  })
  @IsIn(CRYPTO_ANSWERS)
  answer!: CryptoAnswer

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  counterpartMovementId?: string

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    description: 'What the coins cost, fees included, in cents (`bought`).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_COST_CENTS)
  costCents?: number
}
