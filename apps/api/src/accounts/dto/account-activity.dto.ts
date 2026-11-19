import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, Matches } from 'class-validator'
import { MonthPeriodDto } from '#/coverage/dto/period.dto'
import { MONTH_PATTERN } from '#/dashboard/calendar'

export class BalancePointDto {
  @ApiProperty({ type: String, format: 'date', example: '2026-10-31' })
  date!: string

  @ApiProperty({
    type: 'integer',
    description: 'Balance at the end of the day, in cents (bank values).',
  })
  balanceCents!: number
}

export class StatementBalanceDto {
  @ApiProperty({ type: String, format: 'date', example: '2026-09-30' })
  date!: string

  @ApiProperty({
    type: 'integer',
    description: 'Statement balance recorded for the day, in cents.',
  })
  valueCents!: number
}

export class BalanceGapDto {
  @ApiProperty({
    type: String,
    format: 'date',
    description: 'Last day whose running balance follows.',
  })
  fromDate!: string

  @ApiProperty({
    type: String,
    format: 'date',
    description: 'First day whose running balance does not follow.',
  })
  toDate!: string

  @ApiProperty({
    type: 'integer',
    description:
      'Bank balance − expected balance, in cents: the amount of the rows missing between the two days.',
  })
  differenceCents!: number
}

export class BalanceHistoryDto {
  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description:
      'First day of the series: the first day of the month 11 months before `to`, or the first day with data when later. Null without any data.',
  })
  from!: string | null

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description:
      'Last day of the series: the latest transaction (hand-entered ones included) or statement balance. Null without any data.',
  })
  to!: string | null

  @ApiProperty({
    type: [BalancePointDto],
    description:
      'End-of-day balance on every day from `from` to `to`, with the anchors of the account balance as of each day (latest statement balance or chaining running balance, plus the amounts booked after it, hand-entered ones from the day after the anchor). Bank values: a hand correction never changes it. The last point is the current balance.',
  })
  points!: BalancePointDto[]

  @ApiProperty({
    type: [StatementBalanceDto],
    description: 'Statement balances recorded between `from` and `to`.',
  })
  statements!: StatementBalanceDto[]

  @ApiProperty({
    type: [BalanceGapDto],
    description:
      'Running-balance gaps of the imported rows between `from` and `to` (hand-entered rows left out), oldest first.',
  })
  gaps!: BalanceGapDto[]

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description:
      'Latest day with bank data for the account (latest imported row or end of its latest committed import), never after today in Europe/Paris; hand-entered rows do not count.',
  })
  dataUntil!: string | null

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description:
      'Day (Europe/Paris) of the account’s latest committed import, or null.',
  })
  lastImportOn!: string | null
}

export class AccountMonthFlowsQueryDto {
  @ApiPropertyOptional({
    type: String,
    pattern: MONTH_PATTERN.source,
    example: '2026-10',
    description:
      'Calendar month (YYYY-MM). Default: the current month when the account has data in it, else the month its data stops in.',
  })
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: '$property must be YYYY-MM' })
  month?: string
}

export class AccountMonthFlowsDto {
  @ApiProperty({
    type: MonthPeriodDto,
    description: 'The month and how far the account’s data goes in it.',
  })
  period!: MonthPeriodDto

  @ApiProperty({
    type: 'integer',
    description:
      'Money in during the month, in cents (≥ 0): every credit of the account, transfers from the owner’s other accounts and hand-entered rows included. Bank values.',
  })
  inCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Money out during the month, in cents (≤ 0): every debit, transfers included.',
  })
  outCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      '`inCents` + `outCents`: how much the balance moved over the month.',
  })
  netCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Part of `inCents` from transfers between the owner’s accounts (never income).',
  })
  transfersInCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Part of `outCents` from transfers between the owner’s accounts (never expenses).',
  })
  transfersOutCents!: number

  @ApiProperty({ type: 'integer', description: 'Transactions in the month.' })
  count!: number
}
