import { ApiProperty } from '@nestjs/swagger'

/** How far the data goes, for the month navigators (`GET /coverage`). */
export class CoverageDto {
  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-11-03',
    description:
      'Latest day with imported data (latest booked transaction or end of the latest committed import, every account), never after today in Europe/Paris. Null when nothing was imported. Transactions entered by hand do not count.',
  })
  dataUntil!: string | null

  @ApiProperty({
    type: String,
    example: '2026-11',
    description: 'Current month in Europe/Paris (YYYY-MM).',
  })
  currentMonth!: string

  @ApiProperty({
    type: String,
    example: '2026-10',
    description:
      'Month shown when none is asked for: the current month when it has data, else the month the data stops in (YYYY-MM).',
  })
  defaultMonth!: string

  @ApiProperty({
    type: [String],
    example: ['2026-09', '2026-10'],
    description:
      'Months (YYYY-MM, oldest first) with at least one transaction, imported or entered by hand, up to the current month.',
  })
  months!: string[]
}
