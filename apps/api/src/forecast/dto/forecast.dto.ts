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
      'Day the projection applies it: the expected date, or today when it is late or not imported yet.',
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
      'Days left to estimate (after the balance date, until month end).',
  })
  days!: number

  @ApiProperty({
    type: 'integer',
    description: 'Estimated spending until month end, in signed cents (≤ 0).',
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
      'End-of-day projected balance from today to month end (one point on the last day).',
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
      'First day the projection goes under `thresholdCents`, null if never.',
  })
  belowThreshold!: ForecastBalanceAtDto | null
}
