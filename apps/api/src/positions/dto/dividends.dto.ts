import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator'
import { CalendarDate } from '#/investments/calendar-date'
import { isValidIsin, normalizeIsin } from '../isin'

@ValidatorConstraint({ name: 'dividendIsin' })
class IsinConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isValidIsin(value)
  }
  defaultMessage() {
    return '$property must be a valid ISIN (12 characters, check digit)'
  }
}

/** A dividend typed by the owner (#414): its day, its net amount, its line. */
export class SaveDividendDto {
  @ApiProperty({
    type: String,
    format: 'date',
    description: 'The day it was paid, not in the future.',
  })
  @CalendarDate()
  paidOn!: string

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    description: 'Net amount received, in cents.',
  })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountCents!: number

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'ZZ00MSCIWD03',
    description:
      'The security that paid it: one the app knows (a line of the account, now or before). Null or omitted: not said.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeIsin(value) : value,
  )
  @IsString()
  @Validate(IsinConstraint)
  isin?: string | null
}

export class DividendDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'date' })
  paidOn!: string

  @ApiProperty({ type: 'integer' })
  amountCents!: number

  @ApiProperty({ type: String, nullable: true })
  isin!: string | null

  @ApiProperty({ type: String, nullable: true })
  securityName!: string | null
}

/** A compte-titres' dividends (#414), information only. */
export class DividendsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: 'integer', description: 'Every dividend recorded.' })
  totalCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Those paid in the last twelve months: after the same day a year ago (today in Europe/Paris).',
  })
  last12MonthsCents!: number

  @ApiProperty({ type: [DividendDto], description: 'Newest first.' })
  dividends!: DividendDto[]
}
