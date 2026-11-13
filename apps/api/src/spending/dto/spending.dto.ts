import { applyDecorators } from '@nestjs/common'
import { MonthPeriodDto } from '#/coverage/dto/period.dto'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator'

/** Full months before the selected one that the averages cover by default. */
export const AVERAGE_MONTHS_DEFAULT = 6
export const AVERAGE_MONTHS_MAX = 24
/** Months shown by the trend by default (the selected month included). */
export const TREND_MONTHS_DEFAULT = 12
export const TREND_MONTHS_MAX = 36
/** Categories drawn on their own in the trend; the rest folds into "other". */
export const TREND_TOP_CATEGORIES = 5

/** `YYYY-MM` with a real month. */
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

/** Query-string booleans: only the literal `true` / `false` are accepted. */
const QueryBoolean = () =>
  applyDecorators(
    IsOptional(),
    Transform(({ value }: { value: unknown }) =>
      value === 'true' ? true : value === 'false' ? false : value,
    ),
    IsBoolean(),
  )

const QueryInt = (min: number, max: number) =>
  applyDecorators(
    IsOptional(),
    Type(() => Number),
    IsInt(),
    Min(min),
    Max(max),
  )

/** Filters shared by both spending endpoints. */
class SpendingFiltersQueryDto {
  @ApiPropertyOptional({
    type: String,
    pattern: MONTH_PATTERN.source,
    example: '2026-10',
    description:
      'Calendar month (YYYY-MM). Default: the current month in Europe/Paris when it has data (in the account filtered on, if any), else the month the data stops in.',
  })
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: '$property must be YYYY-MM' })
  month?: string

  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description:
      'Counts one-off (exceptional) expenses in every figure. Default: they are left out.',
  })
  @QueryBoolean()
  includeOneOffs?: boolean

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Only this account. Default: every account.',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string
}

export class SpendingByCategoryQueryDto extends SpendingFiltersQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: AVERAGE_MONTHS_MAX,
    default: AVERAGE_MONTHS_DEFAULT,
    description:
      'Full months before `month` that the averages cover (months before the first transaction are left out).',
  })
  @QueryInt(1, AVERAGE_MONTHS_MAX)
  averageMonths?: number
}

export class SpendingTrendQueryDto extends SpendingFiltersQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: TREND_MONTHS_MAX,
    default: TREND_MONTHS_DEFAULT,
    description: 'Months shown, ending with `month` (included).',
  })
  @QueryInt(1, TREND_MONTHS_MAX)
  months?: number

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Only this category (one series). Cannot be combined with `uncategorized`.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string

  @ApiPropertyOptional({
    type: Boolean,
    description:
      '`true`: only expenses without a category (one series). Cannot be combined with `categoryId`.',
  })
  @QueryBoolean()
  uncategorized?: boolean
}

const SPENT_DOC =
  'Positive integer cents: expenses minus the refunds filed in the same category. Negative when refunds exceed expenses.'

export class CategorySpendingDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Null for the bucket of expenses without a category.',
  })
  categoryId!: string | null

  @ApiProperty({ type: String, nullable: true })
  slug!: string | null

  @ApiProperty({ type: String, nullable: true })
  name!: string | null

  @ApiProperty({ type: String, nullable: true, example: '#d97706' })
  color!: string | null

  @ApiProperty({ type: 'integer', description: SPENT_DOC })
  spentCents!: number

  @ApiProperty({
    type: Number,
    description: 'Part of the month’s total (0 to 1); 0 when the total is 0.',
  })
  share!: number

  @ApiProperty({ type: 'integer' })
  transactionCount!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Spent the month before, over its same first days while the month is partial.',
  })
  previousSpentCents!: number

  @ApiProperty({
    type: 'integer',
    description: '`spentCents` - `previousSpentCents` (positive = spent more).',
  })
  deltaCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Average monthly spending over the average window (months without spending count as 0), over the same first days of each month while the month is partial. Null without history.',
  })
  averageCents!: number | null

  @ApiProperty({
    type: Boolean,
    description:
      'The month is partial and has no expense in this category yet, while the compared days had some: not paid yet rather than saved, so the drop is not a saving.',
  })
  notYetThisMonth!: boolean

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Budget target of the category for the month, positive integer cents. Null without a budget (and for the uncategorized bucket).',
  })
  targetCents!: number | null

  @ApiProperty({
    type: 'integer',
    description:
      'Recurring costs of the category (confirmed subscriptions and fixed costs) still expected later in the month, positive integer cents: not paid yet, so never counted as spent nor as a saving. 0 unless the month is partial.',
  })
  expectedCents!: number
}

export class SpendingByCategoryDto {
  @ApiProperty({ type: String, example: '2026-10' })
  month!: string

  @ApiProperty({ type: String, example: '2026-09' })
  previousMonth!: string

  @ApiProperty({
    type: MonthPeriodDto,
    description:
      'How far the month’s data goes (in the account filtered on, if any) and what it is compared with.',
  })
  period!: MonthPeriodDto

  @ApiProperty({ type: Boolean })
  includeOneOffs!: boolean

  @ApiProperty({
    type: 'integer',
    description:
      'Months the averages actually cover: `averageMonths` asked, fewer when the history starts later.',
  })
  averageMonths!: number

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'First month of the average window; null without history.',
  })
  averageFrom!: string | null

  @ApiProperty({ type: 'integer', description: 'Spent in the month.' })
  totalCents!: number

  @ApiProperty({ type: 'integer' })
  transactionCount!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Spent the month before, over its same first days while the month is partial.',
  })
  previousTotalCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Average monthly spending, over the same first days of each month while the month is partial.',
  })
  averageTotalCents!: number | null

  @ApiProperty({
    type: 'integer',
    description:
      'One-off spending in the month: part of `totalCents` when `includeOneOffs`, left out of it otherwise.',
  })
  oneOffCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Sum of the categories’ `expectedCents`: recurring costs still expected later in the month, left out of `totalCents`.',
  })
  expectedCents!: number

  @ApiProperty({
    type: [CategorySpendingDto],
    description:
      'Categories with expenses this month or the month before (its same first days while the month is partial; this month only when it has no data yet), or with recurring costs still expected this month, biggest spending first.',
  })
  categories!: CategorySpendingDto[]
}

export const TREND_SERIES_TYPES = [
  'category',
  'uncategorized',
  'other',
] as const
export type TrendSeriesType = (typeof TREND_SERIES_TYPES)[number]

export class SpendingTrendSeriesDto {
  @ApiProperty({
    type: String,
    description:
      'Stable key: the category id, `uncategorized` or `other` (the remaining categories).',
  })
  key!: string

  @ApiProperty({
    enum: TREND_SERIES_TYPES,
    enumName: 'SpendingTrendSeriesType',
  })
  type!: TrendSeriesType

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  categoryId!: string | null

  @ApiProperty({ type: String, nullable: true })
  slug!: string | null

  @ApiProperty({ type: String, nullable: true })
  name!: string | null

  @ApiProperty({ type: String, nullable: true })
  color!: string | null

  @ApiProperty({
    type: 'integer',
    isArray: true,
    description: `One value per month of \`months\`. ${SPENT_DOC}`,
  })
  valuesCents!: number[]

  @ApiProperty({ type: 'integer', description: 'Sum of `valuesCents`.' })
  totalCents!: number
}

export class SpendingTrendDto {
  @ApiProperty({
    type: [String],
    example: ['2026-09', '2026-10'],
    description: 'Months shown, oldest first.',
  })
  months!: string[]

  @ApiProperty({ type: Boolean })
  includeOneOffs!: boolean

  @ApiProperty({
    type: [SpendingTrendSeriesDto],
    description:
      'Top categories by spending over the period, then `other`; a single series when filtered by category.',
  })
  series!: SpendingTrendSeriesDto[]

  @ApiProperty({
    type: 'integer',
    isArray: true,
    description: 'Spent per month, every series together.',
  })
  totalsCents!: number[]

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Average of `totalsCents` over the complete months shown (the current month and months before the first transaction are left out). Null when there is none.',
  })
  averageCents!: number | null

  @ApiProperty({ type: 'integer', description: 'Months in that average.' })
  averageMonths!: number
}
