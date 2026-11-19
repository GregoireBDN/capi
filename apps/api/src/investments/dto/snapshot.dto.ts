import { applyDecorators } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateNested,
  type ValidatorConstraintInterface,
  ValidatorConstraint,
} from 'class-validator'
import { ACCOUNT_TYPES, type AccountType } from '#/database/schema/domain-enums'
import { isCalendarDate } from '../calendar-date'

/** Most snapshots one bulk upsert may write. */
export const BULK_SNAPSHOTS_MAX = 500
const NOTE_MAX = 500

@ValidatorConstraint({ name: 'calendarDate' })
class CalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isCalendarDate(value)
  }
  defaultMessage() {
    return '$property must be an existing YYYY-MM-DD date'
  }
}

const CalendarDate = () =>
  applyDecorators(
    IsString(),
    Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '$property must be YYYY-MM-DD' }),
    Validate(CalendarDateConstraint),
  )

const Cents = (minimum?: number) =>
  applyDecorators(
    IsInt(),
    Min(minimum ?? -Number.MAX_SAFE_INTEGER),
    Max(Number.MAX_SAFE_INTEGER),
  )

/** Trims, and turns an empty string into `null` ("no note"). */
const trimToNull = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })

const VALUE_DOC = {
  type: 'integer',
  minimum: 0,
  description: 'Value of the account at the end of the day, in cents.',
} as const
const CONTRIBUTIONS_DOC = {
  type: 'integer',
  nullable: true,
  description:
    'Net contributions to date (deposits minus withdrawals) in cents, when known.',
} as const

export class SnapshotDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'date' })
  date!: string

  @ApiProperty(VALUE_DOC)
  valueCents!: number

  @ApiProperty(CONTRIBUTIONS_DOC)
  contributionsCents!: number | null

  @ApiProperty({ type: String, nullable: true })
  note!: string | null
}

/** Full replacement of the snapshot of a day: omitted fields become null. */
export class UpsertSnapshotDto {
  @ApiProperty(VALUE_DOC)
  @Cents(0)
  valueCents!: number

  @ApiPropertyOptional(CONTRIBUTIONS_DOC)
  @IsOptional()
  @Cents()
  contributionsCents?: number | null

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: NOTE_MAX })
  @IsOptional()
  @trimToNull()
  @IsString()
  @MaxLength(NOTE_MAX)
  note?: string | null
}

export class BulkSnapshotRowDto {
  @ApiProperty({ type: String, format: 'date', example: '2026-09-30' })
  @CalendarDate()
  date!: string

  @ApiProperty(VALUE_DOC)
  @Cents(0)
  valueCents!: number

  @ApiPropertyOptional({
    ...CONTRIBUTIONS_DOC,
    description: `${CONTRIBUTIONS_DOC.description} Omitted or null keeps the contributions already known for that day.`,
  })
  @IsOptional()
  @Cents()
  contributionsCents?: number | null
}

export class BulkSnapshotsDto {
  @ApiProperty({
    type: [BulkSnapshotRowDto],
    minItems: 1,
    maxItems: BULK_SNAPSHOTS_MAX,
    description: 'One row per day; a day may appear only once.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_SNAPSHOTS_MAX)
  @ValidateNested({ each: true })
  @Type(() => BulkSnapshotRowDto)
  rows!: BulkSnapshotRowDto[]
}

export class BulkSnapshotsResultDto {
  @ApiProperty({ type: 'integer', description: 'Days that had no snapshot.' })
  created!: number

  @ApiProperty({
    type: 'integer',
    description: 'Days whose snapshot was replaced.',
  })
  updated!: number
}

export class ValueChangeDto {
  @ApiProperty({
    type: String,
    format: 'date',
    description: 'Date of the snapshot the latest value is compared with.',
  })
  fromDate!: string

  @ApiProperty({ type: 'integer' })
  fromValueCents!: number

  @ApiProperty({ type: 'integer' })
  changeCents!: number

  @ApiProperty({
    type: Number,
    nullable: true,
    description: '`changeCents / fromValueCents`, null when that value is 0.',
  })
  changeRate!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Net contributions added between the two snapshots, null unless both carry contributions. `changeCents` minus this is the market gain over the period.',
  })
  contributionsChangeCents!: number | null
}

const TYPE_DOC = { enum: ACCOUNT_TYPES, enumName: 'AccountType' } as const

export class ContributionPointDto {
  @ApiProperty({ type: String, format: 'date' })
  date!: string

  @ApiProperty({ type: 'integer', nullable: true })
  contributionsCents!: number | null
}

/** Performance figures shared by the account detail and the summary rows. */
class PerformanceFiguresDto {
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Latest snapshot value; null without snapshots.',
  })
  valueCents!: number | null

  @ApiProperty({ type: String, format: 'date', nullable: true })
  valueDate!: string | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Latest known net contributions. When the latest snapshot has none, those of the latest snapshot that has them (see `contributionsDate`).',
  })
  contributionsCents!: number | null

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description:
      'Snapshot the contributions come from; earlier than `valueDate` when the latest snapshot has no contributions.',
  })
  contributionsDate!: string | null

  @ApiProperty({
    enum: ['links', 'typed'],
    enumName: 'ContributionsSource',
    nullable: true,
    description:
      '`links`: from the transfers linked to the account (#296), on top of the contributions typed on the last snapshot before the first of them; `typed`: typed on the snapshots (or, for crypto, the invested amounts of the holdings).',
  })
  contributionsSource!: 'links' | 'typed' | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Latest contributions typed on a snapshot when the linked transfers replace them and differ from them; null otherwise.',
  })
  typedContributionsCents!: number | null

  @ApiProperty({
    type: 'integer',
    description:
      'Transfers linked to the account (0 for crypto, whose contributions come from its holdings).',
  })
  linkedTransfersCount!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Net amount of the linked transfers booked after the latest value (not in it yet; left out of the gain).',
  })
  linkedAfterValueCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: '`valueCents - contributionsCents`.',
  })
  gainCents!: number | null

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Simple return `gainCents / contributionsCents` (e.g. 0.12), null when contributions are unknown or not positive.',
  })
  returnRate!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Days since the latest snapshot, today in Europe/Paris.',
  })
  daysSinceLatest!: number | null

  @ApiProperty({
    type: 'integer',
    description: 'Usual statement rhythm of the account type, in days.',
  })
  staleAfterDays!: number

  @ApiProperty({
    type: Boolean,
    description: '`daysSinceLatest > staleAfterDays`.',
  })
  stale!: boolean
}

export class AccountPerformanceDto extends PerformanceFiguresDto {
  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty(TYPE_DOC)
  type!: AccountType

  @ApiProperty({
    type: ValueChangeDto,
    nullable: true,
    description: 'Latest value compared with the snapshot before it.',
  })
  sincePrevious!: ValueChangeDto | null

  @ApiProperty({
    type: ValueChangeDto,
    nullable: true,
    description:
      'Latest value compared with the last snapshot on or before the same day one year earlier.',
  })
  sinceOneYear!: ValueChangeDto | null

  @ApiProperty({
    type: [SnapshotDto],
    description:
      'Every snapshot, oldest first, with the contributions typed on it.',
  })
  snapshots!: SnapshotDto[]

  @ApiProperty({
    type: [ContributionPointDto],
    description:
      'Net contributions at each snapshot (same order as `snapshots`): from the linked transfers when `contributionsSource` is `links`, else as typed.',
  })
  contributionsHistory!: ContributionPointDto[]
}

export class InvestmentAccountSummaryDto extends PerformanceFiguresDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty(TYPE_DOC)
  type!: AccountType

  @ApiProperty({ type: String, nullable: true })
  institution!: string | null
}

export class InvestmentsTotalsDto {
  @ApiProperty({
    type: 'integer',
    description: 'Sum of the latest values of the accounts that have one.',
  })
  valueCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Sum of the latest known contributions, over the accounts that have both a value and contributions; null when none has.',
  })
  contributionsCents!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Gain over the same accounts as `contributionsCents`.',
  })
  gainCents!: number | null

  @ApiProperty({ type: Number, nullable: true })
  returnRate!: number | null

  @ApiProperty({
    type: 'integer',
    description:
      'Accounts with a value but no known contributions, left out of the gain.',
  })
  withoutContributionsCount!: number

  @ApiProperty({ type: 'integer', description: 'Accounts with no snapshot.' })
  withoutValueCount!: number

  @ApiProperty({ type: 'integer' })
  staleCount!: number
}

export class InvestmentsSummaryDto {
  @ApiProperty({ type: InvestmentsTotalsDto })
  totals!: InvestmentsTotalsDto

  @ApiProperty({
    type: [InvestmentAccountSummaryDto],
    description: 'Non-archived investment accounts, by display order.',
  })
  accounts!: InvestmentAccountSummaryDto[]
}

export class InvestmentFlowAccountDto {
  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty(TYPE_DOC)
  type!: AccountType

  @ApiProperty({
    type: 'integer',
    description: 'Paid in (transfers to the account), positive cents.',
  })
  depositsCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Taken out (transfers from the account), positive cents.',
  })
  withdrawalsCents!: number

  @ApiProperty({ type: 'integer', description: 'Deposits minus withdrawals.' })
  netCents!: number

  @ApiProperty({ type: 'integer' })
  count!: number
}

export class InvestmentFlowMonthAccountDto {
  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: 'integer' })
  netCents!: number
}

export class InvestmentFlowMonthDto {
  @ApiProperty({ type: String, example: '2026-10' })
  month!: string

  @ApiProperty({ type: 'integer' })
  netCents!: number

  @ApiProperty({
    type: [InvestmentFlowMonthAccountDto],
    description: 'Accounts that received or gave money that month.',
  })
  accounts!: InvestmentFlowMonthAccountDto[]
}

export class InvestmentFlowsDto {
  @ApiProperty({ type: String, format: 'date' })
  from!: string

  @ApiProperty({ type: String, format: 'date' })
  to!: string

  @ApiProperty({ type: 'integer' })
  depositsCents!: number

  @ApiProperty({ type: 'integer' })
  withdrawalsCents!: number

  @ApiProperty({ type: 'integer' })
  netCents!: number

  @ApiProperty({
    type: [InvestmentFlowAccountDto],
    description:
      'Investment accounts with linked transfers in the period, most paid in first.',
  })
  accounts!: InvestmentFlowAccountDto[]

  @ApiProperty({
    type: [InvestmentFlowMonthDto],
    description: 'Months of the period with linked transfers, newest first.',
  })
  months!: InvestmentFlowMonthDto[]
}

export class InvestmentFlowsQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 120,
    default: 12,
    description: 'Calendar months covered, the current one included.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  months?: number
}
