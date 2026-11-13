import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator'

/** Highest manual expense: 1 000 000 €. */
export const MANUAL_EXPENSE_MAX_CENTS = 100_000_000
export const MANUAL_LABEL_MAX = 255

/** Trims; an empty label is no label (null). */
const trimLabel = ({ value }: { value: unknown }) => {
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

export class CreateManualExpenseDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: MANUAL_EXPENSE_MAX_CENTS,
    example: 1250,
    description: 'Amount spent, positive integer cents.',
  })
  @IsInt()
  @Min(1)
  @Max(MANUAL_EXPENSE_MAX_CENTS)
  amountCents!: number

  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'An expense category.',
  })
  @IsUUID()
  categoryId!: string

  @ApiPropertyOptional({
    ...DATE_DOC,
    description: 'Day of the expense. Default: today in Europe/Paris.',
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
  @Transform(trimLabel)
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
}

/** Present and non-null when sent; may be omitted (PATCH semantics). */
const NotNullIfPresent = () =>
  ValidateIf((_object: object, value: unknown) => value !== undefined)

export class UpdateManualExpenseDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: MANUAL_EXPENSE_MAX_CENTS,
    description: 'Amount spent, positive integer cents.',
  })
  @NotNullIfPresent()
  @IsInt()
  @Min(1)
  @Max(MANUAL_EXPENSE_MAX_CENTS)
  amountCents?: number

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @NotNullIfPresent()
  @IsUUID()
  categoryId?: string

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
  @Transform(trimLabel)
  @IsString()
  @MaxLength(MANUAL_LABEL_MAX)
  label?: string | null

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @NotNullIfPresent()
  @IsUUID()
  accountId?: string
}
