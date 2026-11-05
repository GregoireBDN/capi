import { applyDecorators } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator'
import {
  RULE_MATCH_TYPES,
  type RuleMatchType,
  TRANSACTION_KINDS,
  type TransactionKind,
} from '#/database/schema/domain-enums'

const LABEL_PATTERN_MAX = 255
const MERCHANT_MAX = 255
const RAW_LABEL_MAX = 1000

const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )

/** Present and non-null when sent; may be omitted (PATCH semantics). */
const NotNullIfPresent = () =>
  ValidateIf((_object: object, value: unknown) => value !== undefined)

/** Integer cents within the safe integer range. */
const CentsValidators = () =>
  applyDecorators(
    IsInt(),
    Min(Number.MIN_SAFE_INTEGER),
    Max(Number.MAX_SAFE_INTEGER),
  )

const MATCH_TYPE_DOC = {
  enum: RULE_MATCH_TYPES,
  enumName: 'RuleMatchType',
  description:
    '`contains`: case-, accent- and punctuation-insensitive substring of the raw label or merchant. `regex`: case-insensitive regular expression tested against the raw label and merchant.',
} as const

const KIND_DOC = {
  enum: TRANSACTION_KINDS,
  enumName: 'TransactionKind',
  nullable: true,
  description:
    "Overrides the category's kind when set (e.g. `transfer` for a move to one of the user's own accounts).",
} as const

export class CategorizationRuleDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({
    type: 'integer',
    description: 'Evaluation order: the first matching rule (lowest) wins.',
  })
  position!: number

  @ApiProperty({ type: Boolean })
  enabled!: boolean

  @ApiProperty(MATCH_TYPE_DOC)
  matchType!: RuleMatchType

  @ApiProperty({ type: String })
  labelPattern!: string

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  accountId!: string | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Inclusive lower bound on the signed amount, in cents.',
  })
  minAmountCents!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Inclusive upper bound on the signed amount, in cents.',
  })
  maxAmountCents!: number | null

  @ApiProperty({ type: String, format: 'uuid' })
  categoryId!: string

  @ApiProperty(KIND_DOC)
  kind!: TransactionKind | null

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Merchant name given to matching transactions, when set.',
  })
  merchant!: string | null

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date
}

export class CreateCategorizationRuleDto {
  @ApiPropertyOptional({ type: Boolean, default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @ApiPropertyOptional({ ...MATCH_TYPE_DOC, default: 'contains' })
  @IsOptional()
  @IsIn(RULE_MATCH_TYPES)
  matchType?: RuleMatchType

  @ApiProperty({ type: String, minLength: 1, maxLength: LABEL_PATTERN_MAX })
  @IsString()
  @MinLength(1)
  @MaxLength(LABEL_PATTERN_MAX)
  labelPattern!: string

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  accountId?: string | null

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  @IsOptional()
  @CentsValidators()
  minAmountCents?: number | null

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  @IsOptional()
  @CentsValidators()
  maxAmountCents?: number | null

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  categoryId!: string

  @ApiPropertyOptional(KIND_DOC)
  @IsOptional()
  @IsIn(TRANSACTION_KINDS)
  kind?: TransactionKind | null

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MERCHANT_MAX,
  })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(MERCHANT_MAX)
  merchant?: string | null
}

/**
 * Partial update: omitted fields are left unchanged; `null` clears the
 * optional conditions and outcomes.
 */
export class UpdateCategorizationRuleDto {
  @ApiPropertyOptional({ type: Boolean })
  @NotNullIfPresent()
  @IsBoolean()
  enabled?: boolean

  @ApiPropertyOptional(MATCH_TYPE_DOC)
  @NotNullIfPresent()
  @IsIn(RULE_MATCH_TYPES)
  matchType?: RuleMatchType

  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: LABEL_PATTERN_MAX,
  })
  @NotNullIfPresent()
  @IsString()
  @MinLength(1)
  @MaxLength(LABEL_PATTERN_MAX)
  labelPattern?: string

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  accountId?: string | null

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  @IsOptional()
  @CentsValidators()
  minAmountCents?: number | null

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  @IsOptional()
  @CentsValidators()
  maxAmountCents?: number | null

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @NotNullIfPresent()
  @IsUUID()
  categoryId?: string

  @ApiPropertyOptional(KIND_DOC)
  @IsOptional()
  @IsIn(TRANSACTION_KINDS)
  kind?: TransactionKind | null

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MERCHANT_MAX,
  })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(MERCHANT_MAX)
  merchant?: string | null
}

export class ReorderCategorizationRulesDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'Every rule id, in the new evaluation order (first = highest priority).',
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10_000)
  @IsUUID('all', { each: true })
  ids!: string[]
}

export class SuggestCategorizationRuleDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: RAW_LABEL_MAX })
  @IsString()
  @MinLength(1)
  @MaxLength(RAW_LABEL_MAX)
  rawLabel!: string

  @ApiProperty({ type: String, nullable: true, maxLength: MERCHANT_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(MERCHANT_MAX)
  merchant!: string | null

  @ApiProperty({ type: 'integer', description: 'Signed integer cents.' })
  @CentsValidators()
  amountCents!: number

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  accountId!: string

  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Category the user filed the transaction under.',
  })
  @IsUUID()
  categoryId!: string
}

/** A proposed rule, ready to be posted to `POST /categorization-rules`. */
export class SuggestedCategorizationRuleDto {
  @ApiProperty({ type: Boolean })
  enabled!: boolean

  @ApiProperty(MATCH_TYPE_DOC)
  matchType!: RuleMatchType

  @ApiProperty({ type: String })
  labelPattern!: string

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  accountId!: string | null

  @ApiProperty({ type: 'integer', nullable: true })
  minAmountCents!: number | null

  @ApiProperty({ type: 'integer', nullable: true })
  maxAmountCents!: number | null

  @ApiProperty({ type: String, format: 'uuid' })
  categoryId!: string

  @ApiProperty(KIND_DOC)
  kind!: TransactionKind | null

  @ApiProperty({ type: String, nullable: true })
  merchant!: string | null
}

export class ApplyCategorizationRulesResultDto {
  @ApiProperty({
    type: 'integer',
    description:
      'Transactions re-evaluated: uncategorized or categorized by a rule.',
  })
  scanned!: number

  @ApiProperty({
    type: 'integer',
    description: 'Scanned transactions a rule matched.',
  })
  matched!: number

  @ApiProperty({
    type: 'integer',
    description: 'Scanned transactions no rule matched (left for review).',
  })
  unmatched!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Transactions whose category, kind, merchant or review flag changed.',
  })
  updated!: number

  @ApiProperty({
    type: 'integer',
    description: 'Transactions categorized by hand, never overwritten.',
  })
  manualSkipped!: number
}
