import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator'
import { ACCOUNT_TYPES, type AccountType } from '#/database/schema/domain-enums'
import { MONTH_PATTERN } from '../calendar'

export const HISTORY_MONTHS_DEFAULT = 12
export const HISTORY_MONTHS_MAX = 60

export const ACCOUNT_GROUPS = ['cash', 'investments'] as const
export type AccountGroup = (typeof ACCOUNT_GROUPS)[number]

/* ============================================================================
 * QUERIES
 * ========================================================================= */

export class DashboardOverviewQueryDto {
  @ApiPropertyOptional({
    type: String,
    pattern: MONTH_PATTERN.source,
    example: '2026-11',
    description:
      'Calendar month (YYYY-MM) of the income / expense figures. Default: the current month in Europe/Paris.',
  })
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: '$property must be YYYY-MM' })
  month?: string
}

export class DashboardHistoryQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: HISTORY_MONTHS_MAX,
    default: HISTORY_MONTHS_DEFAULT,
    description:
      'Number of calendar months (Europe/Paris), ending with the current one.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(HISTORY_MONTHS_MAX)
  months?: number
}

/* ============================================================================
 * RESPONSES
 * ========================================================================= */

export class MonthFlowDto {
  @ApiProperty({ type: String, example: '2026-11', description: 'YYYY-MM.' })
  month!: string

  @ApiProperty({
    type: 'integer',
    description:
      'Signed sum of `income` transactions booked in the month, in cents. Transfers are never counted.',
  })
  incomeCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Signed sum of `expense` transactions booked in the month, in cents (negative when money went out). Transfers are never counted.',
  })
  expenseCents!: number

  @ApiProperty({
    type: 'integer',
    description: '`incomeCents` + `expenseCents`: what was saved.',
  })
  netCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Part of `incomeCents` from one-off transactions.',
  })
  oneOffIncomeCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Part of `expenseCents` from one-off transactions.',
  })
  oneOffExpenseCents!: number

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      '`netCents` / `incomeCents` (e.g. 0.18), null when there is no positive income.',
  })
  savingsRate!: number | null
}

export class DashboardAccountDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ enum: ACCOUNT_TYPES, enumName: 'AccountType' })
  type!: AccountType

  @ApiProperty({ type: String, nullable: true })
  institution!: string | null

  @ApiProperty({
    enum: ACCOUNT_GROUPS,
    enumName: 'AccountGroup',
    description:
      '`cash` = checking and savings accounts, `investments` = the others.',
  })
  group!: AccountGroup

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Current balance in cents (as `GET /accounts`).',
  })
  balanceCents!: number | null

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description: 'Calendar date the balance is known at.',
  })
  balanceDate!: string | null
}

export class NetWorthDto {
  @ApiProperty({
    type: 'integer',
    description:
      'Sum of the known balances of every non-archived account, in cents.',
  })
  totalCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Checking and savings accounts.',
  })
  cashCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Brokerage, life insurance, employee savings and crypto accounts.',
  })
  investmentsCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Net worth at the end of the previous calendar month (Europe/Paris, relative to today), same accounts; null when no account had a balance then.',
  })
  previousMonthEndCents!: number | null

  @ApiProperty({
    type: 'integer',
    description:
      'Non-archived accounts whose balance is unknown (left out of the sums).',
  })
  unknownBalanceCount!: number
}

export class DashboardOverviewDto {
  @ApiProperty({ type: NetWorthDto })
  netWorth!: NetWorthDto

  @ApiProperty({
    type: [DashboardAccountDto],
    description: 'Non-archived accounts, in display order.',
  })
  accounts!: DashboardAccountDto[]

  @ApiProperty({
    type: MonthFlowDto,
    description: 'Income and expenses of the requested month.',
  })
  current!: MonthFlowDto

  @ApiProperty({
    type: MonthFlowDto,
    description: 'The month before, for deltas.',
  })
  previous!: MonthFlowDto

  @ApiProperty({
    type: 'integer',
    description: 'Transactions waiting in the review queue.',
  })
  reviewCount!: number
}

export class HistoryMonthDto {
  @ApiProperty({ type: String, example: '2026-11', description: 'YYYY-MM.' })
  month!: string

  @ApiProperty({
    type: 'integer',
    description: 'Income of the month in cents, transfers excluded.',
  })
  incomeCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Expenses of the month in cents (negative), transfers excluded.',
  })
  expenseCents!: number

  @ApiProperty({
    type: 'integer',
    description: '`incomeCents` + `expenseCents`.',
  })
  netCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Sum of the non-archived accounts balances at the end of the month, in cents; null when no account had a balance yet.',
  })
  netWorthCents!: number | null
}

export class DashboardHistoryDto {
  @ApiProperty({
    type: [HistoryMonthDto],
    description: 'One entry per month, oldest first, the current month last.',
  })
  months!: HistoryMonthDto[]
}
