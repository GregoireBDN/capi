import { applyDecorators } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator'
import { fitsNumeric } from '#/common/decimal'
import {
  POSITION_STATEMENT_SOURCES,
  type PositionStatementSource,
  SECURITY_PRICE_SOURCES,
  type SecurityPriceSource,
} from '#/database/schema/domain-enums'
import { isValidIsin, normalizeIsin } from '../isin'

/** Most lines one statement may hold. */
export const STATEMENT_LINES_MAX = 100
const NAME_MAX = 200

@ValidatorConstraint({ name: 'isin' })
class IsinConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isValidIsin(value)
  }
  defaultMessage() {
    return '$property must be a valid ISIN (12 characters, check digit)'
  }
}

/** An ISIN, normalized (upper case, no spaces) then checked. */
export const Isin = () =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? normalizeIsin(value) : value,
    ),
    IsString(),
    Validate(IsinConstraint),
  )

@ValidatorConstraint({ name: 'quantity' })
class QuantityConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return (
      typeof value === 'string' &&
      fitsNumeric(value, 20, 18) &&
      /[1-9]/.test(value)
    )
  }
  defaultMessage() {
    return '$property must be a positive decimal (at most 18 decimals), e.g. "12.5"'
  }
}

@ValidatorConstraint({ name: 'eurPrice' })
class EurPriceConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && fitsNumeric(value, 26, 12)
  }
  defaultMessage() {
    return '$property must be a decimal in euros (at most 12 decimals), e.g. "498.32"'
  }
}

@ValidatorConstraint({ name: 'positiveEurPrice' })
class PositiveEurPriceConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return (
      typeof value === 'string' &&
      fitsNumeric(value, 26, 12) &&
      /[1-9]/.test(value)
    )
  }
  defaultMessage() {
    return '$property must be a positive decimal in euros, e.g. "498.32"'
  }
}

const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )

const CashCents = () =>
  applyDecorators(IsInt(), Min(0), Max(Number.MAX_SAFE_INTEGER))

const QUANTITY_DOC = {
  type: String,
  example: '48',
  description: 'Exact decimal string (never a float), > 0.',
} as const
const UNIT_COST_DOC = {
  type: String,
  nullable: true,
  example: '412.515',
  description: 'PRU (average cost per unit) in euros, exact decimal string.',
} as const

/** One line of a statement, as the broker prints it. */
export class StatementLineInputDto {
  @ApiProperty({ type: String, example: 'ZZ00MSCIWD03' })
  @Isin()
  isin!: string

  @ApiPropertyOptional({
    type: String,
    maxLength: NAME_MAX,
    description: 'Required for a security the app does not know yet.',
  })
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(NAME_MAX)
  name?: string

  @ApiProperty(QUANTITY_DOC)
  @Validate(QuantityConstraint)
  quantity!: string

  @ApiPropertyOptional(UNIT_COST_DOC)
  @IsOptional()
  @Validate(EurPriceConstraint)
  unitCostEur?: string | null

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '498.32',
    description:
      "The statement's price of the day in euros, stored as that day's `statement` price (a manual price of the day is kept).",
  })
  @IsOptional()
  @Validate(PositiveEurPriceConstraint)
  priceEur?: string | null
}

/** A whole statement: every line held on the day, and the cash. */
export class PutStatementDto {
  @ApiProperty({ type: [StatementLineInputDto], maxItems: STATEMENT_LINES_MAX })
  @IsArray()
  @ArrayMaxSize(STATEMENT_LINES_MAX)
  @ValidateNested({ each: true })
  @Type(() => StatementLineInputDto)
  lines!: StatementLineInputDto[]

  @ApiProperty({ type: 'integer', minimum: 0, description: '« Liquidités ».' })
  @CashCents()
  cashCents!: number
}

/** A line typed by hand (as of today). */
export class UpsertLineDto {
  @ApiPropertyOptional({ type: String, maxLength: NAME_MAX })
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(NAME_MAX)
  name?: string

  @ApiProperty(QUANTITY_DOC)
  @Validate(QuantityConstraint)
  quantity!: string

  @ApiPropertyOptional(UNIT_COST_DOC)
  @IsOptional()
  @Validate(EurPriceConstraint)
  unitCostEur?: string | null
}

export class SetCashDto {
  @ApiProperty({ type: 'integer', minimum: 0 })
  @CashCents()
  cashCents!: number
}

export class SetSecurityPriceDto {
  @ApiProperty({ type: String, example: '498.32' })
  @Validate(PositiveEurPriceConstraint)
  priceEur!: string
}

export class SecurityDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  isin!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: String, nullable: true })
  ticker!: string | null
}

export class PositionLineDto {
  @ApiProperty({ type: String, format: 'uuid' })
  securityId!: string

  @ApiProperty({ type: String })
  isin!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: String, nullable: true })
  ticker!: string | null

  @ApiProperty({ type: String, description: 'Exact decimal string.' })
  quantity!: string

  @ApiProperty({ type: String, nullable: true })
  unitCostEur!: string | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'quantity × PRU, half to even.',
  })
  costCents!: number | null

  @ApiProperty({ type: String, nullable: true })
  priceEur!: string | null

  @ApiProperty({ type: String, format: 'date', nullable: true })
  priceDay!: string | null

  @ApiProperty({ enum: SECURITY_PRICE_SOURCES, nullable: true })
  priceSource!: SecurityPriceSource | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'quantity × price, half to even; null without a price.',
  })
  valueCents!: number | null

  @ApiProperty({ type: 'integer', nullable: true })
  gainCents!: number | null

  @ApiProperty({
    type: Boolean,
    description: "The price is older than the statement's day.",
  })
  priceOlderThanStatement!: boolean
}

export class PositionTotalsDto {
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Lines plus cash; null while a line has no price.',
  })
  valueCents!: number | null

  @ApiProperty({ type: 'integer', description: 'The priced lines plus cash.' })
  pricedValueCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Cost of the lines with a PRU and a price.',
  })
  costCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Their value minus their cost.',
  })
  gainCents!: number

  @ApiProperty({ type: 'integer', minimum: 0 })
  withoutPriceCount!: number

  @ApiProperty({ type: 'integer', minimum: 0 })
  withoutCostCount!: number
}

export class StatementSummaryDto {
  @ApiProperty({ type: String, format: 'date' })
  asOf!: string

  @ApiProperty({ enum: POSITION_STATEMENT_SOURCES })
  source!: PositionStatementSource

  @ApiProperty({ type: 'integer', minimum: 0 })
  lineCount!: number

  @ApiProperty({ type: 'integer' })
  cashCents!: number
}

/** What a PEA holds today (ADR 0006), and its statements. */
export class PositionsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description: 'The day of the statement in force; null without lines.',
  })
  asOf!: string | null

  @ApiProperty({ type: 'integer' })
  cashCents!: number

  @ApiProperty({ type: [PositionLineDto] })
  lines!: PositionLineDto[]

  @ApiProperty({ type: PositionTotalsDto })
  totals!: PositionTotalsDto

  @ApiProperty({
    type: [StatementSummaryDto],
    description: 'Newest first.',
  })
  statements!: StatementSummaryDto[]
}

export const PREVIEW_LINE_STATUSES = [
  'new',
  'changed',
  'removed',
  'unchanged',
] as const
export type PreviewLineStatus = (typeof PREVIEW_LINE_STATUSES)[number]

export class PreviewLineDto {
  @ApiProperty({ type: String })
  isin!: string

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null for an unknown security sent without a name.',
  })
  name!: string | null

  @ApiProperty({ enum: PREVIEW_LINE_STATUSES })
  status!: PreviewLineStatus

  @ApiProperty({ type: String, nullable: true })
  quantityBefore!: string | null

  @ApiProperty({ type: String, nullable: true })
  quantityAfter!: string | null

  @ApiProperty({ type: String, nullable: true })
  unitCostBefore!: string | null

  @ApiProperty({ type: String, nullable: true })
  unitCostAfter!: string | null

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The price the line is valued at on the day, after.',
  })
  priceEur!: string | null

  @ApiProperty({
    type: Boolean,
    description: 'The statement price sent would not replace a manual one.',
  })
  priceKept!: boolean
}

/** What a statement would change (MCP `sync_security_positions`). Saves nothing. */
export class StatementPreviewDto {
  @ApiProperty({ type: String, format: 'date' })
  asOf!: string

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description:
      'The statement compared with: the one of that day, else the latest before it.',
  })
  comparedWith!: string | null

  @ApiProperty({ type: [PreviewLineDto] })
  lines!: PreviewLineDto[]

  @ApiProperty({ type: 'integer', nullable: true })
  cashBeforeCents!: number | null

  @ApiProperty({ type: 'integer' })
  cashAfterCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: "The account's value that day before (stored), if any.",
  })
  valueBeforeCents!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'From the lines after; null while a line has no price.',
  })
  valueAfterCents!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'A typed value of that day, which keeps its day (ADR 0006 § 5).',
  })
  typedValueCents!: number | null

  @ApiProperty({
    type: [String],
    description: 'ISINs the app does not know that came without a name.',
  })
  unknownWithoutName!: string[]

  @ApiProperty({
    type: Boolean,
    description: 'Writing it would change nothing.',
  })
  unchanged!: boolean
}
