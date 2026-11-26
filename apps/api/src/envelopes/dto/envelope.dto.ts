import { applyDecorators } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { MONTH_PATTERN } from '#/dashboard/calendar'
import {
  ENVELOPE_MOVEMENT_REASONS,
  type EnvelopeMovementReason,
} from '#/database/schema/domain-enums'
import { CalendarDate } from '#/investments/calendar-date'

export const ENVELOPE_NAME_MAX = 100
export const ENVELOPE_ICON_MAX = 40
export const ENVELOPE_NOTE_MAX = 500
/** Highest amount set aside or moved at once: 10 000 000 €. */
export const ENVELOPE_AMOUNT_MAX_CENTS = 1_000_000_000
export const ENVELOPE_CATEGORIES_MAX = 20
export const ENVELOPE_START_MAX = 20
export const SPLIT_KEY_MAX = 50
/** 10 000 basis points = 100 %. */
export const BASIS_POINTS_FULL = 10_000
/** Month ends in an envelope's « Évolution ». */
export const ENVELOPE_HISTORY_MONTHS = 12
/** Latest movements in an envelope's detail. */
export const ENVELOPE_MOVEMENTS_LIMIT = 200

const Amount = (minimum: number) =>
  applyDecorators(IsInt(), Min(minimum), Max(ENVELOPE_AMOUNT_MAX_CENTS))

const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )

/** Trims; an empty text is no text (null). */
const trimToNull = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const ICON = /^[a-z0-9-]+$/

const REASON_DOC = {
  enum: ENVELOPE_MOVEMENT_REASONS,
  enumName: 'EnvelopeMovementReason',
  description:
    '`start` taken from « libre » at creation, `move` a hand move, `split` its share of a saving, `transfer` an attached transfer (one leg per account), `spend` what it paid of an expense.',
} as const

/* ============================================================================
 * Inputs
 * ========================================================================= */

export class EnvelopeStartDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  accountId!: string

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: ENVELOPE_AMOUNT_MAX_CENTS,
    description: 'Taken from the account’s « libre »; the money does not move.',
  })
  @Amount(1)
  amountCents!: number
}

class EnvelopeFieldsDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: ENVELOPE_ICON_MAX,
    description: 'Icon name of the web app (`plane`, `gift`…).',
  })
  @IsOptional()
  @trimToNull()
  @IsString()
  @MaxLength(ENVELOPE_ICON_MAX)
  @Matches(ICON, { message: '$property must be an icon name' })
  icon?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '#0284c7' })
  @IsOptional()
  @trimToNull()
  @Matches(HEX_COLOR, { message: '$property must be a #rrggbb colour' })
  color?: string | null

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 1,
    maximum: ENVELOPE_AMOUNT_MAX_CENTS,
    description: 'The amount aimed at; null = no target.',
  })
  @IsOptional()
  @Amount(1)
  targetCents?: number | null

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    description: 'Calendar day it is for; null = no due date.',
  })
  @IsOptional()
  @CalendarDate()
  dueDate?: string | null

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: ENVELOPE_CATEGORIES_MAX,
    description:
      'Expense categories it pays for (offers only). On update, replaces them.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ENVELOPE_CATEGORIES_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  categoryIds?: string[]
}

export class CreateEnvelopeDto extends EnvelopeFieldsDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: ENVELOPE_NAME_MAX })
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(ENVELOPE_NAME_MAX)
  name!: string

  @ApiPropertyOptional({
    type: [EnvelopeStartDto],
    maxItems: ENVELOPE_START_MAX,
    description:
      '« Pour commencer »: an amount per account, taken from its « libre » (400 beyond it).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ENVELOPE_START_MAX)
  @ValidateNested({ each: true })
  @Type(() => EnvelopeStartDto)
  start?: EnvelopeStartDto[]
}

export class UpdateEnvelopeDto extends EnvelopeFieldsDto {
  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: ENVELOPE_NAME_MAX,
  })
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(ENVELOPE_NAME_MAX)
  name?: string

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  archived?: boolean
}

export class ListEnvelopesQueryDto {
  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  includeArchived?: boolean
}

export class EnvelopeMonthQueryDto {
  @ApiPropertyOptional({
    type: String,
    pattern: MONTH_PATTERN.source,
    example: '2026-10',
    description: 'YYYY-MM; default the current month in Europe/Paris.',
  })
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: '$property must be YYYY-MM' })
  month?: string
}

export class MoveEnvelopeMoneyDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  accountId!: string

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The envelope the money leaves; null = « libre ».',
  })
  @IsOptional()
  @IsUUID()
  fromEnvelopeId!: string | null

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The envelope the money goes to; null = « libre ».',
  })
  @IsOptional()
  @IsUUID()
  toEnvelopeId!: string | null

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: ENVELOPE_AMOUNT_MAX_CENTS,
  })
  @Amount(1)
  amountCents!: number

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: ENVELOPE_NOTE_MAX,
  })
  @IsOptional()
  @trimToNull()
  @IsString()
  @MaxLength(ENVELOPE_NOTE_MAX)
  note?: string | null
}

export class SplitKeyShareDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  envelopeId!: string

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: BASIS_POINTS_FULL,
    description: 'Share of each new saving, in basis points (500 = 5 %).',
  })
  @IsInt()
  @Min(1)
  @Max(BASIS_POINTS_FULL)
  basisPoints!: number
}

export class SetSplitKeyDto {
  @ApiProperty({
    type: [SplitKeyShareDto],
    maxItems: SPLIT_KEY_MAX,
    description:
      'The whole key of the account (replaces it); at most 10 000 in all, the rest is « libre ». Empty = no key.',
  })
  @IsArray()
  @ArrayMaxSize(SPLIT_KEY_MAX)
  @ValidateNested({ each: true })
  @Type(() => SplitKeyShareDto)
  shares!: SplitKeyShareDto[]
}

export class AttachTransactionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  transactionId!: string

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: ENVELOPE_AMOUNT_MAX_CENTS,
    description:
      'How much the envelope pays of the expense, or carries with the transfer (positive). Default: all of it, at most what the envelope holds on the account.',
  })
  @IsOptional()
  @Amount(1)
  amountCents?: number
}

export class SplitShareDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  envelopeId!: string

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: ENVELOPE_AMOUNT_MAX_CENTS,
  })
  @Amount(1)
  amountCents!: number
}

export class ApplySplitDto {
  @ApiPropertyOptional({
    type: [SplitShareDto],
    maxItems: SPLIT_KEY_MAX,
    description:
      'The shares to set aside, at most the saving in all. Default: the account’s split key.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SPLIT_KEY_MAX)
  @ValidateNested({ each: true })
  @Type(() => SplitShareDto)
  shares?: SplitShareDto[]
}

/* ============================================================================
 * Outputs
 * ========================================================================= */

export class EnvelopeAccountAmountDto {
  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: String })
  accountName!: string

  @ApiProperty({
    type: 'integer',
    description:
      'What the envelope holds on the account. Below 0 only after an import was undone or an account deleted (reported, never refused).',
  })
  amountCents!: number
}

export class EnvelopePlanDto {
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Target − total, at least 0; null without a target.',
  })
  remainingCents!: number | null

  @ApiProperty({ type: Number, nullable: true, description: 'Total / target.' })
  progressRatio!: number | null

  @ApiProperty({ type: Boolean })
  reached!: boolean

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Month ends left until the due date (at least 1 until it).',
  })
  monthsLeft!: number | null

  @ApiProperty({ type: Boolean })
  targetDatePassed!: boolean

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'What is missing spread over the month ends left (« 221 € par mois »); null without a target or a due date, or once it has passed.',
  })
  requiredMonthlyCents!: number | null
}

export class EnvelopeSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: String, nullable: true })
  icon!: string | null

  @ApiProperty({ type: String, nullable: true })
  color!: string | null

  @ApiProperty({ type: 'integer', nullable: true })
  targetCents!: number | null

  @ApiProperty({ type: String, format: 'date', nullable: true })
  dueDate!: string | null

  @ApiProperty({ type: Boolean })
  archived!: boolean

  @ApiProperty({ type: [String], format: 'uuid' })
  categoryIds!: string[]

  @ApiProperty({
    type: 'integer',
    description: 'What it holds now, all accounts.',
  })
  totalCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'What it paid of expenses, all time (refunds deducted).',
  })
  paidCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Put aside so far: what it holds + what it paid.',
  })
  putAsideCents!: number

  @ApiProperty({
    type: [EnvelopeAccountAmountDto],
    description: 'Per account where it holds or held money, non-zero only.',
  })
  accounts!: EnvelopeAccountAmountDto[]

  @ApiProperty({ type: EnvelopePlanDto })
  plan!: EnvelopePlanDto
}

export class EnvelopeMovementDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: 'integer' })
  amountCents!: number

  @ApiProperty({ type: String, format: 'date' })
  onDate!: string

  @ApiProperty(REASON_DOC)
  reason!: EnvelopeMovementReason

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'A move’s other envelope; null = « libre ».',
  })
  counterEnvelopeId!: string | null

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  transactionId!: string | null

  @ApiProperty({ type: String, nullable: true })
  note!: string | null
}

export class EnvelopeHistoryAccountDto {
  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: 'integer' })
  amountCents!: number
}

export class EnvelopeHistoryMonthDto {
  @ApiProperty({ type: String, example: '2026-10' })
  month!: string

  @ApiProperty({ type: 'integer', description: 'Held at the month’s end.' })
  totalCents!: number

  @ApiProperty({ type: [EnvelopeHistoryAccountDto] })
  accounts!: EnvelopeHistoryAccountDto[]
}

export class EnvelopeDetailDto extends EnvelopeSummaryDto {
  @ApiProperty({
    type: [EnvelopeHistoryMonthDto],
    description: `The last ${ENVELOPE_HISTORY_MONTHS} month ends (Europe/Paris), oldest first (« Évolution »).`,
  })
  history!: EnvelopeHistoryMonthDto[]

  @ApiProperty({
    type: [EnvelopeMovementDto],
    description: `Its latest ${ENVELOPE_MOVEMENTS_LIMIT} movements, newest first.`,
  })
  movements!: EnvelopeMovementDto[]
}

export class AccountEnvelopeDto {
  @ApiProperty({ type: String, format: 'uuid' })
  envelopeId!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: String, nullable: true })
  icon!: string | null

  @ApiProperty({ type: String, nullable: true })
  color!: string | null

  @ApiProperty({ type: Boolean })
  archived!: boolean

  @ApiProperty({ type: 'integer' })
  amountCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Its share of the balance in basis points (« 22 % du solde »); null without a positive balance.',
  })
  shareOfBalance!: number | null
}

export class SplitKeyEntryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  envelopeId!: string

  @ApiProperty({ type: 'integer' })
  basisPoints!: number
}

export class AccountEnvelopesDto {
  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: 'integer', nullable: true })
  balanceCents!: number | null

  @ApiProperty({ type: String, format: 'date', nullable: true })
  balanceDate!: string | null

  @ApiProperty({
    type: [AccountEnvelopeDto],
    description: 'Envelopes holding money here (non-zero), largest first.',
  })
  envelopes!: AccountEnvelopeDto[]

  @ApiProperty({ type: 'integer', description: 'Σ of the envelopes here.' })
  allocatedCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      '« Libre »: balance − envelopes; negative when the balance is under its envelopes; null without a balance.',
  })
  freeCents!: number | null

  @ApiProperty({
    type: 'integer',
    description:
      'What is missing to cover the envelopes (« Il manque 150 € »), 0 when covered. Never reduced automatically.',
  })
  shortfallCents!: number

  @ApiProperty({ type: [SplitKeyEntryDto] })
  splitKey!: SplitKeyEntryDto[]

  @ApiProperty({
    type: 'integer',
    description: 'What the key leaves « libre », in basis points.',
  })
  freeBasisPoints!: number
}

export class EnvelopeOfferTransactionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  transactionId!: string

  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: String, format: 'date' })
  bookingDate!: string

  @ApiProperty({ type: 'integer' })
  amountCents!: number

  @ApiProperty({ type: String })
  label!: string

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  categoryId!: string | null

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  counterpartAccountId!: string | null
}

export class EnvelopeOfferChoiceDto {
  @ApiProperty({ type: String, format: 'uuid' })
  envelopeId!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({
    type: 'integer',
    description:
      'For a saving: its share by the key. For a transfer or an expense: what the envelope holds on the account.',
  })
  amountCents!: number
}

export class EnvelopeOfferDto {
  @ApiProperty({ type: EnvelopeOfferTransactionDto })
  transaction!: EnvelopeOfferTransactionDto

  @ApiProperty({ type: [EnvelopeOfferChoiceDto] })
  envelopes!: EnvelopeOfferChoiceDto[]
}

export class EnvelopeOffersDto {
  @ApiProperty({
    type: [EnvelopeOfferDto],
    description:
      'Savings arrived on an account with a split key, each envelope’s share by the key.',
  })
  savings!: EnvelopeOfferDto[]

  @ApiProperty({
    type: [EnvelopeOfferDto],
    description:
      'Transfers out of an account where envelopes hold money, the envelopes that could follow them.',
  })
  transfers!: EnvelopeOfferDto[]

  @ApiProperty({
    type: [EnvelopeOfferDto],
    description:
      'Expenses in an envelope’s categories on an account where it holds money.',
  })
  expenses!: EnvelopeOfferDto[]
}

export class EnvelopeCategoryPaidDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  categoryId!: string | null

  @ApiProperty({ type: 'integer' })
  paidCents!: number
}

export class EnvelopeMonthItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  envelopeId!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: String, nullable: true })
  icon!: string | null

  @ApiProperty({ type: String, nullable: true })
  color!: string | null

  @ApiProperty({ type: 'integer', description: 'What it paid this month.' })
  paidCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Put aside so far (what it holds now + what it ever paid).',
  })
  putAsideCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'What it holds now (« Il reste »).',
  })
  leftCents!: number

  @ApiProperty({ type: [EnvelopeCategoryPaidDto] })
  categories!: EnvelopeCategoryPaidDto[]
}

export class EnvelopeMonthDto {
  @ApiProperty({ type: String, example: '2026-10' })
  month!: string

  @ApiProperty({ type: 'integer' })
  paidCents!: number

  @ApiProperty({
    type: [EnvelopeMonthItemDto],
    description: 'Envelopes that paid something this month.',
  })
  envelopes!: EnvelopeMonthItemDto[]
}
