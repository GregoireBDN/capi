import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  NotEquals,
  ValidateIf,
} from 'class-validator'
import {
  TRANSACTION_KINDS,
  type TransactionKind,
} from '#/database/schema/domain-enums'

/** Highest amount entered by hand: 1 000 000 €. */
export const MANUAL_AMOUNT_MAX_CENTS = 100_000_000
export const MANUAL_LABEL_MAX = 255
export const MANUAL_NOTE_MAX = 2000

/** Direction of the money: `out` of the account (negative) or `in`. */
export const MONEY_DIRECTIONS = ['out', 'in'] as const
export type MoneyDirection = (typeof MONEY_DIRECTIONS)[number]

/** Trims; an empty text is no text (null). */
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

const DATE_DOC = {
  type: String,
  format: 'date',
  example: '2026-11-13',
} as const

/** A `YYYY-MM-DD` calendar date that exists. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const KIND_DOC = {
  enum: TRANSACTION_KINDS,
  enumName: 'TransactionKind',
} as const

const DIRECTION_DOC = {
  enum: MONEY_DIRECTIONS,
  enumName: 'MoneyDirection',
} as const

/** Present and non-null when sent; may be omitted (PATCH semantics). */
const NotNullIfPresent = () =>
  ValidateIf((_object: object, value: unknown) => value !== undefined)

export class CreateManualTransactionDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: MANUAL_AMOUNT_MAX_CENTS,
    example: 1250,
    description: 'Amount, positive integer cents; `direction` gives the sign.',
  })
  @IsInt()
  @Min(1)
  @Max(MANUAL_AMOUNT_MAX_CENTS)
  amountCents!: number

  @ApiPropertyOptional({
    ...DIRECTION_DOC,
    description:
      'Money out of the account or in. Default: `in` for income, `out` otherwise.',
  })
  @IsOptional()
  @IsIn(MONEY_DIRECTIONS)
  direction?: MoneyDirection

  @ApiPropertyOptional({
    ...KIND_DOC,
    description:
      'Default: the kind of the category, else `expense`. `transfer` = move between own accounts, never income or expense.',
  })
  @IsOptional()
  @IsIn(TRANSACTION_KINDS)
  kind?: TransactionKind

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Category. Without one the transaction goes to the review queue and needs a label.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null

  @ApiPropertyOptional({
    ...DATE_DOC,
    description: 'Day of the transaction. Default: today in Europe/Paris.',
  })
  @IsOptional()
  @Matches(ISO_DATE, { message: '$property must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  bookingDate?: string

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MANUAL_LABEL_MAX,
    description: 'Free text. Default: the category name.',
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(MANUAL_LABEL_MAX)
  label?: string | null

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'A checking or savings account. Default: the first checking account.',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Exceptional, excluded from averages. Default: false.',
  })
  @IsOptional()
  @IsBoolean()
  isOneOff?: boolean

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MANUAL_NOTE_MAX,
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(MANUAL_NOTE_MAX)
  note?: string | null
}

export class UpdateManualTransactionDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: MANUAL_AMOUNT_MAX_CENTS,
    description: 'Amount, positive integer cents. The sign is kept.',
  })
  @NotNullIfPresent()
  @IsInt()
  @Min(1)
  @Max(MANUAL_AMOUNT_MAX_CENTS)
  amountCents?: number

  @ApiPropertyOptional({
    ...DIRECTION_DOC,
    description: 'Money out of the account or in. Omitted: unchanged.',
  })
  @NotNullIfPresent()
  @IsIn(MONEY_DIRECTIONS)
  direction?: MoneyDirection

  @ApiPropertyOptional(KIND_DOC)
  @NotNullIfPresent()
  @IsIn(TRANSACTION_KINDS)
  kind?: TransactionKind

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Null: no category (back to the review queue). Sets the category’s kind unless `kind` is sent.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null

  @ApiPropertyOptional(DATE_DOC)
  @NotNullIfPresent()
  @Matches(ISO_DATE, { message: '$property must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  bookingDate?: string

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MANUAL_LABEL_MAX,
    description: 'Null or empty: back to the category name.',
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(MANUAL_LABEL_MAX)
  label?: string | null

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @NotNullIfPresent()
  @IsUUID()
  accountId?: string

  @ApiPropertyOptional({ type: Boolean })
  @NotNullIfPresent()
  @IsBoolean()
  isOneOff?: boolean

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MANUAL_NOTE_MAX,
    description: 'Null or empty: no note.',
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(MANUAL_NOTE_MAX)
  note?: string | null
}

/**
 * Hand correction of an imported row's amount or date (#74). The bank values
 * are kept (`originalAmountCents`, `originalBookingDate`) and keep feeding
 * balances, continuity checks and the dedupe of later imports.
 */
export class CorrectTransactionDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: -MANUAL_AMOUNT_MAX_CENTS,
    maximum: MANUAL_AMOUNT_MAX_CENTS,
    description: 'Corrected signed amount, integer cents (never 0).',
  })
  @NotNullIfPresent()
  @IsInt()
  @NotEquals(0)
  @Min(-MANUAL_AMOUNT_MAX_CENTS)
  @Max(MANUAL_AMOUNT_MAX_CENTS)
  amountCents?: number

  @ApiPropertyOptional({
    ...DATE_DOC,
    description: 'Corrected booking date.',
  })
  @NotNullIfPresent()
  @Matches(ISO_DATE, { message: '$property must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  bookingDate?: string
}
