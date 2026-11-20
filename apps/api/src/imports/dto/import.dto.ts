import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'
import {
  IMPORT_SOURCES,
  type ImportSource,
  TRANSACTION_KINDS,
  type TransactionKind,
} from '#/database/schema/domain-enums'
import type { PreviewRowStatus } from '#/imports/preview/preview.types'

/** Sources that can be uploaded through `POST /imports/preview`. */
export const UPLOAD_SOURCES = [
  'cic_csv',
] as const satisfies readonly ImportSource[]
export type UploadSource = (typeof UPLOAD_SOURCES)[number]

export const IMPORT_STATUSES = ['pending', 'committed'] as const
export type ImportStatus = (typeof IMPORT_STATUSES)[number]

export const PREVIEW_ROW_STATUSES = [
  'new',
  'duplicate',
  'conflict',
] as const satisfies readonly PreviewRowStatus[]

export const CONFLICT_ACTIONS = ['import', 'skip'] as const
export type ConflictAction = (typeof CONFLICT_ACTIONS)[number]

/** Upper bound on the commit arrays (a 5 MB file holds far fewer rows). */
const MAX_ROW_ENTRIES = 100_000

const KIND_DOC = {
  enum: TRANSACTION_KINDS,
  enumName: 'TransactionKind',
} as const

// --- Upload ------------------------------------------------------------------

/** Documents the multipart body of `POST /imports/preview` (OpenAPI only). */
export class PreviewImportBodyDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Bank export (CIC CSV, Windows-1252), at most 5 MB.',
  })
  file!: unknown

  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Target account (checking or savings).',
  })
  accountId!: string

  @ApiPropertyOptional({
    enum: UPLOAD_SOURCES,
    enumName: 'ImportUploadSource',
    default: 'cic_csv',
  })
  source?: UploadSource
}

/** Validates the text fields of the multipart body. */
export class PreviewImportFieldsDto {
  @IsUUID()
  accountId!: string

  @IsOptional()
  @IsIn(UPLOAD_SOURCES)
  source?: UploadSource
}

// --- Commit -----------------------------------------------------------------

export class ConflictResolutionDto {
  @ApiProperty({ type: 'integer', minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(MAX_ROW_ENTRIES)
  rowIndex!: number

  @ApiProperty({
    enum: CONFLICT_ACTIONS,
    enumName: 'ConflictAction',
    description:
      '`import` keeps the row as a separate transaction, `skip` leaves it out.',
  })
  @IsIn(CONFLICT_ACTIONS)
  action!: ConflictAction
}

export class CategoryOverrideDto {
  @ApiProperty({ type: 'integer', minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(MAX_ROW_ENTRIES)
  rowIndex!: number

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  categoryId!: string
}

export class CommitImportDto {
  @ApiPropertyOptional({
    type: [ConflictResolutionDto],
    description:
      'Decision for `conflict` rows. Conflicts without a decision are skipped.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ROW_ENTRIES)
  @ValidateNested({ each: true })
  @Type(() => ConflictResolutionDto)
  conflictResolutions?: ConflictResolutionDto[]

  @ApiPropertyOptional({
    type: [CategoryOverrideDto],
    description:
      'Category chosen in the preview, replacing the proposed one (the row then leaves the review queue). Ignored for rows that are not imported.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ROW_ENTRIES)
  @ValidateNested({ each: true })
  @Type(() => CategoryOverrideDto)
  categoryOverrides?: CategoryOverrideDto[]
}

// --- Responses --------------------------------------------------------------

export class ImportCountsDto {
  @ApiProperty({ type: 'integer', description: 'Parsed rows.' })
  rows!: number

  @ApiProperty({ type: 'integer', description: 'Rows classified as new.' })
  new!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Rows already stored. Once committed, also counts rows that another import stored in the meantime.',
  })
  duplicates!: number

  @ApiProperty({
    type: 'integer',
    description: 'Probable duplicates of a transaction from another source.',
  })
  conflicts!: number

  @ApiProperty({
    type: 'integer',
    description: 'Lines that could not be parsed.',
  })
  issues!: number

  @ApiProperty({
    type: 'integer',
    description: 'Transactions written (0 while pending).',
  })
  inserted!: number

  @ApiProperty({
    type: 'integer',
    description: 'Conflicts left out (0 while pending).',
  })
  skipped!: number
}

export class ImportSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ type: String })
  accountName!: string

  @ApiProperty({ enum: IMPORT_SOURCES, enumName: 'ImportSource' })
  source!: ImportSource

  @ApiProperty({ type: String })
  fileName!: string

  @ApiProperty({
    enum: IMPORT_STATUSES,
    enumName: 'ImportStatus',
    description: '`pending`: previewed, nothing written yet.',
  })
  status!: ImportStatus

  @ApiProperty({ type: String, format: 'date', nullable: true })
  periodStart!: string | null

  @ApiProperty({ type: String, format: 'date', nullable: true })
  periodEnd!: string | null

  @ApiProperty({ type: ImportCountsDto })
  counts!: ImportCountsDto

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  committedAt!: Date | null
}

export class ParseIssueDto {
  @ApiProperty({ type: 'integer', description: '1-based line in the file.' })
  lineNumber!: number

  @ApiProperty({ type: String })
  message!: string
}

export class ContinuityGapDto {
  @ApiProperty({ type: 'integer' })
  lineNumber!: number

  @ApiProperty({
    type: 'integer',
    description: 'Balance the row should have had.',
  })
  expectedCents!: number

  @ApiProperty({ type: 'integer', description: 'Balance the file gives.' })
  actualCents!: number

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description:
      'Missing rows are between fromDate and toDate (inclusive); null for an opening mismatch.',
  })
  fromDate!: string | null

  @ApiProperty({ type: String, format: 'date' })
  toDate!: string
}

export class ContinuityReportDto {
  @ApiProperty({
    type: Boolean,
    description: 'False when no balance could be compared.',
  })
  checked!: boolean

  @ApiProperty({
    type: Boolean,
    description: 'No gap and no opening mismatch (meaningful when checked).',
  })
  ok!: boolean

  @ApiProperty({ enum: ['ascending', 'descending', 'unknown'] })
  order!: 'ascending' | 'descending' | 'unknown'

  @ApiProperty({ type: [ContinuityGapDto] })
  gaps!: ContinuityGapDto[]

  @ApiProperty({
    type: ContinuityGapDto,
    nullable: true,
    description:
      'The first balance of the file does not follow the balance already stored for the previous day.',
  })
  openingMismatch!: ContinuityGapDto | null
}

export class ExistingTransactionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'date' })
  bookingDate!: string

  @ApiProperty({ type: 'integer' })
  amountCents!: number

  @ApiProperty({ type: String })
  rawLabel!: string
}

export class ManualExpenseMatchDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'date' })
  bookingDate!: string

  @ApiProperty({ type: 'integer', description: 'Signed cents.' })
  amountCents!: number

  @ApiProperty({ type: String })
  rawLabel!: string

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  categoryId!: string | null
}

export class ImportPreviewRowDto {
  @ApiProperty({
    type: 'integer',
    description: '0-based row index, referenced by the commit body.',
  })
  index!: number

  @ApiProperty({ type: 'integer' })
  lineNumber!: number

  @ApiProperty({ type: String, format: 'date' })
  bookingDate!: string

  @ApiProperty({ type: String, format: 'date', nullable: true })
  valueDate!: string | null

  @ApiProperty({ type: 'integer', description: 'Signed cents.' })
  amountCents!: number

  @ApiProperty({ type: 'integer', nullable: true })
  balanceAfterCents!: number | null

  @ApiProperty({ type: String })
  rawLabel!: string

  @ApiProperty({ type: String, nullable: true })
  merchant!: string | null

  @ApiProperty({ enum: PREVIEW_ROW_STATUSES, enumName: 'ImportRowStatus' })
  status!: PreviewRowStatus

  @ApiProperty({ type: String, nullable: true })
  conflictReason!: string | null

  @ApiProperty({
    type: ExistingTransactionDto,
    nullable: true,
    description:
      'The stored transaction this row duplicates or conflicts with, as it was when previewed.',
  })
  existing!: ExistingTransactionDto | null

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Proposed by the rules, or the category of the manual expense the row replaces; null when neither applies.',
  })
  categoryId!: string | null

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  ruleId!: string | null

  @ApiProperty(KIND_DOC)
  kind!: TransactionKind

  @ApiProperty({
    type: Boolean,
    description: 'No rule matched: the transaction goes to the review queue.',
  })
  needsReview!: boolean

  @ApiProperty({
    type: ManualExpenseMatchDto,
    nullable: true,
    description:
      'Expense noted by hand that this new row replaces on commit (same account and amount, booked a few days apart): the row keeps its category and note.',
  })
  manualMatch!: ManualExpenseMatchDto | null
}

export class ImportPreviewDto {
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Stored balance the file continues from.',
  })
  previousBalanceCents!: number | null

  @ApiProperty({ type: ContinuityReportDto })
  continuity!: ContinuityReportDto

  @ApiProperty({ type: [ParseIssueDto] })
  issues!: ParseIssueDto[]

  @ApiProperty({ type: [ImportPreviewRowDto] })
  rows!: ImportPreviewRowDto[]

  @ApiProperty({
    type: [ManualExpenseMatchDto],
    description:
      'Expenses noted by hand in the file’s period that no row replaces: kept and flagged for review on commit.',
  })
  unmatchedManual!: ManualExpenseMatchDto[]
}

export class AlreadyImportedDto {
  @ApiProperty({ type: String, format: 'uuid' })
  importId!: string

  @ApiProperty({ type: String, format: 'date-time' })
  committedAt!: Date
}

export class ImportUndoImpactDto {
  @ApiProperty({
    type: 'integer',
    description:
      'Rows edited by hand that undoing deletes with their edits: filed by hand (not by a rule), kind changed, note, split, corrected amount or date, transfer link set by hand, one-off flag, prepaid subscription link. Absorbed rows are left out.',
  })
  editedCount!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Manual transactions absorbed by reconciliation: undoing puts them back as manual transactions.',
  })
  absorbedManualCount!: number
}

export class ImportDetailDto extends ImportSummaryDto {
  @ApiProperty({
    type: AlreadyImportedDto,
    nullable: true,
    description:
      'Another committed import of this account has the same file (same SHA-256).',
  })
  alreadyImported!: AlreadyImportedDto | null

  @ApiProperty({
    type: ImportPreviewDto,
    nullable: true,
    description: 'Rows to review; null once committed.',
  })
  preview!: ImportPreviewDto | null

  @ApiProperty({
    type: ImportUndoImpactDto,
    nullable: true,
    description:
      'What undoing a committed import deletes and puts back (#371); null while pending.',
  })
  undo!: ImportUndoImpactDto | null
}

export class DeleteImportResultDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({
    enum: ['discarded', 'undone'],
    description:
      '`discarded`: a pending preview was dropped. `undone`: a committed import and its transactions were deleted.',
  })
  result!: 'discarded' | 'undone'

  @ApiProperty({ type: 'integer' })
  removedTransactions!: number

  @ApiProperty({
    type: 'integer',
    description:
      'Manual transactions absorbed by the undone import, put back as manual transactions (0 for a discarded preview).',
  })
  restoredManual!: number
}
