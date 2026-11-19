import { applyDecorators } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator'
import {
  CATEGORY_ICON_DOC,
  type CategoryIcon,
} from '#/categories/category-icons'
import {
  ACCOUNT_TYPES,
  type AccountType,
  RECURRING_AMOUNT_TYPES,
  RECURRING_DIRECTIONS,
  type RecurringAmountType,
  type RecurringDirection,
} from '#/database/schema/domain-enums'

/** Most accounts one forecast accepts. */
export const FORECAST_MAX_ACCOUNTS = 50
/** Threshold bounds: ±1 000 000 000 € in cents. */
export const FORECAST_THRESHOLD_LIMIT = 100_000_000_000
/** Full months before the current one the variable-spending estimate averages. */
export const ESTIMATE_MONTHS = 3
/**
 * Days the data may lag behind today before the forecast is only indicative
 * (no low-balance alert): statements are imported by hand (#215).
 */
export const FORECAST_STALE_AFTER_DAYS = 7

const DATE_DOC = {
  type: String,
  format: 'date',
  example: '2026-11-06',
} as const

/* ============================================================================
 * QUERY
 * ========================================================================= */

/** `a,b` or a repeated parameter → a list of trimmed, non-empty strings. */
const QueryList = () =>
  Transform(({ value }: { value: unknown }) => {
    const parts = (Array.isArray(value) ? value : [value]).flatMap((part) =>
      typeof part === 'string' ? part.split(',') : [part],
    )
    return parts
      .map((part) => (typeof part === 'string' ? part.trim() : part))
      .filter((part) => part !== '')
  })

/** Query-string booleans: only the literal `true` / `false` are accepted. */
const QueryBoolean = () =>
  applyDecorators(
    IsOptional(),
    Transform(({ value }: { value: unknown }) =>
      value === 'true' ? true : value === 'false' ? false : value,
    ),
    IsBoolean(),
  )

export class ForecastQueryDto {
  @ApiPropertyOptional({
    type: String,
    example: 'a1b2c3d4-0000-4000-8000-000000000001',
    description:
      'Comma-separated ids of checking or savings accounts. Default: every non-archived checking account.',
  })
  @IsOptional()
  @QueryList()
  @ArrayMaxSize(FORECAST_MAX_ACCOUNTS)
  @IsUUID('all', { each: true })
  accountIds?: string[]

  @ApiPropertyOptional({
    type: 'integer',
    default: 0,
    minimum: -FORECAST_THRESHOLD_LIMIT,
    maximum: FORECAST_THRESHOLD_LIMIT,
    description:
      'Low-balance threshold in signed cents: `belowThreshold` is the first day the projection goes under it.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-FORECAST_THRESHOLD_LIMIT)
  @Max(FORECAST_THRESHOLD_LIMIT)
  threshold?: number

  @ApiPropertyOptional({
    type: Boolean,
    default: true,
    description:
      'Adds the variable-spending estimate (average daily day-to-day spending). `false` projects the recurring items only.',
  })
  @QueryBoolean()
  includeVariable?: boolean
}

/* ============================================================================
 * RESPONSE
 * ========================================================================= */

export class ForecastAccountDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ enum: ACCOUNT_TYPES, enumName: 'AccountType' })
  type!: AccountType

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Current balance in cents; null when it cannot be computed (it then counts as 0).',
  })
  balanceCents!: number | null

  @ApiProperty({ ...DATE_DOC, nullable: true })
  balanceDate!: string | null
}

export class ForecastItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  recurringItemId!: string

  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({
    ...DATE_DOC,
    description:
      'Day the projection applies it: the expected date, or the first projected day (`projectedFrom`) when it is late.',
  })
  date!: string

  @ApiProperty({ ...DATE_DOC, description: 'Date the series expects it on.' })
  expectedDate!: string

  @ApiProperty({
    type: 'integer',
    description: 'Signed cents (negative for a debit): the typical amount.',
  })
  amountCents!: number

  @ApiProperty({ enum: RECURRING_DIRECTIONS, enumName: 'RecurringDirection' })
  direction!: RecurringDirection

  @ApiProperty({
    enum: RECURRING_AMOUNT_TYPES,
    enumName: 'RecurringAmountType',
    description: '`variable`: the amount is the median of recent ones.',
  })
  amountType!: RecurringAmountType

  @ApiProperty({ type: Boolean })
  isFixedCost!: boolean

  @ApiProperty({ type: String, nullable: true })
  categoryName!: string | null

  @ApiProperty({ type: String, nullable: true })
  categoryColor!: string | null

  @ApiProperty(CATEGORY_ICON_DOC)
  categoryIcon!: CategoryIcon | null
}

export class ForecastEstimateDto {
  @ApiProperty({
    type: 'integer',
    description:
      'Average daily spending in positive cents: `expense` transactions of the selected accounts that are not part of a confirmed recurring item, not one-offs (transfers never count).',
  })
  dailyCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Days to estimate: after `knownUntil` (or from today when nothing is known), until month end.',
  })
  days!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Day-to-day spending entered by hand since `knownUntil` (already in the balance) that replaces the estimate of the elapsed days, in positive cents: at most that estimate, so it is never counted twice.',
  })
  coveredCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Estimated spending still to apply until month end, in signed cents (≤ 0): the days × the daily average, less `coveredCents`.',
  })
  totalCents!: number

  @ApiProperty({
    ...DATE_DOC,
    description: `First day of the averaged period (the last ${ESTIMATE_MONTHS} full months, from the first transaction).`,
  })
  basedOnFrom!: string

  @ApiProperty({ ...DATE_DOC, description: 'Last day of the averaged period.' })
  basedOnTo!: string
}

export class ForecastBalanceAtDto {
  @ApiProperty(DATE_DOC)
  date!: string

  @ApiProperty({ type: 'integer' })
  balanceCents!: number
}

export class ForecastPointDto extends ForecastBalanceAtDto {
  @ApiProperty({
    type: [ForecastItemDto],
    description: 'Recurring items applied that day.',
  })
  items!: ForecastItemDto[]

  @ApiProperty({
    type: 'integer',
    description: 'Variable-spending estimate applied that day (≤ 0).',
  })
  estimateCents!: number
}

export class ForecastDto {
  @ApiProperty({ ...DATE_DOC, description: 'Today in Europe/Paris.' })
  today!: string

  @ApiProperty({ ...DATE_DOC, description: 'Last day of the current month.' })
  monthEnd!: string

  @ApiProperty({ type: [ForecastAccountDto] })
  accounts!: ForecastAccountDto[]

  @ApiProperty({
    type: 'integer',
    description: 'Sum of the selected accounts’ current balances, in cents.',
  })
  startingBalanceCents!: number

  @ApiProperty({
    ...DATE_DOC,
    nullable: true,
    description: 'Latest balance date of the selected accounts.',
  })
  startingBalanceDate!: string | null

  @ApiProperty({
    ...DATE_DOC,
    nullable: true,
    description:
      'Date the imported data of the selected accounts goes up to (`coverage/` `dataUntil`, the latest of them, never after today); null without imported data. Transactions entered by hand never move it.',
  })
  knownUntil!: string | null

  @ApiProperty({
    ...DATE_DOC,
    description:
      'First projected day: the day after `knownUntil`, today at the latest (today without imported data).',
  })
  projectedFrom!: string

  @ApiProperty({
    type: Boolean,
    description: `True when \`knownUntil\` is more than ${FORECAST_STALE_AFTER_DAYS} days before today (or null): the forecast is only indicative and \`belowThreshold\` is null.`,
  })
  stale!: boolean

  @ApiProperty({
    type: 'integer',
    description: 'Days of lag after which the forecast is `stale`.',
    example: FORECAST_STALE_AFTER_DAYS,
  })
  staleAfterDays!: number

  @ApiProperty({ type: 'integer' })
  thresholdCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Confirmed, active recurring items on the selected accounts (0: nothing to project).',
  })
  recurringItemCount!: number

  @ApiProperty({
    type: [ForecastItemDto],
    description: 'Expected recurring items until month end, by date.',
  })
  items!: ForecastItemDto[]

  @ApiProperty({
    type: 'integer',
    description: 'Sum of the expected debits, in signed cents (≤ 0).',
  })
  expectedDebitsCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Sum of the expected credits, in cents (≥ 0).',
  })
  expectedCreditsCents!: number

  @ApiProperty({
    type: ForecastEstimateDto,
    nullable: true,
    description:
      'Variable-spending estimate; null when disabled or without history.',
  })
  estimate!: ForecastEstimateDto | null

  @ApiProperty({
    type: [ForecastPointDto],
    description:
      'End-of-day projected balance from `projectedFrom` to month end (one point when it is the last day).',
  })
  points!: ForecastPointDto[]

  @ApiProperty({ type: 'integer' })
  endBalanceCents!: number

  @ApiProperty({
    type: ForecastBalanceAtDto,
    description: 'Lowest projected balance (earliest on a tie).',
  })
  lowest!: ForecastBalanceAtDto

  @ApiProperty({
    type: ForecastBalanceAtDto,
    nullable: true,
    description:
      'First day the projection goes under `thresholdCents`, null if never or when the forecast is `stale` (no alert on data that lags behind).',
  })
  belowThreshold!: ForecastBalanceAtDto | null
}
