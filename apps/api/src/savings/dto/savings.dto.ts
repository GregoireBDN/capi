import { applyDecorators } from '@nestjs/common'
import { MonthPeriodDto } from '#/coverage/dto/period.dto'
import { MonthFlowDto } from '#/dashboard/dto/dashboard.dto'
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
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
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator'
import { ACCOUNT_TYPES, type AccountType } from '#/database/schema/domain-enums'
import {
  SAVINGS_GOAL_SOURCES,
  type SavingsGoalSource,
} from '#/database/schema/domain-enums'
import {
  InvestmentAccountSummaryDto,
  InvestmentsTotalsDto,
} from '#/investments/dto/snapshot.dto'
import { isCalendarDate } from '#/investments/calendar-date'

export const SAVINGS_MONTHS_DEFAULT = 12
export const SAVINGS_MONTHS_MAX = 60
/** Full-month windows of the averages. */
export const AVERAGE_WINDOWS = [3, 6, 12] as const
/** Window whose average (one-offs excluded) drives the goal projections. */
export const PROJECTION_WINDOW = 6
/** Highest goal or target amount accepted: 10 000 000 €. */
export const MAX_AMOUNT_CENTS = 1_000_000_000
export const GOAL_NAME_MAX = 100
export const GOAL_ACCOUNTS_MAX = 20

@ValidatorConstraint({ name: 'calendarDate' })
class CalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isCalendarDate(value)
  }
  defaultMessage() {
    return '$property must be an existing YYYY-MM-DD date'
  }
}

const Amount = (minimum: number) =>
  applyDecorators(IsInt(), Min(minimum), Max(MAX_AMOUNT_CENTS))

const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )

/* ============================================================================
 * QUERIES & BODIES
 * ========================================================================= */

export class SavingsOverviewQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: SAVINGS_MONTHS_MAX,
    default: SAVINGS_MONTHS_DEFAULT,
    description:
      'Number of calendar months (Europe/Paris) in `months`, ending with the current one.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SAVINGS_MONTHS_MAX)
  months?: number
}

export class ListGoalsQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description: 'Also return archived goals (after the active ones).',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  includeArchived?: boolean
}

export class SavingsTargetDto {
  @ApiProperty({
    type: 'integer',
    nullable: true,
    minimum: 1,
    maximum: MAX_AMOUNT_CENTS,
    description:
      'Monthly savings target in cents (e.g. 86000 = 860 €), null to clear it.',
  })
  @ValidateIf((_, value) => value !== null)
  @Amount(1)
  monthlyTargetCents!: number | null
}

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

export class CreateGoalDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: GOAL_NAME_MAX })
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(GOAL_NAME_MAX)
  name!: string

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: MAX_AMOUNT_CENTS,
    description: 'Target amount in cents.',
  })
  @Amount(1)
  targetCents!: number

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    description: 'Calendar date to reach the target by; null = no deadline.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '$property must be YYYY-MM-DD' })
  @Validate(CalendarDateConstraint)
  targetDate?: string | null

  @ApiPropertyOptional({
    enum: SAVINGS_GOAL_SOURCES,
    enumName: 'SavingsGoalSource',
    default: 'accounts',
    description:
      '`accounts`: the current amount is the sum of the linked accounts’ balances (at least one account). `manual`: `manualAmountCents`.',
  })
  @IsOptional()
  @IsIn(SAVINGS_GOAL_SOURCES)
  source?: SavingsGoalSource

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 0,
    maximum: MAX_AMOUNT_CENTS,
    description: 'Amount saved so far when `source = manual` (default 0).',
  })
  @IsOptional()
  @Amount(0)
  manualAmountCents?: number | null

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: GOAL_ACCOUNTS_MAX,
    description: 'Linked accounts (any type, archived ones included).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(GOAL_ACCOUNTS_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  accountIds?: string[]

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    pattern: COLOR_PATTERN.source,
    example: '#0284c7',
  })
  @IsOptional()
  @Matches(COLOR_PATTERN, { message: '$property must be #rrggbb' })
  color?: string | null
}

/** Every field optional; omitted fields keep their value. */
export class UpdateGoalDto extends PartialType(CreateGoalDto) {
  @ApiPropertyOptional({
    type: Boolean,
    description: 'Archive (true) or restore (false) the goal.',
  })
  @IsOptional()
  @IsBoolean()
  archived?: boolean
}

/* ============================================================================
 * RESPONSES
 * ========================================================================= */

export class SavingsTargetResultDto {
  @ApiProperty({ type: 'integer', nullable: true })
  monthlyTargetCents!: number | null
}

export class SavingsMonthDto {
  @ApiProperty({ type: String, example: '2026-11', description: 'YYYY-MM.' })
  month!: string

  @ApiProperty({
    type: Boolean,
    description:
      'Whether the data reaches the end of the month (false for the running month, and for a month whose statement is not fully imported yet).',
  })
  complete!: boolean

  @ApiProperty({
    type: 'integer',
    description: 'Sum of `income` transactions (transfers never count).',
  })
  incomeCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Sum of `expense` transactions, negative (transfers never count).',
  })
  expenseCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Net savings: `incomeCents + expenseCents`, as the dashboard (negative = dissaving).',
  })
  netCents!: number

  @ApiProperty({
    type: Number,
    nullable: true,
    description: '`netCents / incomeCents`, null without positive income.',
  })
  savingsRate!: number | null

  @ApiProperty({ type: 'integer', description: 'One-off part of the income.' })
  oneOffIncomeCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'One-off part of the expenses (negative).',
  })
  oneOffExpenseCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Impact of one-offs on the net: `oneOffIncomeCents + oneOffExpenseCents`.',
  })
  oneOffNetCents!: number

  @ApiProperty({
    type: 'integer',
    description: '`netCents - oneOffNetCents`.',
  })
  netExcludingOneOffsCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Net amount moved to savings accounts: the sum of the `transfer` transactions booked on `savings` accounts, any category (deposits positive, withdrawals negative). Falls back to minus the `savings_transfer` transfers on checking accounts only when no savings account has any transaction. A move recorded on both accounts counts once.',
  })
  movedToSavingsCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Net amount moved to investment accounts (which have no transactions): minus the sum of the `transfer` transactions booked on checking accounts with the `investment_transfer` category.',
  })
  movedToInvestmentsCents!: number

  @ApiProperty({
    type: 'integer',
    description: '`movedToSavingsCents + movedToInvestmentsCents`.',
  })
  movedCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      '`netCents - monthlyTargetCents` (negative = below target), null without a target.',
  })
  targetGapCents!: number | null
}

export class SavingsAverageDto {
  @ApiProperty({ type: 'integer', description: 'Window in full months.' })
  months!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Full months averaged: the window minus the months before the first income or expense.',
  })
  monthCount!: number

  @ApiProperty({ type: String, nullable: true, description: 'First month.' })
  from!: string | null

  @ApiProperty({ type: String, nullable: true, description: 'Last month.' })
  to!: string | null

  @ApiProperty({ type: 'integer', nullable: true })
  incomeCents!: number | null

  @ApiProperty({ type: 'integer', nullable: true })
  expenseCents!: number | null

  @ApiProperty({ type: 'integer', nullable: true })
  netCents!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Average net with one-off income and expenses left out.',
  })
  netExcludingOneOffsCents!: number | null

  @ApiProperty({ type: 'integer', nullable: true })
  movedCents!: number | null

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Window net / window income.',
  })
  savingsRate!: number | null
}

export class CashSavingsAccountDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ enum: ACCOUNT_TYPES, enumName: 'AccountType' })
  type!: AccountType

  @ApiProperty({ type: String, nullable: true })
  institution!: string | null

  @ApiProperty({ type: 'integer', nullable: true })
  balanceCents!: number | null

  @ApiProperty({ type: String, format: 'date', nullable: true })
  balanceDate!: string | null
}

export class CashSavingsDto {
  @ApiProperty({
    type: 'integer',
    description: 'Sum of the known balances of the savings accounts.',
  })
  totalCents!: number

  @ApiProperty({ type: [CashSavingsAccountDto] })
  accounts!: CashSavingsAccountDto[]
}

export class InvestmentsStockDto {
  @ApiProperty({ type: InvestmentsTotalsDto })
  totals!: InvestmentsTotalsDto

  @ApiProperty({ type: [InvestmentAccountSummaryDto] })
  accounts!: InvestmentAccountSummaryDto[]
}

export class SavingsStockDto {
  @ApiProperty({
    type: 'integer',
    description: 'Cash savings + investments value, in cents.',
  })
  totalCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Investment gain (value - contributions), null when no contribution is known.',
  })
  gainCents!: number | null

  @ApiProperty({
    type: CashSavingsDto,
    description: 'Non-archived `savings` accounts.',
  })
  cash!: CashSavingsDto

  @ApiProperty({
    type: InvestmentsStockDto,
    description: 'As `GET /investments/summary`.',
  })
  investments!: InvestmentsStockDto
}

export class SavingsOverviewDto {
  @ApiProperty({ type: String, description: 'Current month (Europe/Paris).' })
  currentMonth!: string

  @ApiProperty({
    type: MonthPeriodDto,
    description:
      'Month of the headline figures (`current`): the current month when it has data, else the month the data stops in; how far its data goes and what it is compared with.',
  })
  period!: MonthPeriodDto

  @ApiProperty({
    type: MonthFlowDto,
    description:
      'Income, expenses and net savings of `period.month` (the dashboard’s figures).',
  })
  current!: MonthFlowDto

  @ApiProperty({
    type: MonthFlowDto,
    description:
      'The month before, up to `period.previousUntil`: its same first days while `period.month` is partial. Not comparable when `period.status` is `empty`.',
  })
  previous!: MonthFlowDto

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Monthly savings target in cents, null when not set.',
  })
  monthlyTargetCents!: number | null

  @ApiProperty({
    type: [SavingsMonthDto],
    description: 'The requested months, oldest first, current one last.',
  })
  months!: SavingsMonthDto[]

  @ApiProperty({
    type: [SavingsAverageDto],
    description: 'Averages over the 3, 6 and 12 full months before this one.',
  })
  averages!: SavingsAverageDto[]

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: `Average monthly savings used by the goal projections: the ${PROJECTION_WINDOW}-month average net, one-offs excluded.`,
  })
  projectionAverageCents!: number | null

  @ApiProperty({ type: SavingsStockDto })
  stock!: SavingsStockDto
}

export class GoalProjectionDto {
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Average monthly savings the projection uses.',
  })
  averageMonthlyCents!: number | null

  @ApiProperty({
    type: Boolean,
    description: 'False when the average is unknown or ≤ 0.',
  })
  reachable!: boolean

  @ApiProperty({ type: 'integer', nullable: true })
  monthsNeeded!: number | null

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description: 'Month end at which the target would be reached.',
  })
  projectedDate!: string | null

  @ApiProperty({
    type: Boolean,
    nullable: true,
    description:
      'Projected date ≤ target date; null without a target date, true once reached.',
  })
  onTrack!: boolean | null
}

export class SavingsGoalDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: 'integer' })
  targetCents!: number

  @ApiProperty({ type: String, format: 'date', nullable: true })
  targetDate!: string | null

  @ApiProperty({ enum: SAVINGS_GOAL_SOURCES, enumName: 'SavingsGoalSource' })
  source!: SavingsGoalSource

  @ApiProperty({ type: 'integer', nullable: true })
  manualAmountCents!: number | null

  @ApiProperty({ type: [String], format: 'uuid' })
  accountIds!: string[]

  @ApiProperty({ type: String, nullable: true })
  color!: string | null

  @ApiProperty({ type: Boolean })
  archived!: boolean

  @ApiProperty({
    type: 'integer',
    description:
      'Saved so far: the linked accounts’ known balances, or the manual amount.',
  })
  currentCents!: number

  @ApiProperty({
    type: Number,
    description: '`currentCents / targetCents` (may exceed 1).',
  })
  progressRatio!: number

  @ApiProperty({ type: 'integer' })
  remainingCents!: number

  @ApiProperty({ type: Boolean })
  reached!: boolean

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Month ends left until the target date (today’s month end included; 0 once passed), null without a date.',
  })
  monthsLeft!: number | null

  @ApiProperty({ type: Boolean })
  targetDatePassed!: boolean

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Saving needed per month to reach the target by its date; null without a date or once it has passed.',
  })
  requiredMonthlyCents!: number | null

  @ApiProperty({ type: GoalProjectionDto })
  projection!: GoalProjectionDto
}
