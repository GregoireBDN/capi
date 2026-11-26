import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
import {
  CATEGORY_ICON_DOC,
  type CategoryIcon,
} from '#/categories/category-icons'
import {
  RECEIVABLE_DIRECTIONS,
  RECEIVABLE_ORIGINS,
  type ReceivableDirection,
  type ReceivableOrigin,
} from '#/database/schema/domain-enums'
import { CONTACT_NAME_MAX } from '../contacts.schema'

/** Highest amount owed on one item: 1 000 000 €. */
export const OWED_AMOUNT_MAX_CENTS = 100_000_000
export const OWED_NOTE_MAX = 500
/** Most people one expense is shared with. */
export const SHARES_MAX = 20
/** Most items one repayment is linked to. */
export const LINKS_MAX = 50
/** Most bank-label words of a contact. */
export const MATCH_LABELS_MAX = 10
export const MATCH_LABEL_MAX = 60

export const RECEIVABLE_STATES = ['open', 'repaid', 'forgiven'] as const
/** « à rembourser », « remboursé », « abandonné »: computed, never stored. */
export type ReceivableState = (typeof RECEIVABLE_STATES)[number]

const DIRECTION_DOC = {
  enum: RECEIVABLE_DIRECTIONS,
  enumName: 'ReceivableDirection',
  description:
    '`owed_to_me`: the owner advanced the money; `i_owe`: the contact paid for the owner.',
} as const
const STATE_DOC = {
  enum: RECEIVABLE_STATES,
  enumName: 'ReceivableState',
  description:
    'Computed: `open` (« à rembourser », something left to claim), `repaid` (« remboursé », nothing left, nothing let go), `forgiven` (« abandonné », nothing left, some let go).',
} as const
const DATE_DOC = {
  type: String,
  format: 'date',
  example: '2026-11-13',
} as const
const CENTS = (description: string) =>
  ({ type: 'integer', description }) as const

/** Trims; an empty text is no text (null). */
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value

/** A `YYYY-MM-DD` calendar date that exists. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const Cents = () =>
  [IsInt(), Min(1), Max(OWED_AMOUNT_MAX_CENTS)] as PropertyDecorator[]

function apply(...decorators: PropertyDecorator[]): PropertyDecorator {
  return (target, key) => {
    for (const decorator of decorators) decorator(target, key)
  }
}

/** A contact named by id, or by name (created when new). */
export class ContactRefDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @ValidateIf((o: ContactRefDto) => o.contactName === undefined)
  @IsUUID()
  contactId?: string

  @ApiPropertyOptional({
    type: String,
    maxLength: CONTACT_NAME_MAX,
    description:
      'Name of the contact when no id is given: an existing contact of that name (case ignored), else a new one.',
  })
  @ValidateIf((o: ContactRefDto) => o.contactId === undefined)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(CONTACT_NAME_MAX)
  contactName?: string
}

export class ShareInputDto extends ContactRefDto {
  @ApiProperty(CENTS('What this person owes on the expense, positive cents.'))
  @apply(...Cents())
  amountCents!: number
}

export class CreateContactDto {
  @ApiProperty({ type: String, maxLength: CONTACT_NAME_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(CONTACT_NAME_MAX)
  name!: string

  @ApiPropertyOptional({
    type: [String],
    description:
      'Words of their bank labels (« CAMILLE MARTIN »), to suggest their repayments.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MATCH_LABELS_MAX)
  @IsString({ each: true })
  @MaxLength(MATCH_LABEL_MAX, { each: true })
  matchLabels?: string[]

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 1,
    maximum: 31,
    description: 'Usual day of the month their repayments arrive (forecast).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  repaymentDay?: number | null
}

export class UpdateContactDto {
  @ApiPropertyOptional({ type: String, maxLength: CONTACT_NAME_MAX })
  @ValidateIf((_o: object, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(CONTACT_NAME_MAX)
  name?: string

  @ApiPropertyOptional({ type: [String] })
  @ValidateIf((_o: object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(MATCH_LABELS_MAX)
  @IsString({ each: true })
  @MaxLength(MATCH_LABEL_MAX, { each: true })
  matchLabels?: string[]

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 1,
    maximum: 31,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  repaymentDay?: number | null

  @ApiPropertyOptional({
    type: Boolean,
    description:
      '« Toujours compenser » (#484): offset what they owe and what the owner owes them as soon as both are open, without asking. Turning it on offsets what is open now.',
  })
  @ValidateIf((_o: object, value: unknown) => value !== undefined)
  @IsBoolean()
  alwaysOffset?: boolean

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Archive (left out of the pickers) or bring back.',
  })
  @ValidateIf((_o: object, value: unknown) => value !== undefined)
  @IsBoolean()
  archived?: boolean
}

export class CreateSharesDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'An expense paid from one of the owner’s accounts.',
  })
  @IsUUID()
  transactionId!: string

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'The part of a split expense the shares reduce: required when it is split.',
  })
  @IsOptional()
  @IsUUID()
  splitId?: string

  @ApiProperty({ type: [ShareInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SHARES_MAX)
  @ValidateNested({ each: true })
  @Type(() => ShareInputDto)
  shares!: ShareInputDto[]

  @ApiPropertyOptional({ type: String, maxLength: OWED_NOTE_MAX })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(OWED_NOTE_MAX)
  note?: string | null
}

export class ReplaceSharesDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  splitId?: string

  @ApiProperty({
    type: [ShareInputDto],
    description:
      'Everyone the expense is shared with; an empty list stops sharing it. A person left out loses their share, refused once they repaid part of it.',
  })
  @IsArray()
  @ArrayMaxSize(SHARES_MAX)
  @ValidateNested({ each: true })
  @Type(() => ShareInputDto)
  shares!: ShareInputDto[]
}

export class UpdateReceivableDto {
  @ApiPropertyOptional(CENTS('What is owed, positive cents.'))
  @ValidateIf((_o: object, value: unknown) => value !== undefined)
  @apply(...Cents())
  amountCents?: number

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: OWED_NOTE_MAX,
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(OWED_NOTE_MAX)
  note?: string | null
}

export class ForgiveReceivableDto {
  @ApiPropertyOptional(
    CENTS(
      'The part to let go, positive cents, at most what is left (#437). Default: everything left.',
    ),
  )
  @IsOptional()
  @apply(...Cents())
  amountCents?: number

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: OWED_NOTE_MAX,
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(OWED_NOTE_MAX)
  note?: string | null
}

export class CreateDebtDto extends ContactRefDto {
  @ApiProperty(CENTS('The whole bill the contact paid, positive cents.'))
  @apply(...Cents())
  billCents!: number

  @ApiProperty(
    CENTS('The owner’s part of it, positive cents, at most the bill.'),
  )
  @apply(...Cents())
  partCents!: number

  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'An expense category.',
  })
  @IsUUID()
  categoryId!: string

  @ApiPropertyOptional({
    ...DATE_DOC,
    description: 'Day of the expense; today (Europe/Paris) when omitted.',
  })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'bookingDate must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  bookingDate?: string

  @ApiPropertyOptional({
    type: String,
    maxLength: 255,
    description: 'Label; the category name when omitted.',
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(255)
  label?: string | null

  @ApiPropertyOptional({ type: String, maxLength: OWED_NOTE_MAX })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(OWED_NOTE_MAX)
  note?: string | null
}

export class LinkItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  receivableId!: string

  @ApiProperty(CENTS('Part of the repayment for this item, positive cents.'))
  @apply(...Cents())
  amountCents!: number
}

export class LinkRepaymentDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'The repayment transfer: incoming for what is owed to the owner, outgoing for what he owes. Omitted: « Réglé autrement » (cash, in kind), dated `paidOn`.',
  })
  @IsOptional()
  @IsUUID()
  transactionId?: string

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'The part of a split transfer: required when it is split.',
  })
  @IsOptional()
  @IsUUID()
  splitId?: string

  @ApiPropertyOptional({
    ...DATE_DOC,
    description:
      'Day it was settled, never in the future: the transfer’s booking date when one is given, else today (Europe/Paris) by default.',
  })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'paidOn must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  paidOn?: string

  @ApiPropertyOptional({ type: String, maxLength: OWED_NOTE_MAX })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(OWED_NOTE_MAX)
  note?: string | null

  @ApiProperty({ type: [LinkItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LINKS_MAX)
  @ValidateNested({ each: true })
  @Type(() => LinkItemDto)
  items!: LinkItemDto[]
}

export class SetRecurringShareDto extends ContactRefDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 10000,
    description: 'Their share in basis points (5000 = half). Or `amountCents`.',
  })
  @ValidateIf((o: SetRecurringShareDto) => o.amountCents === undefined)
  @IsInt()
  @Min(1)
  @Max(10000)
  bps?: number

  @ApiPropertyOptional(
    CENTS('A fixed amount of each charge (capped at the charge). Or `bps`.'),
  )
  @ValidateIf((o: SetRecurringShareDto) => o.bps === undefined)
  @apply(...Cents())
  amountCents?: number

  @ApiPropertyOptional({
    ...DATE_DOC,
    description:
      'Charges booked from this day on get their share; the first day of the current month (Europe/Paris) by default.',
  })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'from must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  from?: string
}

export class RepaymentOptionsQueryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  transactionId!: string

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Whose open items to list; by default the contact whose bank words match the label, else the one owed the most.',
  })
  @IsOptional()
  @IsUUID()
  contactId?: string

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'The part of a split transfer.',
  })
  @IsOptional()
  @IsUUID()
  splitId?: string
}

export class ContactsQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    description: 'Include archived contacts.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  archived?: boolean
}

// --- Responses ------------------------------------------------------------

export class ContactDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: [String] })
  matchLabels!: string[]

  @ApiProperty({ type: 'integer', nullable: true })
  repaymentDay!: number | null

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  archivedAt!: Date | null

  @ApiProperty(CENTS('What they owe the owner now (open items).'))
  owedToMeCents!: number

  @ApiProperty(CENTS('What the owner owes them now (open items).'))
  iOweCents!: number

  @ApiProperty({
    type: Boolean,
    description: '« Toujours compenser » (#484).',
  })
  alwaysOffset!: boolean
}

export class OwedCategoryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: String, nullable: true })
  color!: string | null

  @ApiProperty(CATEGORY_ICON_DOC)
  icon!: CategoryIcon | null
}

export class ReceivablePaymentDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  receivableId!: string

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The transfer; null for « Réglé autrement ».',
  })
  transactionId!: string | null

  @ApiProperty(CENTS('Positive cents.'))
  amountCents!: number

  @ApiProperty(DATE_DOC)
  paidOn!: string

  @ApiProperty({ type: String, nullable: true })
  note!: string | null

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Label of the transfer.',
  })
  label!: string | null

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'The offset (« Compensé ») this repayment is one side of (#484): no transfer then, undone with the offset only.',
  })
  offsetId!: string | null
}

export class ReceivableDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty(DIRECTION_DOC)
  direction!: ReceivableDirection

  @ApiProperty({ type: String, format: 'uuid' })
  contactId!: string

  @ApiProperty({ type: String })
  contactName!: string

  @ApiProperty({ type: String, format: 'uuid' })
  transactionId!: string

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  splitId!: string | null

  @ApiProperty({ ...DATE_DOC, description: 'Day of the expense.' })
  bookingDate!: string

  @ApiProperty({ type: String, description: 'Label of the expense.' })
  label!: string

  @ApiProperty({ type: OwedCategoryDto, nullable: true })
  category!: OwedCategoryDto | null

  @ApiProperty(
    CENTS(
      'The expense line (positive cents): what the owner paid for `owed_to_me`, his part for `i_owe`.',
    ),
  )
  expenseCents!: number

  @ApiProperty(CENTS('What is owed on it, positive cents.'))
  amountCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: '`i_owe`: the whole bill the contact paid.',
  })
  billCents!: number | null

  @ApiProperty(CENTS('Repaid so far (linked repayments).'))
  repaidCents!: number

  @ApiProperty(CENTS('Still owed: the share minus what was repaid and let go.'))
  leftCents!: number

  @ApiProperty(STATE_DOC)
  state!: ReceivableState

  @ApiProperty(CENTS('Let go (#437), 0 when nothing was.'))
  forgivenCents!: number

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'When some was last let go; null when nothing is.',
  })
  forgivenAt!: Date | null

  @ApiProperty({ type: String, nullable: true })
  forgivenNote!: string | null

  @ApiProperty({ type: String, nullable: true })
  note!: string | null

  @ApiProperty({
    enum: RECEIVABLE_ORIGINS,
    enumName: 'ReceivableOrigin',
    description: '`recurring`: made from a shared recurring item.',
  })
  origin!: ReceivableOrigin

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  recurringItemId!: string | null

  @ApiProperty({ type: [ReceivablePaymentDto] })
  payments!: ReceivablePaymentDto[]
}

export class OwedContactRowDto {
  @ApiProperty({ type: String, format: 'uuid' })
  contactId!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty(CENTS('Owed now, in this direction.'))
  owedCents!: number

  @ApiProperty({ type: 'integer', description: 'Open items.' })
  openCount!: number

  @ApiProperty({ ...DATE_DOC, nullable: true })
  oldestOpenDate!: string | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Days since the oldest open item (Europe/Paris).',
  })
  oldestOpenDays!: number | null

  @ApiProperty({
    type: 'integer',
    description:
      'Net position with this person, both directions (#484): what they owe the owner minus what he owes them, signed cents.',
  })
  netCents!: number
}

export class OwedListDto {
  @ApiProperty(CENTS('Owed now, everyone together.'))
  totalCents!: number

  @ApiProperty({
    type: [OwedContactRowDto],
    description: 'People with something open, most owed first.',
  })
  contacts!: OwedContactRowDto[]

  @ApiProperty({
    type: [OwedContactRowDto],
    description: 'People all settled (« Tout réglé »), by name.',
  })
  settled!: OwedContactRowDto[]
}

export const EXPECTED_REPAYMENT_STATUSES = [
  'expected',
  'partial',
  'received',
] as const
export type ExpectedRepaymentStatus =
  (typeof EXPECTED_REPAYMENT_STATUSES)[number]

export class ExpectedRepaymentDto {
  @ApiProperty({ type: String, format: 'uuid' })
  recurringItemId!: string

  @ApiProperty({ type: String, description: 'The recurring item’s name.' })
  name!: string

  @ApiProperty({ type: String, format: 'uuid' })
  contactId!: string

  @ApiProperty({ type: String })
  contactName!: string

  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty(CENTS('Their share of this month’s charge.'))
  expectedCents!: number

  @ApiProperty(CENTS('Repaid so far on it.'))
  receivedCents!: number

  @ApiProperty({
    ...DATE_DOC,
    description:
      'Day it is expected: the contact’s usual day, else the month end.',
  })
  date!: string

  @ApiProperty({
    enum: EXPECTED_REPAYMENT_STATUSES,
    enumName: 'ExpectedRepaymentStatus',
  })
  status!: ExpectedRepaymentStatus

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The receivable of the charge, once booked.',
  })
  receivableId!: string | null
}

export class OffsetProposalDto {
  @ApiProperty({ type: String, format: 'uuid' })
  contactId!: string

  @ApiProperty({ type: String })
  contactName!: string

  @ApiProperty(CENTS('What they owe the owner now.'))
  owedToMeCents!: number

  @ApiProperty(CENTS('What the owner owes them now.'))
  iOweCents!: number

  @ApiProperty(
    CENTS(
      'Settled on each side by the offset: the smaller of the two, 0 when one side is empty.',
    ),
  )
  amountCents!: number

  @ApiProperty({ type: Boolean, description: '« Toujours compenser ».' })
  alwaysOffset!: boolean

  @ApiProperty({
    type: [LinkItemDto],
    description:
      'The items it settles, both directions, oldest first on each side.',
  })
  items!: LinkItemDto[]
}

export class OffsetDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  contactId!: string

  @ApiProperty(CENTS('Settled on each side.'))
  amountCents!: number

  @ApiProperty(DATE_DOC)
  offsetOn!: string

  @ApiProperty({
    type: Boolean,
    description: 'Made by « Toujours compenser », not by a tap.',
  })
  automatic!: boolean
}

export class CreateOffsetDto {
  @ApiPropertyOptional({
    type: [LinkItemDto],
    description:
      'The items to settle (the ones the owner ticked), both directions, adding up to the same amount on each side. Omitted: the oldest open items first, for the smaller of the two totals.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(LINKS_MAX)
  @ValidateNested({ each: true })
  @Type(() => LinkItemDto)
  items?: LinkItemDto[]
}

export class OwedSummaryDto {
  @ApiProperty(DATE_DOC)
  today!: string

  @ApiProperty({ type: String, example: '2026-11' })
  month!: string

  @ApiProperty({ type: OwedListDto, description: '« On me doit ».' })
  owedToMe!: OwedListDto

  @ApiProperty({ type: OwedListDto, description: '« Je dois ».' })
  iOwe!: OwedListDto

  @ApiProperty({
    type: [ExpectedRepaymentDto],
    description:
      'This month’s repayments expected from shared recurring items.',
  })
  expected!: ExpectedRepaymentDto[]

  @ApiProperty({
    type: [OffsetProposalDto],
    description:
      'People who owe the owner and whom he owes too: the offset to propose (« Compenser »), most settled first (#484).',
  })
  offers!: OffsetProposalDto[]
}

export class OwedTotalsDto {
  @ApiProperty(CENTS('Every item, all time.'))
  totalCents!: number

  @ApiProperty(CENTS('Repaid.'))
  repaidCents!: number

  @ApiProperty(CENTS('Let go.'))
  forgivenCents!: number

  @ApiProperty(CENTS('Still open.'))
  openCents!: number
}

export class ContactDirectionDto {
  @ApiProperty({ type: OwedTotalsDto })
  totals!: OwedTotalsDto

  @ApiProperty({ type: [ReceivableDto], description: 'Open, oldest first.' })
  open!: ReceivableDto[]

  @ApiProperty({
    type: [ReceivableDto],
    description: 'Repaid or let go, newest first.',
  })
  history!: ReceivableDto[]
}

export class RecurringShareInfoDto {
  @ApiProperty({ type: String, format: 'uuid' })
  contactId!: string

  @ApiProperty({ type: String })
  contactName!: string

  @ApiProperty({ type: 'integer', nullable: true })
  bps!: number | null

  @ApiProperty({ type: 'integer', nullable: true })
  amountCents!: number | null

  @ApiProperty(DATE_DOC)
  from!: string
}

export class ContactSharedItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  recurringItemId!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: RecurringShareInfoDto })
  share!: RecurringShareInfoDto
}

export class ContactOwedDto {
  @ApiProperty({ type: ContactDto })
  contact!: ContactDto

  @ApiProperty({
    type: ContactDirectionDto,
    description: '« Il vous doit ».',
  })
  owedToMe!: ContactDirectionDto

  @ApiProperty({
    type: ContactDirectionDto,
    description: '« Vous lui devez ».',
  })
  iOwe!: ContactDirectionDto

  @ApiProperty({ type: [ExpectedRepaymentDto] })
  expected!: ExpectedRepaymentDto[]

  @ApiProperty({ type: [ContactSharedItemDto] })
  sharedItems!: ContactSharedItemDto[]

  @ApiProperty({
    type: [OffsetDto],
    description: 'Offsets made with them, newest first (#484).',
  })
  offsets!: OffsetDto[]

  @ApiProperty({
    type: OffsetProposalDto,
    nullable: true,
    description:
      'The offset to propose when both sides are open, else null (#484).',
  })
  offer!: OffsetProposalDto | null
}

export class SuggestedLinkDto {
  @ApiProperty({ type: String, format: 'uuid' })
  receivableId!: string

  @ApiProperty(CENTS('Positive cents.'))
  amountCents!: number
}

export class RepaymentContactDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty(CENTS('Open, in the transfer’s direction.'))
  owedCents!: number

  @ApiProperty({
    type: Boolean,
    description: 'Their bank words match the transfer’s label.',
  })
  matched!: boolean
}

export class RepaymentOptionsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  transactionId!: string

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  splitId!: string | null

  @ApiProperty({
    ...DIRECTION_DOC,
    description:
      'What it repays: `owed_to_me` for an incoming transfer, `i_owe` for an outgoing one.',
  })
  direction!: ReceivableDirection

  @ApiProperty(CENTS('The transfer line, positive cents.'))
  amountCents!: number

  @ApiProperty(CENTS('Already linked.'))
  linkedCents!: number

  @ApiProperty(CENTS('Still free to link.'))
  availableCents!: number

  @ApiProperty({
    type: [RepaymentContactDto],
    description: 'People with something open in that direction.',
  })
  contacts!: RepaymentContactDto[]

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  contactId!: string | null

  @ApiProperty({
    type: [ReceivableDto],
    description: 'That person’s open items, oldest first.',
  })
  items!: ReceivableDto[]

  @ApiProperty({
    type: [SuggestedLinkDto],
    description:
      'Pre-ticked: the oldest items adding up to the free amount exactly, else the closest without going over.',
  })
  suggestion!: SuggestedLinkDto[]

  @ApiProperty({ type: Boolean })
  exact!: boolean
}

export class RepaymentSuggestionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  transactionId!: string

  @ApiProperty(DATE_DOC)
  bookingDate!: string

  @ApiProperty({ type: String })
  label!: string

  @ApiProperty(CENTS('Signed cents of the transfer.'))
  amountCents!: number

  @ApiProperty(DIRECTION_DOC)
  direction!: ReceivableDirection

  @ApiProperty({ type: String, format: 'uuid' })
  contactId!: string

  @ApiProperty({ type: String })
  contactName!: string

  @ApiProperty({ type: [SuggestedLinkDto] })
  links!: SuggestedLinkDto[]
}

export class LinkRepaymentResultDto {
  @ApiProperty({ type: [ReceivablePaymentDto] })
  payments!: ReceivablePaymentDto[]

  @ApiProperty(CENTS('Linked by this call.'))
  linkedCents!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'What is left of the transfer in its own category, null without a transfer.',
  })
  restCents!: number | null
}

export class ReceivableListDto {
  @ApiProperty({ type: [ReceivableDto] })
  items!: ReceivableDto[]
}
