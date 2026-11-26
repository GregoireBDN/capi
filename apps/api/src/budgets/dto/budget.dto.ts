import { applyDecorators } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import {
  CATEGORY_ICON_DOC,
  type CategoryIcon,
} from '#/categories/category-icons'
import { MonthPeriodDto } from '#/coverage/dto/period.dto'
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

/**
 * Where a planned income line stands (#315): `pending` (nothing to say yet:
 * empty month, or not due by the data's last day), `received` (the planned
 * amount came in), `short` (less came in), `missing` (nothing came in
 * although due), `so_far` (partial month without a known date: « reçu à ce
 * jour »).
 */
export const INCOME_LINE_STATUSES = [
  'pending',
  'received',
  'short',
  'missing',
  'so_far',
] as const
export type IncomeLineStatus = (typeof INCOME_LINE_STATUSES)[number]

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
      'Calendar month (YYYY-MM). Default: the current month in Europe/Paris when it has data, else the month the data stops in.',
  })
  @OptionalMonth()
  month?: string
}

export class EnvelopesQueryDto {
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

export class IncomeSuggestQueryDto {
  @ApiPropertyOptional({
    ...MONTH_DOC,
    description:
      'Month the plan is for (YYYY-MM). Default: the current month in Europe/Paris.',
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
    description:
      'Monthly target in integer cents: a spending target for an expense category, the planned income for an income category.',
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

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Envelope: follow the category during the month on the dashboard (« Budget »). Omitted: kept from the target in effect. Expense categories only: true is refused for an income category.',
  })
  @IsOptional()
  @IsBoolean()
  tracked?: boolean
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

  @ApiProperty({
    type: Boolean,
    description: 'Envelope followed during the month.',
  })
  tracked!: boolean
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

  @ApiProperty(CATEGORY_ICON_DOC)
  icon!: CategoryIcon | null
}

export class BudgetPrepaidDto {
  @ApiProperty({ type: String, format: 'uuid' })
  recurringItemId!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({
    type: 'integer',
    description: 'Paid this month for the term, in positive cents.',
  })
  amountCents!: number

  @ApiProperty({ type: 'integer', example: 24 })
  termMonths!: number
}

export class BudgetEnvelopePaidDto {
  @ApiProperty({ type: String, format: 'uuid' })
  envelopeId!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: String, nullable: true })
  icon!: string | null

  @ApiProperty({ type: String, nullable: true })
  color!: string | null

  @ApiProperty({
    type: 'integer',
    description:
      'What the envelope paid in the category this month (« + 95 € par Lisbonne »).',
  })
  paidCents!: number
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
    type: Boolean,
    description: 'Envelope followed during the month.',
  })
  tracked!: boolean

  @ApiProperty({
    type: 'integer',
    description:
      'Spent in the month, in positive cents: `expense` transactions of the category (refunds filed in it reduce it). Transfers never count.',
  })
  spentCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      '`spentCents` without the one-off transactions (nor the prepaid subscription payments).',
  })
  spentExcludingOneOffsCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'What was paid in the category, before what others owe or repaid on it (#359): `spentCents` is the owner’s part (« 400 € sur 800 € payés »). Equal to `spentCents` when nothing is shared.',
  })
  grossSpentCents!: number

  @ApiProperty({
    type: [BudgetPrepaidDto],
    description:
      'Prepaid subscriptions paid this month in the category (#314), in `spentCents`: « dont 180,00 € prépayés pour 24 mois ».',
  })
  prepaid!: BudgetPrepaidDto[]

  @ApiProperty({
    type: 'integer',
    description:
      'What envelopes paid of `spentCents` (#429, ADR 0008): it adds to the month’s budget of the category, so the budget itself paid `spentCents` − this.',
  })
  envelopePaidCents!: number

  @ApiProperty({ type: [BudgetEnvelopePaidDto] })
  envelopes!: BudgetEnvelopePaidDto[]

  @ApiProperty({
    type: 'integer',
    description:
      '`targetCents` + `envelopePaidCents` − `spentCents` (negative when over).',
  })
  remainingCents!: number

  @ApiProperty({
    type: Number,
    example: 85.3,
    description:
      'What the budget paid itself (spent − paid by envelopes) / target × 100, one decimal.',
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

  @ApiProperty({
    type: 'integer',
    description:
      'What envelopes paid in the budgeted categories (in `spentCents`; « 715 € par une enveloppe »).',
  })
  envelopePaidCents!: number

  @ApiProperty({
    type: 'integer',
    description: '`targetCents` + `envelopePaidCents` − `spentCents`.',
  })
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

  @ApiProperty(CATEGORY_ICON_DOC)
  icon!: CategoryIcon | null

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

export class BudgetIncomeLineDto extends BudgetCategoryFields {
  @ApiProperty({
    type: 'integer',
    description: 'Planned income of the month, in cents.',
  })
  plannedCents!: number

  @ApiProperty({
    ...MONTH_DOC,
    description: 'Month the planned amount in effect was set from.',
  })
  effectiveFrom!: string

  @ApiProperty({ type: String, nullable: true })
  note!: string | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Received in the month (so far for a partial one), in cents: `income` lines of the category (splits count). Transfers never count. Null for a month without data.',
  })
  receivedCents!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Partial month only, for a category with a confirmed recurring credit whose day is known: what should have come in by the data’s last day. Null otherwise.',
  })
  expectedByNowCents!: number | null

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description:
      'Partial or empty month: next day a recurring credit of the category is expected after the data’s last day.',
  })
  expectedOn!: string | null

  @ApiProperty({
    enum: INCOME_LINE_STATUSES,
    enumName: 'IncomeLineStatus',
    description:
      '`pending`: nothing to say yet; `received`: the plan came in; `short`: less came in; `missing`: nothing came in although due; `so_far`: partial month without a known date.',
  })
  status!: IncomeLineStatus
}

export class BudgetIncomeTotalsDto {
  @ApiProperty({ type: 'integer', description: 'Sum of the planned income.' })
  plannedCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Received in the planned categories; null for a month without data.',
  })
  receivedCents!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Income received outside the planned categories (uncategorized included); null for a month without data.',
  })
  unplannedCents!: number | null

  @ApiProperty({ type: 'integer' })
  lineCount!: number
}

export class BudgetIncomeDto {
  @ApiProperty({
    type: [BudgetIncomeLineDto],
    description: 'Planned income lines, largest first.',
  })
  items!: BudgetIncomeLineDto[]

  @ApiProperty({ type: BudgetIncomeTotalsDto })
  totals!: BudgetIncomeTotalsDto
}

export class BudgetPlanDto {
  @ApiProperty({ type: 'integer' })
  plannedIncomeCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Sum of the expense targets of the month.',
  })
  budgetedExpensesCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      '« À épargner »: planned income − budgeted expenses (negative when the plan spends more than it brings in). Null without planned income.',
  })
  toSaveCents!: number | null
}

export class BudgetMonthDto {
  @ApiProperty(MONTH_DOC)
  month!: string

  @ApiProperty({
    type: MonthPeriodDto,
    description: 'How far the month’s data goes.',
  })
  period!: MonthPeriodDto

  @ApiProperty({
    type: [BudgetLineDto],
    description: 'Budgeted expense categories, highest share used first.',
  })
  items!: BudgetLineDto[]

  @ApiProperty({
    type: BudgetTotalsDto,
    description: 'Totals of the expense targets.',
  })
  totals!: BudgetTotalsDto

  @ApiProperty({ type: UnbudgetedSpendingDto })
  unbudgeted!: UnbudgetedSpendingDto

  @ApiProperty({
    type: BudgetIncomeDto,
    description: 'Planned income (« Revenus prévus ») vs received.',
  })
  income!: BudgetIncomeDto

  @ApiProperty({
    type: BudgetPlanDto,
    description: 'The balance of the plan: what it leaves to save.',
  })
  plan!: BudgetPlanDto
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

  @ApiProperty({
    type: 'integer',
    description: 'Sum of the planned income.',
  })
  plannedIncomeCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Income received in the planned categories.',
  })
  receivedIncomeCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Planned income − expense targets; null without planned income.',
  })
  plannedSavingsCents!: number | null
}

export class BudgetHistoryIncomeCellDto {
  @ApiProperty(MONTH_DOC)
  month!: string

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Planned income in effect, null when none that month.',
  })
  plannedCents!: number | null

  @ApiProperty({ type: 'integer' })
  receivedCents!: number
}

export class BudgetHistoryIncomeCategoryDto extends BudgetCategoryFields {
  @ApiProperty({
    type: [BudgetHistoryIncomeCellDto],
    description: 'Oldest first.',
  })
  months!: BudgetHistoryIncomeCellDto[]
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

  @ApiProperty({
    type: [BudgetHistoryIncomeCategoryDto],
    description:
      'Income categories planned in at least one month of the window, by name.',
  })
  income!: BudgetHistoryIncomeCategoryDto[]

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

export class IncomeSuggestionDto extends BudgetCategoryFields {
  @ApiProperty({
    type: 'integer',
    description:
      'Planned income suggested for the month, in cents rounded to the euro.',
  })
  suggestedCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Planned income in effect for `month`, if any.',
  })
  currentPlannedCents!: number | null

  @ApiProperty({
    type: [String],
    description:
      'Where the amount comes from: the recurring credits’ names, or empty when it is the plan of the month before.',
  })
  sources!: string[]
}

export class IncomeSuggestionsDto {
  @ApiProperty({ ...MONTH_DOC, description: 'Month the plan is for.' })
  month!: string

  @ApiProperty({
    type: [IncomeSuggestionDto],
    description:
      'The plan in effect (carried over from the month before) for the income categories that have one, else the confirmed recurring credits of the category at their typical amount (monthly equivalent); largest first.',
  })
  items!: IncomeSuggestionDto[]
}

export class EnvelopeDto extends BudgetCategoryFields {
  @ApiProperty({ type: 'integer', description: 'Monthly target in cents.' })
  targetCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Spent during the month (so far for the current one), in positive cents: imported and manual `expense` transactions of the category (refunds reduce it).',
  })
  spentCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Part of `spentCents` noted by hand, not imported yet.',
  })
  manualCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Part of `spentCents` paid by envelopes (#429): it adds to the target, so remaining, pace and status read `spentCents` − this.',
  })
  envelopePaidCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      '`targetCents` + `envelopePaidCents` − `spentCents` (negative when over).',
  })
  remainingCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Share of the target matching the days elapsed: target × day / days in the month, rounded. The whole target for a past month, 0 for a future one.',
  })
  paceCents!: number

  @ApiProperty({
    type: Boolean,
    description:
      'Spent more than `paceCents` during the current month: ahead of its pace. Always false for another month.',
  })
  aheadOfPace!: boolean

  @ApiProperty(STATUS_DOC)
  status!: BudgetStatus
}

export class EnvelopesDto {
  @ApiProperty({
    ...MONTH_DOC,
    description:
      'The month asked for, by default the current month in Europe/Paris.',
  })
  month!: string

  @ApiProperty({
    type: Boolean,
    description:
      'Whether `month` is the current month in Europe/Paris: only then is the pace a day of the month and expenses noted from the envelopes.',
  })
  current!: boolean

  @ApiProperty({
    type: String,
    format: 'date',
    description: 'Today in Europe/Paris.',
  })
  today!: string

  @ApiProperty({ type: 'integer', example: 13 })
  dayOfMonth!: number

  @ApiProperty({ type: 'integer', example: 30 })
  daysInMonth!: number

  @ApiProperty({
    type: [EnvelopeDto],
    description:
      'Budget lines followed during the month, in name order. Empty when none is.',
  })
  items!: EnvelopeDto[]
}
