import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator'
import {
  CATEGORY_ICON_DOC,
  type CategoryIcon,
} from '#/categories/category-icons'
import { MonthPeriodDto } from '#/coverage/dto/period.dto'
import { MONTH_PATTERN } from '#/dashboard/calendar'
import { MonthFlowDto } from '#/dashboard/dto/dashboard.dto'
import {
  ReviewBudgetDto,
  ReviewMissingAccountDto,
} from '#/dashboard/dto/review.dto'
import { ACCOUNT_TYPES, type AccountType } from '#/database/schema/domain-enums'
import {
  INCOME_LINE_STATUSES,
  type IncomeLineStatus,
} from '#/budgets/dto/budget.dto'

/** The steps of the review, in order. */
export const MONTH_CLOSE_STEPS = [
  'imports',
  'review_queue',
  'recurring',
  'budget',
  'savings',
  'investments',
  'close',
] as const
export type MonthCloseStep = (typeof MONTH_CLOSE_STEPS)[number]

/** Steps the owner marks as seen by hand. */
export const ACKNOWLEDGEABLE_STEPS = ['recurring', 'budget', 'savings'] as const
export type AcknowledgeableStep = (typeof ACKNOWLEDGEABLE_STEPS)[number]

export const MONTH_CLOSE_NOTES_MAX = 4000

/** One-off transactions listed in the report, largest first. */
export const REPORT_ONE_OFFS = 5

export const REPORT_CATEGORY_KINDS = ['income', 'expense'] as const
export type ReportCategoryKind = (typeof REPORT_CATEGORY_KINDS)[number]

export const REPORT_CHANGE_FIELDS = [
  'income',
  'expense',
  'net',
  'net_worth',
  'category',
] as const
export type ReportChangeField = (typeof REPORT_CHANGE_FIELDS)[number]

/* ==========================================================================
 * REQUESTS
 * ========================================================================= */

export class MonthParamDto {
  @ApiProperty({
    type: String,
    pattern: MONTH_PATTERN.source,
    example: '2026-10',
  })
  @Matches(MONTH_PATTERN, { message: '$property must be YYYY-MM' })
  month!: string
}

export class UpdateMonthCloseDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MONTH_CLOSE_NOTES_MAX,
    description: 'Notes of the month; empty or null clears them.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MONTH_CLOSE_NOTES_MAX)
  notes?: string | null

  @ApiPropertyOptional({
    enum: ACKNOWLEDGEABLE_STEPS,
    enumName: 'AcknowledgeableStep',
    isArray: true,
    description: 'Steps marked as seen; replaces the current list.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ACKNOWLEDGEABLE_STEPS, { each: true })
  acknowledged?: AcknowledgeableStep[]
}

export class CloseMonthDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MONTH_CLOSE_NOTES_MAX,
    description: 'Notes saved with the close (kept as they are when absent).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MONTH_CLOSE_NOTES_MAX)
  notes?: string | null
}

/* ==========================================================================
 * REPORT
 * ========================================================================= */

export class ReportCategoryDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Null for the uncategorized transactions.',
  })
  categoryId!: string | null

  @ApiProperty({ type: String, nullable: true })
  name!: string | null

  @ApiProperty({ type: String, nullable: true })
  color!: string | null

  @ApiProperty({
    ...CATEGORY_ICON_DOC,
    description:
      'Icon shown with the category (a Lucide icon name). A report frozen before icons existed takes the category’s current one.',
  })
  icon!: CategoryIcon | null

  @ApiProperty({ enum: REPORT_CATEGORY_KINDS, enumName: 'ReportCategoryKind' })
  kind!: ReportCategoryKind

  @ApiProperty({
    type: 'integer',
    description:
      'Cents: spent for `expense` (positive when money went out), received for `income`.',
  })
  amountCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Same figure for the month before.',
  })
  previousAmountCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Monthly budget target of an expense category, planned income of an income category; null when none.',
  })
  targetCents!: number | null
}

/** The month's plan against what happened (#315). */
export class ReportPlanDto {
  @ApiProperty({ type: 'integer', description: 'Sum of the planned income.' })
  plannedIncomeCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Income received in the planned categories.',
  })
  receivedIncomeCents!: number

  @ApiProperty({ type: 'integer', description: 'Sum of the expense targets.' })
  budgetedExpensesCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Planned income − budgeted expenses; null without planned income.',
  })
  plannedSavingsCents!: number | null

  @ApiProperty({
    type: 'integer',
    description:
      'Saved in the month: income − expenses (transfers excluded), the flow’s net.',
  })
  actualSavingsCents!: number
}

export class ReportOneOffDto {
  @ApiProperty({ type: String, format: 'uuid' })
  transactionId!: string

  @ApiProperty({ type: String, format: 'date' })
  date!: string

  @ApiProperty({ type: String })
  label!: string

  @ApiProperty({ type: 'integer', description: 'Signed cents.' })
  amountCents!: number

  @ApiProperty({ type: String, nullable: true })
  categoryName!: string | null
}

/**
 * The month's figures, live while the month is open and frozen in
 * `month_closes.report` when it is closed.
 */
export class MonthReportDto {
  @ApiProperty({ type: String, example: '2026-10' })
  month!: string

  @ApiProperty({
    type: MonthFlowDto,
    description: 'Income, expenses and net of the month (transfers excluded).',
  })
  flow!: MonthFlowDto

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Net worth at the month end, in cents.',
  })
  netWorthCents!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Monthly savings target, in cents.',
  })
  savingsTargetCents!: number | null

  @ApiProperty({
    type: [ReportCategoryDto],
    description:
      'Totals per category and kind (income, expense; transfers never), largest first, budgeted categories included even without spending.',
  })
  categories!: ReportCategoryDto[]

  @ApiProperty({
    type: [ReportOneOffDto],
    description: `Up to ${REPORT_ONE_OFFS} one-off transactions, largest first.`,
  })
  oneOffs!: ReportOneOffDto[]

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null

  @ApiProperty({
    type: ReportPlanDto,
    nullable: true,
    description:
      'Planned vs received income and planned vs actual savings; null in a report frozen before planned income existed.',
  })
  plan!: ReportPlanDto | null
}

export class ReportChangeDto {
  @ApiProperty({ enum: REPORT_CHANGE_FIELDS, enumName: 'ReportChangeField' })
  field!: ReportChangeField

  @ApiProperty({
    enum: REPORT_CATEGORY_KINDS,
    enumName: 'ReportCategoryKind',
    nullable: true,
    description: 'For `category`: income or expense.',
  })
  kind!: ReportCategoryKind | null

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  categoryId!: string | null

  @ApiProperty({ type: String, nullable: true, description: 'Category name.' })
  name!: string | null

  @ApiProperty({ type: 'integer', nullable: true })
  closedCents!: number | null

  @ApiProperty({ type: 'integer', nullable: true })
  currentCents!: number | null
}

/* ==========================================================================
 * STEPS
 * ========================================================================= */

export class MonthCloseStepDto {
  @ApiProperty({ enum: MONTH_CLOSE_STEPS, enumName: 'MonthCloseStep' })
  key!: MonthCloseStep

  @ApiProperty({ type: Boolean })
  done!: boolean
}

export class CloseImportAccountDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ enum: ACCOUNT_TYPES, enumName: 'AccountType' })
  type!: AccountType

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description: 'Latest day with imported data (manual expenses excluded).',
  })
  lastDate!: string | null

  @ApiProperty({
    type: Boolean,
    description:
      'Data reaches the month end, or an import was committed after it.',
  })
  upToDate!: boolean

  @ApiProperty({
    type: 'integer',
    description:
      'Days of the month after `lastDate` (the whole month when there is no data); 0 when up to date.',
  })
  missingDays!: number
}

export class CloseContinuityGapDto {
  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: String })
  accountName!: string

  @ApiProperty({
    type: String,
    format: 'date',
    description: 'Last day whose balance follows.',
  })
  fromDate!: string

  @ApiProperty({
    type: String,
    format: 'date',
    description: 'First day whose balance does not follow.',
  })
  toDate!: string

  @ApiProperty({
    type: 'integer',
    description:
      'Bank balance − expected balance: the amount of the missing rows.',
  })
  differenceCents!: number
}

export class CloseImportsDto {
  @ApiProperty({ type: [CloseImportAccountDto] })
  accounts!: CloseImportAccountDto[]

  @ApiProperty({
    type: [CloseContinuityGapDto],
    description:
      'Days of the month where the bank running balance does not follow from the previous one and the rows booked since.',
  })
  gaps!: CloseContinuityGapDto[]
}

export class CloseReviewQueueDto {
  @ApiProperty({
    type: 'integer',
    description: 'Transactions of the month waiting in the review queue.',
  })
  count!: number
}

export class ClosePriceChangeDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: 'integer', nullable: true })
  previousAmountCents!: number | null

  @ApiProperty({ type: 'integer' })
  latestAmountCents!: number

  @ApiProperty({ type: 'integer', description: 'New − previous price.' })
  priceChangeCents!: number

  @ApiProperty({ type: String, format: 'date' })
  priceChangedOn!: string
}

export class CloseChargedAfterEndDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({
    type: String,
    format: 'date',
    description: 'Cancellation date of the item.',
  })
  endedOn!: string

  @ApiProperty({
    type: String,
    format: 'date',
    description: 'Latest charge of the month booked on or after `endedOn`.',
  })
  chargedOn!: string

  @ApiProperty({ type: 'integer', description: 'Positive cents.' })
  amountCents!: number
}

export class CloseRecurringDto {
  @ApiProperty({
    type: 'integer',
    description: 'Detected recurring items still to confirm or dismiss.',
  })
  suggestedCount!: number

  @ApiProperty({
    type: [ClosePriceChangeDto],
    description:
      'Confirmed items whose price changed during the month, cancelled ones left out from their end date.',
  })
  priceChanges!: ClosePriceChangeDto[]

  @ApiProperty({
    type: [CloseChargedAfterEndDto],
    description:
      'Cancelled items charged during the month on or after their end date (a cancellation that did not go through).',
  })
  chargedAfterEnd!: CloseChargedAfterEndDto[]
}

export class CloseGoalDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: 'integer' })
  targetCents!: number

  @ApiProperty({ type: 'integer' })
  currentCents!: number

  @ApiProperty({ type: Number })
  progressRatio!: number

  @ApiProperty({ type: Boolean })
  reached!: boolean

  @ApiProperty({ type: String, format: 'date', nullable: true })
  targetDate!: string | null
}

export class CloseSavingsDto {
  @ApiProperty({
    type: 'integer',
    description: 'Saved in the month: income + expenses (transfers excluded).',
  })
  netCents!: number

  @ApiProperty({ type: 'integer', nullable: true })
  targetCents!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: '`netCents` − `targetCents`; null without a target.',
  })
  gapCents!: number | null

  @ApiProperty({ type: [CloseGoalDto], description: 'Active goals.' })
  goals!: CloseGoalDto[]
}

export class CloseIncomeLineDto {
  @ApiProperty({ type: String, format: 'uuid' })
  categoryId!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: String, nullable: true })
  color!: string | null

  @ApiProperty(CATEGORY_ICON_DOC)
  icon!: CategoryIcon | null

  @ApiProperty({ type: 'integer' })
  plannedCents!: number

  @ApiProperty({ type: 'integer', nullable: true })
  receivedCents!: number | null

  @ApiProperty({ enum: INCOME_LINE_STATUSES, enumName: 'IncomeLineStatus' })
  status!: IncomeLineStatus
}

export class CloseIncomeDto {
  @ApiProperty({ type: 'integer' })
  plannedCents!: number

  @ApiProperty({ type: 'integer', nullable: true })
  receivedCents!: number | null

  @ApiProperty({
    type: [CloseIncomeLineDto],
    description:
      'Planned income lines that did not come in as planned (`missing` or `short`).',
  })
  shortfalls!: CloseIncomeLineDto[]
}

export class CloseInvestmentsDto {
  @ApiProperty({
    type: [ReviewMissingAccountDto],
    description:
      'Investment accounts without a value on or after the month end.',
  })
  accounts!: ReviewMissingAccountDto[]
}

export class MonthCloseDto {
  @ApiProperty({ type: String, example: '2026-10' })
  month!: string

  @ApiProperty({ type: String, example: '2026-11' })
  nextMonth!: string

  @ApiProperty({ type: MonthPeriodDto })
  period!: MonthPeriodDto

  @ApiProperty({
    type: Boolean,
    description:
      'The month is over (before the current Europe/Paris month), so it can be closed.',
  })
  closable!: boolean

  @ApiProperty({ enum: ['open', 'closed'] })
  status!: 'open' | 'closed'

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt!: string | null

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null

  @ApiProperty({
    enum: ACKNOWLEDGEABLE_STEPS,
    enumName: 'AcknowledgeableStep',
    isArray: true,
  })
  acknowledged!: AcknowledgeableStep[]

  @ApiProperty({ type: [MonthCloseStepDto], description: 'In order.' })
  steps!: MonthCloseStepDto[]

  @ApiProperty({ type: CloseImportsDto })
  imports!: CloseImportsDto

  @ApiProperty({ type: CloseReviewQueueDto })
  reviewQueue!: CloseReviewQueueDto

  @ApiProperty({ type: CloseRecurringDto })
  recurring!: CloseRecurringDto

  @ApiProperty({ type: ReviewBudgetDto })
  budget!: ReviewBudgetDto

  @ApiProperty({
    type: CloseIncomeDto,
    description: 'Planned income vs received (#315).',
  })
  income!: CloseIncomeDto

  @ApiProperty({ type: CloseSavingsDto })
  savings!: CloseSavingsDto

  @ApiProperty({ type: CloseInvestmentsDto })
  investments!: CloseInvestmentsDto

  @ApiProperty({
    type: MonthReportDto,
    description: 'The report as the data stands now.',
  })
  report!: MonthReportDto

  @ApiProperty({
    type: MonthReportDto,
    nullable: true,
    description: 'The report frozen when the month was closed.',
  })
  closedReport!: MonthReportDto | null

  @ApiProperty({
    type: [ReportChangeDto],
    description:
      'Figures that changed since the close (empty while the month is open).',
  })
  changes!: ReportChangeDto[]
}

/* ==========================================================================
 * LIST
 * ========================================================================= */

export class ClosedMonthDto {
  @ApiProperty({ type: String, example: '2026-10' })
  month!: string

  @ApiProperty({ type: String, format: 'date-time' })
  closedAt!: string
}

export class MonthCloseListDto {
  @ApiProperty({
    type: [ClosedMonthDto],
    description: 'Every closed month, oldest first.',
  })
  closed!: ClosedMonthDto[]
}
