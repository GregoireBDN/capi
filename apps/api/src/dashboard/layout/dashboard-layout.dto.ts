import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator'
import {
  DASHBOARD_WIDGET_TYPES,
  type DashboardWidgetType,
} from '#/database/schema/domain-enums'

/** Days ahead the « Prochains prélèvements » element looks. */
export const UPCOMING_DAYS = [7, 30] as const
/** Which side of the money owed the « Argent dû » element shows. */
export const OWED_SIDES = ['both', 'owed_to_me', 'i_owe'] as const
export type OwedSide = (typeof OWED_SIDES)[number]
/**
 * How « Soldes » orders its accounts: the owner's order (its chosen
 * accounts' order, else the accounts'), or by balance, largest or smallest
 * first.
 */
export const BALANCES_SORTS = ['order', 'desc', 'asc'] as const
export type BalancesSort = (typeof BALANCES_SORTS)[number]

/** At most this many accounts or envelopes chosen per element. */
export const DASHBOARD_CHOICES_MAX = 100

/**
 * An element's own scalars. Each type takes only its own: `upcomingDays`
 * on `upcoming_debits`, `owedSide` on `owed`, `balancesSort` on `balances`.
 */
export class DashboardWidgetSettingsDto {
  @ApiPropertyOptional({
    enum: UPCOMING_DAYS,
    type: Number,
    description: '`upcoming_debits`: the next 7 or 30 days.',
  })
  @IsOptional()
  @IsIn(UPCOMING_DAYS)
  upcomingDays?: (typeof UPCOMING_DAYS)[number]

  @ApiPropertyOptional({
    enum: OWED_SIDES,
    enumName: 'DashboardOwedSide',
    description: '`owed`: both sides, what I am owed or what I owe.',
  })
  @IsOptional()
  @IsIn(OWED_SIDES)
  owedSide?: OwedSide

  @ApiPropertyOptional({
    enum: BALANCES_SORTS,
    enumName: 'DashboardBalancesSort',
    description:
      '`balances`: the owner’s order, or by balance (`desc` largest first, `asc` smallest first).',
  })
  @IsOptional()
  @IsIn(BALANCES_SORTS)
  balancesSort?: BalancesSort
}

export class DashboardWidgetDto {
  @ApiProperty({
    enum: DASHBOARD_WIDGET_TYPES,
    enumName: 'DashboardWidgetType',
  })
  @IsIn(DASHBOARD_WIDGET_TYPES)
  type!: DashboardWidgetType

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  hidden!: boolean

  @ApiProperty({
    type: [String],
    format: 'uuid',
    nullable: true,
    description:
      'The accounts shown, in no order; null = all of them. Only on the elements that show accounts (`forecast`, `net_worth`, `balances`, `upcoming_debits`, `investments`); an empty list = every chosen account was deleted.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(DASHBOARD_CHOICES_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  accountIds!: string[] | null

  @ApiProperty({
    type: [String],
    format: 'uuid',
    nullable: true,
    description: '`envelopes` only: the envelopes shown; null = all of them.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(DASHBOARD_CHOICES_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  envelopeIds!: string[] | null

  @ApiProperty({
    type: [String],
    format: 'uuid',
    nullable: true,
    required: false,
    description:
      '`tracked_budgets` only: the expense categories shown, in their order; null = the budget lines flagged « suivre pendant le mois ».',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(DASHBOARD_CHOICES_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  categoryIds?: string[] | null

  @ApiProperty({ type: DashboardWidgetSettingsDto })
  @ValidateNested()
  @Type(() => DashboardWidgetSettingsDto)
  settings!: DashboardWidgetSettingsDto
}

export class DashboardLayoutDto {
  @ApiProperty({
    type: Boolean,
    description:
      'False while the owner has saved nothing: `widgets` is then the default layout (today’s dashboard).',
  })
  custom!: boolean

  @ApiProperty({
    type: [DashboardWidgetDto],
    description: 'The elements in their order, hidden ones included.',
  })
  widgets!: DashboardWidgetDto[]
}

export class UpdateDashboardLayoutDto {
  @ApiProperty({
    type: [DashboardWidgetDto],
    description: 'The whole layout, in order; each type at most once.',
  })
  @IsArray()
  @ArrayMaxSize(DASHBOARD_WIDGET_TYPES.length)
  @ValidateNested({ each: true })
  @Type(() => DashboardWidgetDto)
  widgets!: DashboardWidgetDto[]
}
