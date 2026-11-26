import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
import { LINKS_MAX, LinkItemDto, ReplaceSharesDto } from '#/owed/dto/owed.dto'
import {
  PREPAID_TERM_MAX_MONTHS,
  PREPAID_TERM_MIN_MONTHS,
} from '#/recurring/prepaid'
import { UpdateManualTransactionDto } from '../dto/manual-transaction.dto'
import {
  SplitTransactionDto,
  UpdateTransactionDto,
} from '../dto/transaction.dto'

/** What a transfer repays, linked when the edit is saved (#359). */
export class EditRepaymentLinkDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'The part of a split transfer: required when it is split.',
  })
  @IsOptional()
  @IsUUID()
  splitId?: string

  @ApiProperty({ type: [LinkItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LINKS_MAX)
  @ValidateNested({ each: true })
  @Type(() => LinkItemDto)
  items!: LinkItemDto[]
}

/** The repayments of a transfer the edit changes (#359). */
export class EditRepaymentsDto {
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Repayments linked to this transaction to unlink (`repayments[].id`).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LINKS_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  unlink?: string[]

  @ApiPropertyOptional({
    type: EditRepaymentLinkDto,
    description:
      'Items this transaction repays, linked after the unlinks and every other change, dated on its day.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => EditRepaymentLinkDto)
  link?: EditRepaymentLinkDto
}

/** The envelope an expense or a transfer out is attached to (#430). */
export class EditEnvelopeDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  envelopeId!: string

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    description:
      'What it pays of the expense or carries with the transfer; omitted = all it can (`POST /envelopes/{id}/transactions`).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number
}

/**
 * Every change of the transaction editor (#435), saved at once: each part
 * has the semantics of its own route, and all of them are applied in one
 * database transaction, so a refusal anywhere leaves the transaction as it
 * was.
 */
export class SaveTransactionEditDto {
  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Puts back the bank amount and date of an imported row corrected before #398 (`DELETE /transactions/{id}/correction`). Applied first.',
  })
  @IsOptional()
  @Equals(true)
  restoreBankValues?: true

  @ApiPropertyOptional({
    type: UpdateManualTransactionDto,
    description:
      'Fields of a transaction entered by hand (`PATCH /transactions/manual/{id}`): 400 on an imported row.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateManualTransactionDto)
  manual?: UpdateManualTransactionDto

  @ApiPropertyOptional({
    type: UpdateTransactionDto,
    description:
      'Category, kind, flags, note and a transfer’s other account (`PATCH /transactions/{id}`), applied after the manual fields.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateTransactionDto)
  changes?: UpdateTransactionDto

  @ApiPropertyOptional({
    type: SplitTransactionDto,
    nullable: true,
    description:
      'The parts of a split (`PUT /transactions/{id}/splits`); `null` puts it back in one category (`DELETE`). Ending a split is applied before the other fields, a new split after them.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SplitTransactionDto)
  split?: SplitTransactionDto | null

  @ApiPropertyOptional({
    type: ReplaceSharesDto,
    description:
      'Who owes the owner what on this expense (`PUT /transactions/{id}/shares`): what goes down first, what goes up after the other fields.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReplaceSharesDto)
  shares?: ReplaceSharesDto

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: PREPAID_TERM_MIN_MONTHS,
    maximum: PREPAID_TERM_MAX_MONTHS,
    description:
      'Prepaid term in months (#314): declares this expense as an upfront payment, or changes the term of the item it pays; `null` makes that item an ordinary one again.',
  })
  @IsOptional()
  @ValidateIf((_o: object, value: unknown) => value !== null)
  @IsInt()
  @Min(PREPAID_TERM_MIN_MONTHS)
  @Max(PREPAID_TERM_MAX_MONTHS)
  prepaidTermMonths?: number | null

  @ApiPropertyOptional({
    type: EditEnvelopeDto,
    nullable: true,
    description:
      'The envelope that pays this expense or carries this transfer’s money (#430): detached first when it changes, attached after the other fields; `null` detaches it.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => EditEnvelopeDto)
  envelope?: EditEnvelopeDto | null

  @ApiPropertyOptional({ type: EditRepaymentsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EditRepaymentsDto)
  repayments?: EditRepaymentsDto
}
