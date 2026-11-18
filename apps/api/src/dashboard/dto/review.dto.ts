import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, Matches } from 'class-validator'
import { MonthPeriodDto } from '#/coverage/dto/period.dto'
import { ACCOUNT_TYPES, type AccountType } from '#/database/schema/domain-enums'
import { MONTH_PATTERN } from '../calendar'
import {
  ACCOUNT_GROUPS,
  type AccountGroup,
  MonthFlowDto,
} from './dashboard.dto'

/** Categories listed above / below their target. */
export const REVIEW_TOP_CATEGORIES = 3

export class MonthReviewQueryDto {
  @ApiPropertyOptional({
    type: String,
    pattern: MONTH_PATTERN.source,
    example: '2026-10',
    description:
      'Calendar month (YYYY-MM) to review. Default: the previous calendar month in Europe/Paris.',
  })
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: '$property must be YYYY-MM' })
  month?: string
}

export class ReviewNetWorthDto {
  @ApiProperty({ type: String, format: 'date', example: '2026-10-31' })
  date!: string

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Net worth at the end of `date`, in cents (non-archived accounts, as the dashboard history); null when no account had a balance then.',
  })
  endCents!: number | null

  @ApiProperty({ type: String, format: 'date', example: '2026-09-30' })
  previousDate!: string

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Net worth at the end of the month before, in cents.',
  })
  previousEndCents!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      '`endCents` − `previousEndCents`; null when either is unknown. Always `savedCents` + `otherCents`.',
  })
  changeCents!: number | null

  @ApiProperty({
    type: 'integer',
    description:
      'Part of the change saved from the month’s cash flow: income + expenses (transfers between own accounts never count).',
  })
  savedCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'The rest of the change: market moves and value updates of investments, and anything not booked as income or expense. Null when the change is unknown.',
  })
  otherCents!: number | null
}

export class ReviewCategoryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  categoryId!: string

  @ApiProperty({ type: String })
  slug!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: String, nullable: true })
  color!: string | null

  @ApiProperty({ type: 'integer', description: 'Monthly target in cents.' })
  targetCents!: number

  @ApiProperty({ type: 'integer', description: 'Spent in the month, cents.' })
  spentCents!: number

  @ApiProperty({
    type: 'integer',
    description: '`spentCents` − `targetCents`: positive above the target.',
  })
  gapCents!: number
}

export class ReviewBudgetDto {
  @ApiProperty({
    type: 'integer',
    description: 'Budgeted categories in the month (0: no budget set).',
  })
  budgetCount!: number

  @ApiProperty({ type: 'integer', description: 'Sum of the targets, cents.' })
  targetCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Spent on the budgeted categories, cents.',
  })
  spentCents!: number

  @ApiProperty({
    type: 'integer',
    description: '`targetCents` − `spentCents` (negative when over).',
  })
  remainingCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Spent outside the budgeted categories, cents.',
  })
  unbudgetedCents!: number

  @ApiProperty({
    type: [ReviewCategoryDto],
    description: `Up to ${REVIEW_TOP_CATEGORIES} categories above their target, furthest first.`,
  })
  over!: ReviewCategoryDto[]

  @ApiProperty({
    type: [ReviewCategoryDto],
    description: `Up to ${REVIEW_TOP_CATEGORIES} categories below their target, furthest first.`,
  })
  under!: ReviewCategoryDto[]
}

export class ReviewMissingAccountDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ enum: ACCOUNT_TYPES, enumName: 'AccountType' })
  type!: AccountType

  @ApiProperty({ enum: ACCOUNT_GROUPS, enumName: 'AccountGroup' })
  group!: AccountGroup

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description:
      'Date the account’s data goes up to (cash: latest transaction or statement end; investments: latest value), null when it has none.',
  })
  lastDate!: string | null
}

export class MonthReviewDto {
  @ApiProperty({ type: String, example: '2026-10', description: 'YYYY-MM.' })
  month!: string

  @ApiProperty({
    type: String,
    example: '2026-11',
    description: 'The month after, whose budget the review prepares.',
  })
  nextMonth!: string

  @ApiProperty({
    type: MonthPeriodDto,
    description: 'How far the month’s data goes.',
  })
  period!: MonthPeriodDto

  @ApiProperty({
    type: Boolean,
    description:
      'Every account is up to date for the month: data reaches the month end and no account is missing.',
  })
  closed!: boolean

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'When the month was closed in « Revue du mois » (`POST /month-close/:month/close`); null while it is open.',
  })
  closedAt!: string | null

  @ApiProperty({
    type: Boolean,
    description:
      'The next month has a budget line in effect (its own or carried over).',
  })
  nextMonthBudgeted!: boolean

  @ApiProperty({ type: ReviewNetWorthDto })
  netWorth!: ReviewNetWorthDto

  @ApiProperty({
    type: MonthFlowDto,
    description:
      'Income, expenses, net saved and savings rate of the month (transfers excluded).',
  })
  flow!: MonthFlowDto

  @ApiProperty({ type: ReviewBudgetDto })
  budget!: ReviewBudgetDto

  @ApiProperty({
    type: [ReviewMissingAccountDto],
    description:
      'Non-archived accounts not updated up to the month end: cash accounts whose data stops before it (and with no import committed after it), investment accounts without a value on or after it.',
  })
  missing!: ReviewMissingAccountDto[]
}
