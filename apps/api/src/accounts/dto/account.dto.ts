import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator'
import { ACCOUNT_TYPES, type AccountType } from '#/database/schema/domain-enums'

const NAME_MAX = 100
const INSTITUTION_MAX = 100
/** `accounts.position` is a Postgres `integer`. */
const POSITION_MAX = 2_147_483_647

const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )

/** Trims, and turns an empty string into `null` ("no institution"). */
const trimToNull = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })

/** Present and non-null when sent; may be omitted (PATCH semantics). */
const NotNullIfPresent = () =>
  ValidateIf((_object: object, value: unknown) => value !== undefined)

const TYPE_DOC = {
  enum: ACCOUNT_TYPES,
  enumName: 'AccountType',
  description:
    '`checking` and `savings` are transactional (fed by imports, balance from transactions); the others are investment accounts (balance from dated value snapshots).',
} as const

export class AccountDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty(TYPE_DOC)
  type!: AccountType

  @ApiProperty({ type: String, nullable: true })
  institution!: string | null

  @ApiProperty({
    type: 'integer',
    description: 'Display order in lists (ascending).',
  })
  position!: number

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Set when the account is archived (closed accounts are never deleted).',
  })
  archivedAt!: Date | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Current balance in cents. Transactional accounts: the most recent of the end-of-day running balance and the latest balance snapshot (the snapshot wins a tie), plus the transactions booked after that day; else the sum of all amounts. Investment accounts: latest value snapshot. Null when there is no data, or when the latest balances do not tell the end-of-day balance.',
  })
  balanceCents!: number | null

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description:
      'Calendar date the balance is known at (latest transaction or snapshot).',
  })
  balanceDate!: string | null

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date
}

export class ListAccountsQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description: 'Also return archived accounts.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  includeArchived?: boolean
}

export class CreateAccountDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: NAME_MAX })
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(NAME_MAX)
  name!: string

  @ApiProperty(TYPE_DOC)
  @IsIn(ACCOUNT_TYPES)
  type!: AccountType

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: INSTITUTION_MAX,
    example: 'CIC',
  })
  @IsOptional()
  @trimToNull()
  @IsString()
  @MaxLength(INSTITUTION_MAX)
  institution?: string | null
}

/**
 * Partial update: omitted fields are left unchanged. The type cannot change
 * (transactional and investment accounts are fed differently).
 */
export class UpdateAccountDto {
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: NAME_MAX })
  @NotNullIfPresent()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(NAME_MAX)
  name?: string

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: INSTITUTION_MAX,
  })
  @IsOptional()
  @trimToNull()
  @IsString()
  @MaxLength(INSTITUTION_MAX)
  institution?: string | null

  @ApiPropertyOptional({ type: 'integer', minimum: 0 })
  @NotNullIfPresent()
  @IsInt()
  @Min(0)
  @Max(POSITION_MAX)
  position?: number

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'true archives the account (kept with its history), false restores it.',
  })
  @NotNullIfPresent()
  @IsBoolean()
  archived?: boolean
}
