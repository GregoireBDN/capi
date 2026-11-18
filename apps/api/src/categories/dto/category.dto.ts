import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator'
import {
  TRANSACTION_KINDS,
  type TransactionKind,
} from '#/database/schema/domain-enums'
import {
  CATEGORY_ICON_DOC,
  CATEGORY_ICONS,
  type CategoryIcon,
} from '../category-icons'

const NAME_MAX = 100

/** Lowercase `#rrggbb`, the format of the default categories. */
const COLOR_PATTERN = /^#[0-9a-f]{6}$/

const KIND_DOC = {
  enum: TRANSACTION_KINDS,
  enumName: 'TransactionKind',
  description: 'Category group: the kind given to its transactions.',
} as const

const NAME_DOC = {
  type: String,
  minLength: 1,
  maxLength: NAME_MAX,
  description:
    'Display name, unique among all categories (ignoring case and accents).',
} as const

const COLOR_DOC = {
  type: String,
  pattern: COLOR_PATTERN.source,
  example: '#2a78d6',
  description: 'Lowercase `#rrggbb` hex colour.',
} as const

/** Trims strings and lowercases colours before validation. */
const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
const lowercase = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )

/** Present and non-null when sent; may be omitted (PATCH semantics). */
const NotNullIfPresent = () =>
  ValidateIf((_object: object, value: unknown) => value !== undefined)

export class CategoryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({
    type: String,
    description:
      'Stable identifier referenced by seeds, rules and imports; generated from the name for new categories and never changed.',
  })
  slug!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty(KIND_DOC)
  kind!: TransactionKind

  @ApiProperty({ type: String, nullable: true, example: '#d97706' })
  color!: string | null

  @ApiProperty(CATEGORY_ICON_DOC)
  icon!: CategoryIcon | null

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Set when archived: hidden from pickers, history and statistics kept.',
  })
  archivedAt!: Date | null

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date
}

export class CreateCategoryDto {
  @ApiProperty(NAME_DOC)
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(NAME_MAX)
  name!: string

  @ApiProperty(KIND_DOC)
  @IsIn(TRANSACTION_KINDS)
  kind!: TransactionKind

  @ApiProperty(COLOR_DOC)
  @lowercase()
  @IsString()
  @Matches(COLOR_PATTERN)
  color!: string

  @ApiPropertyOptional(CATEGORY_ICON_DOC)
  @IsOptional()
  @IsIn(CATEGORY_ICONS)
  icon?: CategoryIcon | null
}

/** Partial update: omitted fields are left unchanged. */
export class UpdateCategoryDto {
  @ApiPropertyOptional(NAME_DOC)
  @NotNullIfPresent()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(NAME_MAX)
  name?: string

  @ApiPropertyOptional({
    ...KIND_DOC,
    description:
      'New group. Refused (409) while transactions or budgets use the category.',
  })
  @NotNullIfPresent()
  @IsIn(TRANSACTION_KINDS)
  kind?: TransactionKind

  @ApiPropertyOptional(COLOR_DOC)
  @NotNullIfPresent()
  @lowercase()
  @IsString()
  @Matches(COLOR_PATTERN)
  color?: string

  @ApiPropertyOptional({
    ...CATEGORY_ICON_DOC,
    description: `${CATEGORY_ICON_DOC.description} \`null\` removes it.`,
  })
  @IsOptional()
  @IsIn(CATEGORY_ICONS)
  icon?: CategoryIcon | null

  @ApiPropertyOptional({
    type: Boolean,
    description: '`true` archives the category, `false` restores it.',
  })
  @NotNullIfPresent()
  @IsBoolean()
  archived?: boolean
}

export class CategoryUsageDto {
  @ApiProperty({ type: 'integer' })
  transactions!: number

  @ApiProperty({ type: 'integer', description: 'Categorization rules.' })
  rules!: number

  @ApiProperty({
    type: 'integer',
    description: 'Budget rows (targets, past and present).',
  })
  budgets!: number

  @ApiProperty({ type: 'integer', description: 'Recurring items.' })
  recurringItems!: number
}

export class DeleteCategoryQueryDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Category of the same kind that receives the transactions, rules, budgets and recurring items. Required when the category is in use.',
  })
  @IsOptional()
  @IsUUID()
  reassignTo?: string
}
