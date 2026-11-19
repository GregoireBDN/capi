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

/** Changed transactions listed by a rule preview. */
export const PREVIEW_SAMPLE_SIZE = 20

/** Match counts look this many months back (#299). */
export const MATCH_WINDOW_MONTHS = 12

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

const PRIORITY_DOC =
  'Explicit precedence (#299): rules with a higher priority are evaluated before the computed « most specific first » order. Default 0.'

const PRIORITY_MIN = -1000
const PRIORITY_MAX = 1000

const COUNTERPART_DOC =
  'Destination account of the transfers the rule files (#296), set as their counterpart when they have none. Only on a rule whose outcome is a `transfer`.'

export class CategorizationRuleDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({
    type: 'integer',
    description:
      'Creation order. Only breaks ties of the computed order (`rank`).',
  })
  position!: number

  @ApiProperty({ type: 'integer', description: PRIORITY_DOC })
  priority!: number

  @ApiProperty({
    type: 'integer',
    description:
      '0-based place in the evaluation order (the first matching rule wins): higher `priority` first, then the most specific rule (regex, longer pattern, more account / amount conditions), then the oldest.',
  })
  rank!: number

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

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: COUNTERPART_DOC,
  })
  counterpartAccountId!: string | null

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

  @ApiPropertyOptional({
    type: 'integer',
    default: 0,
    minimum: PRIORITY_MIN,
    maximum: PRIORITY_MAX,
    description: PRIORITY_DOC,
  })
  @IsOptional()
  @IsInt()
  @Min(PRIORITY_MIN)
  @Max(PRIORITY_MAX)
  priority?: number

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

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: COUNTERPART_DOC,
  })
  @IsOptional()
  @IsUUID()
  counterpartAccountId?: string | null
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

  @ApiPropertyOptional({
    type: 'integer',
    minimum: PRIORITY_MIN,
    maximum: PRIORITY_MAX,
    description: PRIORITY_DOC,
  })
  @NotNullIfPresent()
  @IsInt()
  @Min(PRIORITY_MIN)
  @Max(PRIORITY_MAX)
  priority?: number

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

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: COUNTERPART_DOC,
  })
  @IsOptional()
  @IsUUID()
  counterpartAccountId?: string | null
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

/**
 * A rule to preview: a new one (appended last) or, with `ruleId`, the edited
 * version of an existing rule, evaluated at that rule's position.
 */
export class PreviewCategorizationRuleDto extends CreateCategorizationRuleDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Existing rule this body would replace. Omitted: a new rule appended last.',
  })
  @IsOptional()
  @IsUUID()
  ruleId?: string
}

/** A transaction whose category or kind the previewed rule would change. */
export class CategorizationRulePreviewTransactionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'date' })
  bookingDate!: string

  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: String })
  rawLabel!: string

  @ApiProperty({ type: String, nullable: true })
  merchant!: string | null

  @ApiProperty({ type: 'integer', description: 'Signed integer cents.' })
  amountCents!: number

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Current category (null: uncategorized).',
  })
  categoryId!: string | null

  @ApiProperty({ enum: TRANSACTION_KINDS, enumName: 'TransactionKind' })
  kind!: TransactionKind

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Category once the rules are re-applied (null: no rule matches, back to review).',
  })
  nextCategoryId!: string | null

  @ApiProperty({ enum: TRANSACTION_KINDS, enumName: 'TransactionKind' })
  nextKind!: TransactionKind
}

export class CategorizationRulePreviewDto {
  @ApiProperty({
    type: 'integer',
    description:
      'Transactions the rule would categorize once saved and the rules re-applied (first match wins). Manual categorizations are never counted.',
  })
  matched!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Of those, transactions that would leave the review queue (uncategorized ones waiting for review).',
  })
  leavingReview!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Transactions the rule categorizes today that it would no longer win (they go to the next matching rule, or back to review). Always 0 for a new rule.',
  })
  released!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Transactions whose category or kind would change because of this rule (matched or released).',
  })
  changed!: number

  @ApiProperty({
    type: [CategorizationRulePreviewTransactionDto],
    description: `The changed transactions, most recent first, at most ${PREVIEW_SAMPLE_SIZE}.`,
  })
  transactions!: CategorizationRulePreviewTransactionDto[]

  @ApiProperty({
    type: () => [CategorizationRuleConflictDto],
    description:
      'Other rules that also match transactions this rule matches but file them differently (category or kind), with who wins. Transactions filed by hand are never counted.',
  })
  conflicts!: CategorizationRuleConflictDto[]
}

/**
 * Two enabled rules matching the same transactions with different outcomes
 * (category or kind): the first in the evaluation order wins them.
 */
export class CategorizationRuleConflictDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description:
      'The rule that wins these transactions. In a preview, the id of a new rule is the nil UUID.',
  })
  winnerRuleId!: string

  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'The rule that matches them too but loses.',
  })
  loserRuleId!: string

  @ApiProperty({
    type: 'integer',
    description:
      'Transactions both rules match (not filed by hand), all dates.',
  })
  count!: number
}

/** The conditions of a rule, to list what it would catch. */
export class CategorizationRuleMatchesQueryDto {
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
}

/** A transaction a rule's conditions match. */
export class CategorizationRuleMatchDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'date' })
  bookingDate!: string

  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: String })
  rawLabel!: string

  @ApiProperty({ type: String, nullable: true })
  merchant!: string | null

  @ApiProperty({ type: 'integer', description: 'Signed integer cents.' })
  amountCents!: number

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  categoryId!: string | null

  @ApiProperty({
    type: Boolean,
    description: 'Filed by hand (a category, no rule): rules never change it.',
  })
  manual!: boolean
}

export class CategorizationRuleMatchesDto {
  @ApiProperty({
    type: String,
    format: 'date',
    description: `First day counted: ${MATCH_WINDOW_MONTHS} months before today (Europe/Paris).`,
  })
  since!: string

  @ApiProperty({
    type: 'integer',
    description: 'Transactions booked since `since` the conditions match.',
  })
  total!: number

  @ApiProperty({
    type: [CategorizationRuleMatchDto],
    description: `The most recent of them, at most ${PREVIEW_SAMPLE_SIZE}.`,
  })
  transactions!: CategorizationRuleMatchDto[]
}

/** How much a rule is used. */
export class CategorizationRuleUsageDto {
  @ApiProperty({ type: String, format: 'uuid' })
  ruleId!: string

  @ApiProperty({
    type: 'integer',
    description: `Transactions booked over the last ${MATCH_WINDOW_MONTHS} months its conditions match (any categorization, enabled or not).`,
  })
  matchCount!: number
}

export class CategorizationRulesInsightsDto {
  @ApiProperty({
    type: String,
    format: 'date',
    description: `First day of the match counts: ${MATCH_WINDOW_MONTHS} months before today (Europe/Paris).`,
  })
  since!: string

  @ApiProperty({ type: [CategorizationRuleUsageDto] })
  rules!: CategorizationRuleUsageDto[]

  @ApiProperty({
    type: [CategorizationRuleConflictDto],
    description:
      'Pairs of enabled rules matching the same transactions (not filed by hand) with different outcomes, most transactions first.',
  })
  conflicts!: CategorizationRuleConflictDto[]
}

export class ReorderCategorizationRulesDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'Every rule id, in the wanted evaluation order (first = evaluated first).',
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10_000)
  @IsUUID('all', { each: true })
  ids!: string[]
}

export class PreferCategorizationRuleDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'The rule this one must now be evaluated before.',
  })
  @IsUUID()
  overRuleId!: string
}
