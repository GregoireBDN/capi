import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator'
import {
  CATEGORY_ICON_DOC,
  type CategoryIcon,
} from '#/categories/category-icons'
import {
  RECURRING_AMOUNT_TYPES,
  RECURRING_CADENCES,
  RECURRING_DIRECTIONS,
  RECURRING_STATUSES,
  type RecurringAmountType,
  type RecurringCadence,
  type RecurringDirection,
  type RecurringStatus,
} from '#/database/schema/domain-enums'
import { PREPAID_TERM_MAX_MONTHS, PREPAID_TERM_MIN_MONTHS } from '../prepaid'

export const RECURRING_NAME_MAX = 255
export const RECURRING_NOTES_MAX = 1000
/** Latest occurrences returned with each item. */
export const RECURRING_OCCURRENCES_SHOWN = 6
/** Most runs of equal amounts returned with each item (#279). */
export const RECURRING_AMOUNT_RUNS_SHOWN = 4
/** Most items `POST /recurring/confirm` accepts at once. */
export const RECURRING_CONFIRM_MAX_IDS = 200

const CADENCE_DOC = {
  enum: RECURRING_CADENCES,
  enumName: 'RecurringCadence',
} as const
const DIRECTION_DOC = {
  enum: RECURRING_DIRECTIONS,
  enumName: 'RecurringDirection',
  description: '`debit` = money out, `credit` = money in.',
} as const
const AMOUNT_TYPE_DOC = {
  enum: RECURRING_AMOUNT_TYPES,
  enumName: 'RecurringAmountType',
  description:
    '`fixed`: same price every time (±1 % or ±1 €), possibly after a price change; `variable` otherwise.',
} as const
const STATUS_DOC = {
  enum: RECURRING_STATUSES,
  enumName: 'RecurringStatus',
} as const
const TERM_DOC = {
  type: 'integer',
  minimum: PREPAID_TERM_MIN_MONTHS,
  maximum: PREPAID_TERM_MAX_MONTHS,
  example: 24,
} as const
const DATE_DOC = {
  type: String,
  format: 'date',
  example: '2026-11-06',
} as const

/** Trims a string; an empty one becomes null. */
const TrimToNull = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )

// ---------------------------------------------------------------------------
// Queries and bodies
// ---------------------------------------------------------------------------

export class RecurringListQueryDto {
  @ApiPropertyOptional({
    ...STATUS_DOC,
    description: 'Only items with this status. Default: every item.',
  })
  @IsOptional()
  @IsIn(RECURRING_STATUSES)
  status?: RecurringStatus
}

export class UpdateRecurringItemDto {
  @ApiPropertyOptional({
    ...STATUS_DOC,
    description: 'Confirm, dismiss, or put back among the suggestions.',
  })
  @ValidateIf((_o: object, value: unknown) => value !== undefined)
  @IsIn(RECURRING_STATUSES)
  status?: RecurringStatus

  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: RECURRING_NAME_MAX,
  })
  @ValidateIf((_o: object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(RECURRING_NAME_MAX)
  name?: string

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Null removes the category.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null

  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_o: object, value: unknown) => value !== undefined)
  @IsBoolean()
  isFixedCost?: boolean

  @ApiPropertyOptional({
    ...CADENCE_DOC,
    nullable: true,
    description: 'Cadence used instead of the detected one; null = detected.',
  })
  @IsOptional()
  @IsIn(RECURRING_CADENCES)
  cadence?: RecurringCadence | null

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: RECURRING_NOTES_MAX,
    description: 'Null or empty removes the notes.',
  })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(RECURRING_NOTES_MAX)
  notes?: string | null

  @ApiPropertyOptional({
    ...DATE_DOC,
    nullable: true,
    description:
      'Cancellation (« Résilier »), confirmed items only: the first day no charge is expected any more (past, today or future). Null reactivates the item. Refused to access tokens.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endedOn must be a YYYY-MM-DD date',
  })
  @IsISO8601({ strict: true })
  endedOn?: string | null

  @ApiPropertyOptional({
    ...TERM_DOC,
    nullable: true,
    description:
      'Prepaid term in months (#314): the subscription is paid upfront for the term. Set on an item without payments linked, its latest debit becomes the payment. Null makes it an ordinary item again (its payments are unlinked).',
  })
  @IsOptional()
  @IsInt()
  @Min(PREPAID_TERM_MIN_MONTHS)
  @Max(PREPAID_TERM_MAX_MONTHS)
  termMonths?: number | null

  @ApiPropertyOptional({
    type: Boolean,
    description:
      '« Garder » (true): the owner keeps the coming renewal of a prepaid item, whose reminder then goes away; false shows it again.',
  })
  @ValidateIf((_o: object, value: unknown) => value !== undefined)
  @IsBoolean()
  keepRenewal?: boolean
}

export class DeclarePrepaidDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'The upfront payment: an expense (money out).',
  })
  @IsUUID()
  transactionId!: string

  @ApiProperty({ ...TERM_DOC, description: 'Months the payment covers.' })
  @IsInt()
  @Min(PREPAID_TERM_MIN_MONTHS)
  @Max(PREPAID_TERM_MAX_MONTHS)
  termMonths!: number

  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: RECURRING_NAME_MAX,
    description: 'Default: the merchant, or the existing item’s name.',
  })
  @ValidateIf((_o: object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(RECURRING_NAME_MAX)
  name?: string

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Default: true for a new item, kept for an existing one.',
  })
  @ValidateIf((_o: object, value: unknown) => value !== undefined)
  @IsBoolean()
  isFixedCost?: boolean
}

export class ConfirmRecurringItemsDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: RECURRING_CONFIRM_MAX_IDS,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(RECURRING_CONFIRM_MAX_IDS)
  @IsUUID('all', { each: true })
  ids!: string[]
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export class RecurringOccurrenceDto {
  @ApiProperty({ type: String, format: 'uuid' })
  transactionId!: string

  @ApiProperty(DATE_DOC)
  date!: string

  @ApiProperty({ type: 'integer', description: 'Positive cents.' })
  amountCents!: number
}

export class RecurringAmountRunDto {
  @ApiProperty({ type: 'integer', description: 'Positive cents.' })
  amountCents!: number

  @ApiProperty({ ...DATE_DOC, description: 'First occurrence of the run.' })
  from!: string

  @ApiProperty({ ...DATE_DOC, description: 'Last occurrence of the run.' })
  to!: string

  @ApiProperty({ type: 'integer' })
  count!: number
}

export class RecurringItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: String })
  accountName!: string

  @ApiProperty({ type: String, example: 'STREAMFLIX' })
  merchantKey!: string

  @ApiProperty({
    type: String,
    description:
      'Text to search the transactions with (`/transactions?q=`): the merchant as stored, or the merchant key.',
  })
  searchText!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty(DIRECTION_DOC)
  direction!: RecurringDirection

  @ApiProperty(STATUS_DOC)
  status!: RecurringStatus

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  categoryId!: string | null

  @ApiProperty({ type: String, nullable: true })
  categorySlug!: string | null

  @ApiProperty({ type: String, nullable: true })
  categoryName!: string | null

  @ApiProperty({ type: String, nullable: true, example: '#7c3aed' })
  categoryColor!: string | null

  @ApiProperty(CATEGORY_ICON_DOC)
  categoryIcon!: CategoryIcon | null

  @ApiProperty({ type: Boolean })
  isFixedCost!: boolean

  @ApiProperty({
    type: Boolean,
    description: 'Filed under the `subscriptions` category.',
  })
  isSubscription!: boolean

  @ApiProperty({
    ...CADENCE_DOC,
    description: 'Cadence in use: the override, else the detected one.',
  })
  cadence!: RecurringCadence

  @ApiProperty({ ...CADENCE_DOC, description: 'Detected cadence.' })
  detectedCadence!: RecurringCadence

  @ApiProperty({ type: Boolean })
  cadenceOverridden!: boolean

  @ApiProperty(AMOUNT_TYPE_DOC)
  amountType!: RecurringAmountType

  @ApiProperty({
    type: 'integer',
    description:
      'Positive cents: current price (fixed) or median of the recent amounts (variable).',
  })
  typicalAmountCents!: number

  @ApiProperty({ type: 'integer', description: 'Latest occurrence.' })
  latestAmountCents!: number

  @ApiProperty({ type: 'integer' })
  minAmountCents!: number

  @ApiProperty({ type: 'integer' })
  maxAmountCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Typical amount × occurrences per year; for a prepaid item, amount × 12 ÷ term (half to even).',
  })
  yearlyCostCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Yearly cost / 12, rounded to the cent; for a prepaid item, amount ÷ term (half to even).',
  })
  monthlyEquivalentCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Price before the latest change (fixed amounts only).',
  })
  previousAmountCents!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Current − previous price; null without a change.',
  })
  priceChangeCents!: number | null

  @ApiProperty({
    ...DATE_DOC,
    nullable: true,
    description: 'First occurrence at the current price.',
  })
  priceChangedOn!: string | null

  @ApiProperty({
    type: Number,
    example: 0.92,
    description: 'Detection confidence in [0, 1].',
  })
  confidence!: number

  @ApiProperty({
    type: Boolean,
    description:
      'False after 1.5 periods without an occurrence (judged against the latest imported transaction of the account).',
  })
  active!: boolean

  @ApiProperty(DATE_DOC)
  firstSeenDate!: string

  @ApiProperty(DATE_DOC)
  lastSeenDate!: string

  @ApiProperty({ ...DATE_DOC, nullable: true })
  nextExpectedDate!: string | null

  @ApiProperty({ type: 'integer' })
  occurrenceCount!: number

  @ApiProperty({
    type: [RecurringOccurrenceDto],
    description: `The ${RECURRING_OCCURRENCES_SHOWN} latest, newest first.`,
  })
  occurrences!: RecurringOccurrenceDto[]

  @ApiProperty({
    type: [RecurringAmountRunDto],
    description: `Consecutive occurrences of the same amount over the whole history, newest first (at most ${RECURRING_AMOUNT_RUNS_SHOWN}): « 14,99 € d'août à novembre, 4 fois ».`,
  })
  amountRuns!: RecurringAmountRunDto[]

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null

  @ApiProperty({
    ...DATE_DOC,
    nullable: true,
    description:
      'Cancellation date: the first day no charge is expected any more. Null when the item is not cancelled.',
  })
  endedOn!: string | null

  @ApiProperty({
    type: Boolean,
    description:
      '`endedOn` is today or earlier (Europe/Paris): out of the totals, the forecast and the upcoming debits.',
  })
  ended!: boolean

  @ApiProperty({
    ...DATE_DOC,
    nullable: true,
    description:
      'Latest occurrence booked on or after `endedOn` (a cancellation that did not go through); null otherwise.',
  })
  chargedAfterEnd!: string | null

  @ApiProperty({
    ...TERM_DOC,
    nullable: true,
    description:
      'Prepaid term in months (#314): paid upfront for the term (`typicalAmountCents`, the latest payment). Null for an item charged every period.',
  })
  termMonths!: number | null

  @ApiProperty({
    ...DATE_DOC,
    nullable: true,
    description:
      'Prepaid items: the latest payment + the term (also `nextExpectedDate`). Null otherwise.',
  })
  renewalDate!: string | null

  @ApiProperty({
    type: Boolean,
    description:
      'Prepaid items: the renewal is at most 30 days away, the item is not cancelled and the owner has not kept it yet: remind them to keep or cancel it.',
  })
  renewalReminder!: boolean
}

export class PrepaidDeclarationDto {
  @ApiProperty({ type: RecurringItemDto })
  item!: RecurringItemDto

  @ApiProperty({
    ...STATUS_DOC,
    nullable: true,
    description:
      'Status of the item before the declaration; null when it was created (undo: `DELETE /recurring/:id`).',
  })
  previousStatus!: RecurringStatus | null
}

export class RecurringDetectResultDto {
  @ApiProperty({
    type: 'integer',
    description: 'Series found (active or not).',
  })
  detectedCount!: number

  @ApiProperty({ type: 'integer', description: 'New suggestions.' })
  createdCount!: number

  @ApiProperty({
    type: 'integer',
    description: 'Existing items whose stats were refreshed.',
  })
  updatedCount!: number

  @ApiProperty({
    type: 'integer',
    description: 'Suggestions no longer detected, removed.',
  })
  removedCount!: number

  @ApiProperty({
    type: 'integer',
    description: 'Suggestions waiting for review.',
  })
  suggestedCount!: number
}

export class RecurringConfirmResultDto {
  @ApiProperty({ type: 'integer' })
  confirmedCount!: number
}

export class RecurringTotalDto {
  @ApiProperty({ type: 'integer', description: 'round(yearlyCents / 12).' })
  monthlyCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Sum of the yearly costs of the items.',
  })
  yearlyCents!: number

  @ApiProperty({ type: 'integer' })
  count!: number
}

export class RecurringDebitsSummaryDto extends RecurringTotalDto {
  @ApiProperty({
    type: RecurringTotalDto,
    description: 'Items counted as fixed costs.',
  })
  fixed!: RecurringTotalDto

  @ApiProperty({
    type: RecurringTotalDto,
    description: 'Items not counted as fixed costs.',
  })
  variable!: RecurringTotalDto

  @ApiProperty({
    type: RecurringTotalDto,
    description:
      'Items filed under the `subscriptions` category (also in fixed or variable).',
  })
  subscriptions!: RecurringTotalDto
}

export class RecurringSummaryDto {
  @ApiProperty({
    type: RecurringDebitsSummaryDto,
    description: 'Confirmed, active debits, not cancelled as of today.',
  })
  debits!: RecurringDebitsSummaryDto

  @ApiProperty({
    type: RecurringTotalDto,
    description:
      'Confirmed, active credits (salary, benefits, ...), not ended as of today.',
  })
  credits!: RecurringTotalDto

  @ApiProperty({ type: 'integer', description: 'Suggestions to review.' })
  suggestedCount!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Confirmed items that are inactive and not cancelled (left out of the totals).',
  })
  inactiveCount!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Confirmed items cancelled as of today (`ended`, left out of the totals).',
  })
  endedCount!: number
}
