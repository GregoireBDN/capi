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
import {
  ACCOUNT_TYPES,
  type AccountType,
  SNAPSHOT_SOURCES,
  type SnapshotSource,
} from '#/database/schema/domain-enums'
import { RealisedGainsDto, UnknownCostDto } from '#/crypto/dto/crypto.dto'
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

  @ApiProperty({
    enum: SNAPSHOT_SOURCES,
    enumName: 'SnapshotSource',
    description:
      '`typed` (a statement, a value typed by hand or through the MCP) or `computed` (a crypto account’s daily close, #366: read only).',
  })
  source!: SnapshotSource
}

/** Today's live value of a crypto account (#366): shown, never stored. */
export class LiveValueDto {
  @ApiProperty({ type: String, format: 'date' })
  date!: string

  @ApiProperty(VALUE_DOC)
  valueCents!: number

  @ApiProperty(CONTRIBUTIONS_DOC)
  contributionsCents!: number | null
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
      'What was invested as of the latest value (#370, one rule for every page): a crypto account’s coins at their cost plus its euros waiting (#373); any other account, its latest typed point (base or contributions typed on a value) plus the transfers linked after it.',
  })
  contributionsCents!: number | null

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description:
      'The typed point it counts from (the base’s day or the value’s), else the latest value’s day.',
  })
  contributionsDate!: string | null

  @ApiProperty({
    enum: ['links', 'typed', 'base', 'coins'],
    enumName: 'ContributionsSource',
    nullable: true,
    description:
      "`base`: the account's invested base (#360) plus the transfers linked after its day; `typed`: the contributions typed on a value plus the transfers linked after it; `links`: the transfers linked to the account alone (#296); `coins`: a crypto account's coins at their cost, carried across transfers between the owner's accounts (#373).",
  })
  contributionsSource!: 'links' | 'typed' | 'base' | 'coins' | null

  @ApiProperty({
    type: 'integer',
    description:
      'Transfers linked after the typed point (or all of them); for crypto, the arrivals linked to a departure of another account.',
  })
  linkedTransfersCount!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Crypto (#373): assets held with coins of unknown cost (`unknownCost`), left out of the gain; otherwise linked transfers of unknown amount.',
  })
  unknownCostCount!: number

  @ApiProperty({
    type: [UnknownCostDto],
    description:
      'Crypto (#373): the coins of unknown cost per asset (« 0,1 BTC sans coût connu »); empty otherwise.',
  })
  unknownCost!: UnknownCostDto[]

  @ApiProperty({
    type: RealisedGainsDto,
    nullable: true,
    description:
      'Crypto (#373): the gains realised by its sales into euros; null otherwise.',
  })
  realised!: RealisedGainsDto | null

  @ApiProperty({
    type: 'integer',
    description:
      'Net amount of the linked transfers booked after the latest value (not in it yet; left out of the gain).',
  })
  linkedAfterValueCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      '`valueCents - contributionsCents`; crypto: the value of the coins of known cost (and euros) minus it.',
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

export class InvestedBaseDto {
  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description: 'Invested in the account up to `on`, in cents.',
  })
  amountCents!: number

  @ApiProperty({ type: String, format: 'date' })
  on!: string
}

export class SetInvestedBaseDto {
  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description: 'What was invested in the account up to `on`, in cents.',
  })
  @Cents(0)
  amountCents!: number

  @ApiProperty({
    type: String,
    format: 'date',
    description:
      'Last day the amount covers (`YYYY-MM-DD`, not after today in Europe/Paris): the transfers linked to the account after it add on top.',
    example: '2026-10-31',
  })
  @CalendarDate()
  on!: string
}

/** What an account's invested amount is, with or without a new base. */
export class InvestedFiguresDto {
  @ApiProperty({ type: InvestedBaseDto, nullable: true })
  investedBase!: InvestedBaseDto | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Latest value; null without one.',
  })
  valueCents!: number | null

  @ApiProperty({ type: String, format: 'date', nullable: true })
  valueDate!: string | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Invested amount (null when unknown).',
  })
  contributionsCents!: number | null

  @ApiProperty({
    enum: ['links', 'typed', 'base', 'coins'],
    enumName: 'ContributionsSource',
    nullable: true,
  })
  contributionsSource!: 'links' | 'typed' | 'base' | 'coins' | null

  @ApiProperty({ type: 'integer', nullable: true })
  gainCents!: number | null

  @ApiProperty({ type: Number, nullable: true })
  returnRate!: number | null

  @ApiProperty({
    type: 'integer',
    description: 'Transfers linked after the base.',
  })
  linkedTransfersCount!: number

  @ApiProperty({
    type: 'integer',
    description: 'Linked transfers of unknown amount, left out.',
  })
  unknownCostCount!: number
}

export class InvestedBasePreviewDto {
  @ApiProperty({ type: InvestedFiguresDto })
  current!: InvestedFiguresDto

  @ApiProperty({
    type: InvestedFiguresDto,
    description: 'The same figures once the base is saved.',
  })
  next!: InvestedFiguresDto
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
      'Every stored snapshot, oldest first, with the contributions typed on it (a crypto account: its daily closes before `live`).',
  })
  snapshots!: SnapshotDto[]

  @ApiProperty({
    type: LiveValueDto,
    nullable: true,
    description:
      'Crypto accounts (#366): today’s live value at the last known prices, never stored, the last point of the history. The figures (value, changes, gain) count it.',
  })
  live!: LiveValueDto | null

  @ApiProperty({
    type: [ContributionPointDto],
    description:
      'What was invested at each snapshot (same order as `snapshots`, then `live` when there is one), by the same rule as `contributionsCents`.',
  })
  contributionsHistory!: ContributionPointDto[]

  @ApiProperty({
    type: InvestedBaseDto,
    nullable: true,
    description:
      'PEA, life insurance, employee savings (#360): the invested base typed by the owner.',
  })
  investedBase!: InvestedBaseDto | null
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
