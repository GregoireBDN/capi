import { applyDecorators } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  CATEGORY_ICON_DOC,
  type CategoryIcon,
} from '#/categories/category-icons'
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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
  ValidateNested,
} from 'class-validator'
import {
  RECEIVABLE_DIRECTIONS,
  TRANSACTION_KINDS,
  type ReceivableDirection,
  type TransactionKind,
} from '#/database/schema/domain-enums'
import { RECEIVABLE_STATES, type ReceivableState } from '#/owed/dto/owed.dto'

/** Same bounds as `paginationSchema` in `@finances/shared`. */
export const TRANSACTIONS_PAGE_LIMIT_DEFAULT = 20
export const TRANSACTIONS_PAGE_LIMIT_MAX = 100
/** Most transactions one bulk update may touch. */
export const BULK_UPDATE_MAX_IDS = 500

const NOTE_MAX = 2000
const SEARCH_MAX = 200
/** `YYYY-MM` with a real month. */
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

/** Present and non-null when sent; may be omitted (PATCH semantics). */
const NotNullIfPresent = () =>
  ValidateIf((_object: object, value: unknown) => value !== undefined)

/** Query-string booleans: only the literal `true` / `false` are accepted. */
const QueryBoolean = () =>
  applyDecorators(
    IsOptional(),
    Transform(({ value }: { value: unknown }) =>
      value === 'true' ? true : value === 'false' ? false : value,
    ),
    IsBoolean(),
  )

/** A `YYYY-MM-DD` calendar date that exists. */
const CalendarDate = () =>
  applyDecorators(
    IsOptional(),
    Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '$property must be YYYY-MM-DD' }),
    IsISO8601({ strict: true }),
  )

const KIND_DOC = {
  enum: TRANSACTION_KINDS,
  enumName: 'TransactionKind',
} as const

export class TransactionCategoryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  slug!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: String, nullable: true, example: '#d97706' })
  color!: string | null

  @ApiProperty(CATEGORY_ICON_DOC)
  icon!: CategoryIcon | null

  @ApiProperty({
    ...KIND_DOC,
    description:
      'Category group: the kind of every transaction and split part filed under it (#368).',
  })
  kind!: TransactionKind
}

export class TransactionSplitDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  categoryId!: string

  @ApiProperty({ type: TransactionCategoryDto })
  category!: TransactionCategoryDto

  @ApiProperty({
    type: 'integer',
    description: 'Signed integer cents, same sign as the transaction.',
  })
  amountCents!: number

  @ApiProperty({
    ...KIND_DOC,
    description:
      'Kind the part counts with: its category’s (#357, #368), so an incoming part in an expense category is a refund of that category and one in an income category is income.',
  })
  kind!: TransactionKind
}

const RECEIVABLE_DIRECTION_DOC = {
  enum: RECEIVABLE_DIRECTIONS,
  enumName: 'ReceivableDirection',
} as const

/** What a contact owes on this expense, or what the owner owes (#359). */
export class TransactionShareDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty(RECEIVABLE_DIRECTION_DOC)
  direction!: ReceivableDirection

  @ApiProperty({ type: String, format: 'uuid' })
  contactId!: string

  @ApiProperty({ type: String })
  contactName!: string

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  splitId!: string | null

  @ApiProperty({ type: 'integer', description: 'Owed, positive cents.' })
  amountCents!: number

  @ApiProperty({ type: 'integer', description: 'Repaid so far.' })
  repaidCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: '`i_owe`: the whole bill the contact paid.',
  })
  billCents!: number | null

  @ApiProperty({ enum: RECEIVABLE_STATES, enumName: 'ReceivableState' })
  state!: ReceivableState
}

/** Part of this transfer linked as a repayment (#359). */
export class TransactionRepaymentDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  receivableId!: string

  @ApiProperty(RECEIVABLE_DIRECTION_DOC)
  direction!: ReceivableDirection

  @ApiProperty({ type: String, format: 'uuid' })
  contactId!: string

  @ApiProperty({ type: String })
  contactName!: string

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  splitId!: string | null

  @ApiProperty({ type: 'integer', description: 'Positive cents.' })
  amountCents!: number
}

export class TransactionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Null only for an expense a contact paid for the owner (`paidByContactId`, « Payé pour moi »).',
  })
  accountId!: string | null

  @ApiProperty({ type: String, nullable: true })
  accountName!: string | null

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'The contact who paid this expense for the owner (#359): it holds his part, without an account.',
  })
  paidByContactId!: string | null

  @ApiProperty({ type: String, nullable: true })
  paidByContactName!: string | null

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  importId!: string | null

  @ApiProperty({ type: String, format: 'date', example: '2026-10-31' })
  bookingDate!: string

  @ApiProperty({ type: String, format: 'date', nullable: true })
  valueDate!: string | null

  @ApiProperty({
    type: 'integer',
    description: 'Signed integer cents: negative = money out.',
  })
  amountCents!: number

  @ApiProperty({ type: String })
  rawLabel!: string

  @ApiProperty({ type: String, nullable: true })
  merchant!: string | null

  @ApiProperty({
    ...KIND_DOC,
    description:
      '`transfer` = move between the user’s own accounts, never income or expense.',
  })
  kind!: TransactionKind

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Transfers only (#296): the owner’s other account the money goes to (amount < 0) or comes from (amount > 0).',
  })
  counterpartAccountId!: string | null

  @ApiProperty({ type: String, nullable: true })
  counterpartAccountName!: string | null

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  categoryId!: string | null

  @ApiProperty({ type: TransactionCategoryDto, nullable: true })
  category!: TransactionCategoryDto | null

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Rule that set the category. Null with a category = filed by hand (rules never overwrite it).',
  })
  ruleId!: string | null

  @ApiProperty({ type: Boolean })
  needsReview!: boolean

  @ApiProperty({
    type: Boolean,
    description: 'Exceptional expense or income, excluded from averages.',
  })
  isOneOff!: boolean

  @ApiProperty({ type: String, nullable: true })
  note!: string | null

  @ApiProperty({
    type: Boolean,
    description:
      'Entered by hand (no import), replaced by its bank row on import.',
  })
  manual!: boolean

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Prepaid subscription this expense pays upfront (#314): counted in its month, left out of averages like a one-off.',
  })
  prepaidItemId!: string | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Term in months of that prepaid subscription.',
  })
  prepaidTermMonths!: number | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Bank amount of an imported row whose amount was corrected by hand; null otherwise.',
  })
  originalAmountCents!: number | null

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description:
      'Bank booking date of an imported row whose date was corrected by hand; null otherwise.',
  })
  originalBookingDate!: string | null

  @ApiProperty({
    type: [TransactionSplitDto],
    description:
      'Parts of a transaction split between categories (empty when not split). They sum to `amountCents`; statistics and budgets count each part in its category.',
  })
  splits!: TransactionSplitDto[]

  @ApiProperty({
    type: [TransactionShareDto],
    description:
      'Who owes what on this expense (#359): statistics count only the owner’s part.',
  })
  shares!: TransactionShareDto[]

  @ApiProperty({
    type: [TransactionRepaymentDto],
    description:
      'Parts of this transfer linked as repayments (#359): neither income nor spending.',
  })
  repayments!: TransactionRepaymentDto[]

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date
}

export class TransactionListDto {
  @ApiProperty({ type: [TransactionDto] })
  items!: TransactionDto[]

  @ApiProperty({
    type: 'integer',
    description: 'Transactions matching the filters, all pages included.',
  })
  total!: number

  @ApiProperty({ type: 'integer' })
  page!: number

  @ApiProperty({ type: 'integer' })
  limit!: number
}

/** Orders of `GET /transactions`; ties are always broken by id. */
export const TRANSACTION_SORTS = [
  'date_desc',
  'date_asc',
  'amount_asc',
  'amount_desc',
] as const
export type TransactionSort = (typeof TRANSACTION_SORTS)[number]

/** Most ids one `ids` filter may list (one page of the list). */
export const TRANSACTION_IDS_FILTER_MAX = TRANSACTIONS_PAGE_LIMIT_MAX

/** Filters shared by the list and the summary. */
export class TransactionFiltersQueryDto {
  @ApiPropertyOptional({
    type: String,
    example:
      '7f0c5a7e-2d1b-4c3a-9e8f-123456789abc,3b9d2f1e-8c7a-4b6d-9e0f-abcdef012345',
    description: `Only these transactions: comma-separated ids, at most ${TRANSACTION_IDS_FILTER_MAX} (unknown ids are ignored). Used to show the current state of a selection before changing it.`,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TRANSACTION_IDS_FILTER_MAX)
  @IsUUID('all', { each: true })
  ids?: string[]

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Only transactions in (true) or out of (false) review.',
  })
  @QueryBoolean()
  needsReview?: boolean

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Only one-off (true) or recurring (false) transactions.',
  })
  @QueryBoolean()
  isOneOff?: boolean

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  accountId?: string

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Cannot be combined with `uncategorized`.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Only the transfers linked to this account (#296): money sent to it or received from it.',
  })
  @IsOptional()
  @IsUUID()
  counterpartAccountId?: string

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'true: only transactions without a category; false: only categorized ones.',
  })
  @QueryBoolean()
  uncategorized?: boolean

  @ApiPropertyOptional(KIND_DOC)
  @IsOptional()
  @IsIn(TRANSACTION_KINDS)
  kind?: TransactionKind

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description: 'Inclusive lower bound on the booking date (YYYY-MM-DD).',
  })
  @CalendarDate()
  from?: string

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description: 'Inclusive upper bound on the booking date (YYYY-MM-DD).',
  })
  @CalendarDate()
  to?: string

  @ApiPropertyOptional({
    type: String,
    pattern: MONTH_PATTERN.source,
    example: '2026-10',
    description:
      'Calendar month (YYYY-MM): shortcut for `from` = its first day and `to` = its last day. Cannot be combined with `from` or `to`.',
  })
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: '$property must be YYYY-MM' })
  month?: string

  @ApiPropertyOptional({
    type: String,
    maxLength: SEARCH_MAX,
    description: 'Case-insensitive search in the raw label and merchant.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(SEARCH_MAX)
  q?: string
}

export class ListTransactionsQueryDto extends TransactionFiltersQueryDto {
  @ApiPropertyOptional({
    enum: TRANSACTION_SORTS,
    enumName: 'TransactionSort',
    default: 'date_desc',
    description:
      'By booking date or by signed amount (`amount_asc` = biggest expenses first). Ties: booking date, newest first, then id.',
  })
  @IsOptional()
  @IsIn(TRANSACTION_SORTS)
  sort?: TransactionSort

  @ApiPropertyOptional({ type: 'integer', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page?: number

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: TRANSACTIONS_PAGE_LIMIT_MAX,
    default: TRANSACTIONS_PAGE_LIMIT_DEFAULT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(TRANSACTIONS_PAGE_LIMIT_MAX)
  limit?: number
}

export class TransactionSummaryDto {
  @ApiProperty({
    type: 'integer',
    description: 'Transactions matching the filters, transfers included.',
  })
  count!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Signed sum of `income` transactions, in cents. Transfers are never counted.',
  })
  incomeCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Signed sum of `expense` transactions, in cents (negative when money went out; refunds filed as expenses reduce it). Transfers are never counted.',
  })
  expenseCents!: number

  @ApiProperty({
    type: 'integer',
    description: '`incomeCents` + `expenseCents`: transfers excluded.',
  })
  netCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Part of `incomeCents` from one-off transactions.',
  })
  oneOffIncomeCents!: number

  @ApiProperty({
    type: 'integer',
    description: 'Part of `expenseCents` from one-off transactions.',
  })
  oneOffExpenseCents!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Transfers between own accounts among the matches, left out of the sums.',
  })
  transferCount!: number
}

export class ReviewCountDto {
  @ApiProperty({
    type: 'integer',
    description: 'Transactions waiting in the review queue.',
  })
  count!: number
}

const CATEGORY_CHANGE_DOC =
  'Setting a category files the transaction by hand (`ruleId` = null, so rules never overwrite it), gives it the category’s kind (#368: a `kind` sent with it must be that kind, else 400), and takes it out of review unless `needsReview` is sent. `null` removes the category (the kind is kept unless sent).'

const RULE_ID_DOC =
  'Restores a categorization made by a rule (e.g. to undo a correction). Requires `categoryId`, equal to the rule’s category.'

/** Fields shared by the single and the bulk update. */
class TransactionChangesDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: CATEGORY_CHANGE_DOC,
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: RULE_ID_DOC,
  })
  @IsOptional()
  @IsUUID()
  ruleId?: string | null

  @ApiPropertyOptional({
    ...KIND_DOC,
    description:
      'Kind of an uncategorized transaction (e.g. `transfer` for a move between own accounts). A categorized transaction has its category’s kind (#368): a different kind is refused (400), choose a category of that kind instead.',
  })
  @NotNullIfPresent()
  @IsIn(TRANSACTION_KINDS)
  kind?: TransactionKind

  @ApiPropertyOptional({ type: Boolean })
  @NotNullIfPresent()
  @IsBoolean()
  needsReview?: boolean

  @ApiPropertyOptional({ type: Boolean })
  @NotNullIfPresent()
  @IsBoolean()
  isOneOff?: boolean
}

/** Partial update: omitted fields are left unchanged. */
export class UpdateTransactionDto extends TransactionChangesDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: NOTE_MAX,
    description: 'Free text; an empty string clears it.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })
  @IsString()
  @MaxLength(NOTE_MAX)
  note?: string | null

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Links a transfer to the owner’s other account it goes to or comes from (#296); `null` unlinks it. Only on a transfer (or with `kind: transfer`), never the transaction’s own account. A kind other than `transfer` unlinks it.',
  })
  @IsOptional()
  @IsUUID()
  counterpartAccountId?: string | null
}

export class BulkUpdateTransactionsDto extends TransactionChangesDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: BULK_UPDATE_MAX_IDS,
    description: 'Unknown ids are ignored (see `updated`).',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_UPDATE_MAX_IDS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[]
}

/** Most parts of one split. */
export const SPLIT_MAX_PARTS = 20

export class SplitPartDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  categoryId!: string

  @ApiProperty({
    type: 'integer',
    description: 'Signed integer cents, same sign as the transaction, never 0.',
  })
  @IsInt()
  @NotEquals(0)
  amountCents!: number
}

export class SplitTransactionDto {
  @ApiProperty({
    type: [SplitPartDto],
    minItems: 2,
    maxItems: SPLIT_MAX_PARTS,
    description:
      'Replaces the parts. They must sum exactly to the transaction amount. Each counts with its category’s kind (an incoming part in an expense category is a refund of it); a transfer category cannot be mixed with income or expense categories.',
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(SPLIT_MAX_PARTS)
  @ValidateNested({ each: true })
  @Type(() => SplitPartDto)
  parts!: SplitPartDto[]
}

export class BulkUpdateResultDto {
  @ApiProperty({ type: 'integer', description: 'Transactions updated.' })
  updated!: number
}
