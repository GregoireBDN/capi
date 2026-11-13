import { ApiProperty } from '@nestjs/swagger'
import { PERIOD_STATUSES, type PeriodStatus } from '../period'

/**
 * How far the figures of a month go and what they are compared with (see
 * `coverage/period.ts`). Shared by the dashboard, spending, savings and
 * budget responses.
 */
export class MonthPeriodDto {
  @ApiProperty({ type: String, example: '2026-11', description: 'YYYY-MM.' })
  month!: string

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-11-03',
    description:
      'Latest day with data in scope (latest booked transaction or end of the latest committed import, the account’s when filtered by account), never after today in Europe/Paris. Null when there is no data at all.',
  })
  dataUntil!: string | null

  @ApiProperty({
    enum: PERIOD_STATUSES,
    enumName: 'PeriodStatus',
    description:
      '`complete`: the data reaches the end of the month. `partial`: it stops inside it, so only its first `throughDay` days are known and comparisons use the same days of the other months. `empty`: it stops before the month, so there is nothing to compare.',
  })
  status!: PeriodStatus

  @ApiProperty({
    type: 'integer',
    nullable: true,
    example: 3,
    description:
      'Day of the month the figures go up to when `partial`, null otherwise.',
  })
  throughDay!: number | null

  @ApiProperty({ type: String, example: '2026-10', description: 'YYYY-MM.' })
  previousMonth!: string

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-10-03',
    description:
      'Last day of `previousMonth` taken in the comparison: the same first days when `partial` (its last day if it is shorter), its last day when `complete`, null when `empty`.',
  })
  previousUntil!: string | null

  @ApiProperty({
    type: String,
    example: '2026-11',
    description:
      'Month shown when none is asked for: the current month (Europe/Paris) when it has data, else the month the data stops in.',
  })
  defaultMonth!: string
}
