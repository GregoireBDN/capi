import { applyDecorators } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { MONTH_PATTERN } from '../months'

/** Highest monthly target accepted: 10 000 000 € (fits a Postgres `integer`). */
export const BUDGET_TARGET_MAX_CENTS = 1_000_000_000
export const BUDGET_NOTE_MAX = 500
export const BUDGET_HISTORY_MONTHS_DEFAULT = 6
export const BUDGET_HISTORY_MONTHS_MAX = 24
export const BUDGET_SUGGEST_MONTHS_DEFAULT = 3
export const BUDGET_SUGGEST_MONTHS_MAX = 12
/** Unbudgeted categories listed by name in `GET /budgets`. */
export const UNBUDGETED_TOP_COUNT = 5

/**
 * Share of the target used: `ok` below 80 %, `warning` from 80 % to 100 %
 * included, `over` above 100 %.
 */
export const BUDGET_STATUSES = ['ok', 'warning', 'over'] as const
export type BudgetStatus = (typeof BUDGET_STATUSES)[number]

const STATUS_DOC = {
  enum: BUDGET_STATUSES,
  enumName: 'BudgetStatus',
  description:
    '`ok` below 80 % of the target, `warning` from 80 % to 100 % included, `over` above 100 %.',
} as const

const MONTH_DOC = {
  type: String,
  pattern: MONTH_PATTERN.source,
  example: '2026-11',
} as const

/** Optional `YYYY-MM` query or body field. */
const OptionalMonth = () =>
  applyDecorators(
    IsOptional(),
    Matches(MONTH_PATTERN, { message: '$property must be YYYY-MM' }),
  )

/** Optional integer query field within bounds. */
const OptionalCount = (max: number) =>
  applyDecorators(
    IsOptional(),
    Type(() => Number),
    IsInt(),
    Min(1),
    Max(max),
  )

// ---------------------------------------------------------------------------
// Queries and bodies
// ---------------------------------------------------------------------------

export class BudgetMonthQueryDto {
  @ApiPropertyOptional({
    ...MONTH_DOC,
    description:
      'Calendar month (YYYY-MM). Default: the current month in Europe/Paris.',
  })
  @OptionalMonth()
  month?: string
}

export class BudgetHistoryQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: BUDGET_HISTORY_MONTHS_MAX,
    default: BUDGET_HISTORY_MONTHS_DEFAULT,
    description: 'Number of months, ending with `month`.',
  })
  @OptionalCount(BUDGET_HISTORY_MONTHS_MAX)
  months?: number

  @ApiPropertyOptional({
    ...MONTH_DOC,
    description:
      'Last month of the window (YYYY-MM). Default: the current month in Europe/Paris.',
  })
  @OptionalMonth()
  month?: string
}

export class BudgetSuggestQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: BUDGET_SUGGEST_MONTHS_MAX,
    default: BUDGET_SUGGEST_MONTHS_DEFAULT,
    description: 'Number of full months averaged, before `month`.',
  })
  @OptionalCount(BUDGET_SUGGEST_MONTHS_MAX)
  months?: number

  @ApiPropertyOptional({
    ...MONTH_DOC,
    description:
      'Month the targets are for (YYYY-MM); the averaged months are the ones before it. Default: the current month in Europe/Paris.',
  })
  @OptionalMonth()
  month?: string
}

export class BudgetRemoveQueryDto {
  @ApiPropertyOptional({
    ...MONTH_DOC,
    description:
      'First month without a budget (YYYY-MM). Default: the current month in Europe/Paris. Earlier months keep their target.',
  })
  @OptionalMonth()
  from?: string
}

export class UpsertBudgetDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: BUDGET_TARGET_MAX_CENTS,
    example: 40_000,
    description: 'Monthly target in integer cents.',
  })
  @IsInt()
  @Min(1)
  @Max(BUDGET_TARGET_MAX_CENTS)
  monthlyTargetCents!: number

  @ApiPropertyOptional({
    ...MONTH_DOC,
    description:
      'First month the target applies to (YYYY-MM). Default: the current month in Europe/Paris. Earlier months keep their target; a target already set for a later month still takes over from that month.',
  })
  @OptionalMonth()
  effectiveFrom?: string

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: BUDGET_NOTE_MAX,
    description:
      'Free note. Omitted: kept from the target in effect; null or empty: removed.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsString()
  @MaxLength(BUDGET_NOTE_MAX)
  note?: string | null
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export class BudgetDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  categoryId!: string

  @ApiProperty({
    ...MONTH_DOC,
    description: 'First month the target applies to.',
  })
  effectiveFrom!: string

  @ApiProperty({ type: 'integer', description: 'Monthly target in cents.' })
  monthlyTargetCents!: number

  @ApiProperty({ type: String, nullable: true })
  note!: string | null
}

/** Category fields shared by the budget responses. */
class BudgetCategoryFields {
  @ApiProperty({ type: String, format: 'uuid' })
  categoryId!: string

  @ApiProperty({ type: String })
  slug!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: String, nullable: true, example: '#d97706' })
  color!: string | null
}

export class BudgetLineDto extends BudgetCategoryFields {
  @ApiProperty({ type: 'integer', description: 'Monthly target in cents.' })
  targetCents!: number

  @ApiProperty({
    ...MONTH_DOC,
    description: 'Month the target in effect was set from.',
  })
  effectiveFrom!: string

  @ApiProperty({ type: String, nullable: true })
  note!: string | null

  @ApiProperty({
    type: 'integer',
    description:
      'Spent in the month, in positive cents: `expense` transactions of the category (refunds filed in it reduce it). Transfers never count.',
  })
  spentCents!: number

  @ApiProperty({
    type: 'integer',
    description: '`spentCents` without the one-off transactions.',
  })
  spentExcludingOneOffsCents!: number

  @ApiProperty({
    type: 'integer',
    description: '`targetCents` − `spentCents` (negative when over).',
  })
  remainingCents!: number

  @ApiProperty({
    type: Number,
    example: 85.3,
    description: 'Spent / target × 100, one decimal.',
  })
  percentUsed!: number

  @ApiProperty(STATUS_DOC)
  status!: BudgetStatus
}

export class BudgetTotalsDto {
  @ApiProperty({
    type: 'integer',
    description: 'Sum of the targets of the month.',
  })
  targetCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Spent in the budgeted categories.',
  })
  spentCents!: number

  @ApiProperty({ type: 'integer' })
  spentExcludingOneOffsCents!: number

  @ApiProperty({ type: 'integer' })
  remainingCents!: number

  @ApiProperty({ type: Number, description: 'Zero when nothing is budgeted.' })
  percentUsed!: number

  @ApiProperty({ ...STATUS_DOC, nullable: true })
  status!: BudgetStatus | null

  @ApiProperty({ type: 'integer' })
  budgetCount!: number

  @ApiProperty({ type: 'integer', description: 'Categories over target.' })
  overCount!: number

  @ApiProperty({
    type: 'integer',
    description: 'Categories between 80 % and 100 % of target.',
  })
  warningCount!: number
}

export class UnbudgetedCategoryDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Null for expenses without a category.',
  })
  categoryId!: string | null

  @ApiProperty({ type: String, nullable: true })
  slug!: string | null

  @ApiProperty({ type: String, nullable: true })
  name!: string | null

  @ApiProperty({ type: String, nullable: true })
  color!: string | null

  @ApiProperty({
    type: Boolean,
    description: 'Whether a budget can be set (an `expense` category).',
  })
  budgetable!: boolean

  @ApiProperty({ type: 'integer', description: 'Spent, in positive cents.' })
  spentCents!: number
}

export class UnbudgetedSpendingDto {
  @ApiProperty({
    type: 'integer',
    description:
      'Expenses of the month outside the budgeted categories (uncategorized included), in positive cents.',
  })
  totalCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Groups (categories, or "uncategorized") with spending.',
  })
  categoryCount!: number

  @ApiProperty({
    type: [UnbudgetedCategoryDto],
    description: `The ${UNBUDGETED_TOP_COUNT} biggest, most spent first.`,
  })
  top!: UnbudgetedCategoryDto[]
}

export class BudgetMonthDto {
  @ApiProperty(MONTH_DOC)
  month!: string

  @ApiProperty({
    type: [BudgetLineDto],
    description: 'Budgeted categories, highest share used first.',
  })
  items!: BudgetLineDto[]

  @ApiProperty({ type: BudgetTotalsDto })
  totals!: BudgetTotalsDto

  @ApiProperty({ type: UnbudgetedSpendingDto })
  unbudgeted!: UnbudgetedSpendingDto
}

export class BudgetHistoryCellDto {
  @ApiProperty(MONTH_DOC)
  month!: string

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Target in effect, null when not budgeted that month.',
  })
  targetCents!: number | null

  @ApiProperty({ type: 'integer' })
  spentCents!: number

  @ApiProperty({ ...STATUS_DOC, nullable: true })
  status!: BudgetStatus | null
}

export class BudgetHistoryCategoryDto extends BudgetCategoryFields {
  @ApiProperty({ type: [BudgetHistoryCellDto], description: 'Oldest first.' })
  months!: BudgetHistoryCellDto[]
}

export class BudgetHistoryTotalDto {
  @ApiProperty(MONTH_DOC)
  month!: string

  @ApiProperty({ type: 'integer', description: 'Sum of the targets.' })
  targetCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Spent in the categories budgeted that month.',
  })
  spentCents!: number

  @ApiProperty({ ...STATUS_DOC, nullable: true })
  status!: BudgetStatus | null
}

export class BudgetHistoryDto {
  @ApiProperty({ type: [String], description: 'Oldest first.' })
  months!: string[]

  @ApiProperty({
    type: [BudgetHistoryCategoryDto],
    description:
      'Categories budgeted in at least one month of the window, by name.',
  })
  categories!: BudgetHistoryCategoryDto[]

  @ApiProperty({ type: [BudgetHistoryTotalDto], description: 'Oldest first.' })
  totals!: BudgetHistoryTotalDto[]
}

export class BudgetSuggestionDto extends BudgetCategoryFields {
  @ApiProperty({
    type: 'integer',
    description: 'Average rounded to the euro, in cents.',
  })
  suggestedCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Exact monthly average, in cents.',
  })
  averageCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Target in effect for `month`, if any.',
  })
  currentTargetCents!: number | null
}

export class BudgetSuggestionsDto {
  @ApiProperty({
    ...MONTH_DOC,
    description: 'Month the targets are for.',
  })
  month!: string

  @ApiProperty({
    type: [String],
    description: 'Averaged months, oldest first.',
  })
  months!: string[]

  @ApiProperty({
    type: 'integer',
    description:
      'Averaged months that have transactions: the divisor of the average, so a short history is not diluted.',
  })
  monthsWithData!: number

  @ApiProperty({
    type: [BudgetSuggestionDto],
    description: 'Expense categories with spending, biggest first.',
  })
  items!: BudgetSuggestionDto[]
}
