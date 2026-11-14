import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator'
import { ASSET_ID_PATTERN } from '#/crypto/dto/crypto.dto'
import {
  CRYPTO_IMPORT_FORMATS,
  CRYPTO_MOVEMENT_KINDS,
  type CryptoImportFormat,
  type CryptoMovementKind,
} from '#/database/schema/domain-enums'

const SIGNED_QUANTITY_DOC = {
  type: String,
  description: 'Signed exact decimal string with a dot (up to 18 decimals).',
  example: '-0.0012',
} as const

export class CryptoImportUploadDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description:
      'Binance or Coinbase "Transactions" CSV export (UTF-8), at most 5 MB.',
  })
  file!: unknown
}

export class CryptoImportIssueDto {
  @ApiProperty({ type: 'integer' })
  lineNumber!: number

  @ApiProperty({
    type: String,
    description: 'Why the line was skipped (no data).',
  })
  message!: string
}

export class CryptoImportCountsDto {
  @ApiProperty({ type: 'integer', description: 'Parsed lines.' })
  rows!: number

  @ApiProperty({ type: 'integer' })
  new!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Lines already imported (on commit: also those stored meanwhile).',
  })
  duplicates!: number

  @ApiProperty({ type: 'integer', description: 'Unreadable lines.' })
  issues!: number

  @ApiProperty({ type: 'integer', description: 'Lines written on commit.' })
  inserted!: number
}

export class CryptoImportRowDto {
  @ApiProperty({ type: 'integer' })
  index!: number

  @ApiProperty({ type: 'integer' })
  lineNumber!: number

  @ApiProperty({ type: String, format: 'date-time' })
  occurredAt!: string

  @ApiProperty({ type: String, nullable: true, example: 'Spot' })
  wallet!: string | null

  @ApiProperty({ type: String, example: 'Transaction Buy' })
  operation!: string

  @ApiProperty({ enum: CRYPTO_MOVEMENT_KINDS, enumName: 'CryptoMovementKind' })
  kind!: CryptoMovementKind

  @ApiProperty({
    type: Boolean,
    description: 'False for an operation type the parser does not know.',
  })
  known!: boolean

  @ApiProperty({ type: String, example: 'BTC' })
  asset!: string

  @ApiProperty(SIGNED_QUANTITY_DOC)
  quantity!: string

  @ApiProperty({ type: 'integer', nullable: true })
  eurCents!: number | null

  @ApiProperty({ enum: ['new', 'duplicate'] })
  status!: 'new' | 'duplicate'
}

export class CryptoImportHoldingDto {
  @ApiProperty({ type: [String], description: 'Tickers of the export.' })
  tickers!: string[]

  @ApiProperty({ type: String, nullable: true, example: 'bitcoin' })
  assetId!: string | null

  @ApiProperty({ type: String, example: 'BTC' })
  symbol!: string

  @ApiProperty({ type: String, nullable: true })
  name!: string | null

  @ApiProperty(SIGNED_QUANTITY_DOC)
  quantity!: string

  @ApiProperty({ type: 'integer', nullable: true })
  investedCents!: number | null

  @ApiProperty({
    enum: ['ok', 'negative', 'unmapped'],
    description:
      '`negative`: earlier movements are missing; `unmapped`: no price id. Neither becomes a holding.',
  })
  status!: 'ok' | 'negative' | 'unmapped'
}

export class CryptoUnknownOperationDto {
  @ApiProperty({ type: String })
  operation!: string

  @ApiProperty({ type: 'integer' })
  count!: number
}

export class CryptoImportDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ enum: CRYPTO_IMPORT_FORMATS, enumName: 'CryptoImportFormat' })
  format!: CryptoImportFormat

  @ApiProperty({ type: String })
  fileName!: string

  @ApiProperty({ enum: ['pending', 'committed'] })
  status!: 'pending' | 'committed'

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  committedAt!: string | null

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  periodStart!: string | null

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  periodEnd!: string | null

  @ApiProperty({ type: CryptoImportCountsDto })
  counts!: CryptoImportCountsDto

  @ApiProperty({ type: [CryptoImportIssueDto] })
  issues!: CryptoImportIssueDto[]

  @ApiProperty({
    type: [CryptoUnknownOperationDto],
    description:
      'Operation types the parser does not know: imported as `other`, their quantities counted.',
  })
  unknownOperations!: CryptoUnknownOperationDto[]

  @ApiProperty({
    type: [String],
    description: 'Tickers without a price id (no holding until mapped).',
  })
  unmappedTickers!: string[]

  @ApiProperty({
    type: [CryptoImportHoldingDto],
    description: 'Holdings of the account once the import is committed.',
  })
  holdings!: CryptoImportHoldingDto[]

  @ApiProperty({
    type: [CryptoImportRowDto],
    description: 'Parsed lines while pending; empty once committed.',
  })
  rows!: CryptoImportRowDto[]
}

export class CryptoAssetChoiceDto {
  @ApiProperty({ type: String, maxLength: 20, example: 'XYZ' })
  @IsString()
  @Length(1, 20)
  ticker!: string

  @ApiProperty({ type: String, example: 'bitcoin' })
  @IsString()
  @Matches(ASSET_ID_PATTERN)
  assetId!: string

  @ApiProperty({ type: String, maxLength: 20 })
  @IsString()
  @Length(1, 20)
  symbol!: string

  @ApiProperty({ type: String, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  name!: string
}

export class CommitCryptoImportDto {
  @ApiPropertyOptional({
    type: [CryptoAssetChoiceDto],
    description: 'Price ids chosen for tickers the preview could not map.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CryptoAssetChoiceDto)
  assets?: CryptoAssetChoiceDto[]
}

export class DeleteCryptoImportResultDto {
  @ApiProperty({
    type: 'integer',
    description: 'Movements deleted (0 for a pending import).',
  })
  deletedMovements!: number
}
