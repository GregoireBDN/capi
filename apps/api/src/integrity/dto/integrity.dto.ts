import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, Matches } from 'class-validator'
import { MONTH_PATTERN } from '#/dashboard/calendar'

/**
 * The checks (#427). `envelopes` (envelopes vs balances) comes with M13,
 * once envelopes exist.
 */
export const INTEGRITY_CHECKS = [
  'balances',
  'crypto',
  'owed',
  'totals',
] as const
export type IntegrityCheck = (typeof INTEGRITY_CHECKS)[number]

export const INTEGRITY_CHECK_STATUSES = ['ok', 'findings', 'failed'] as const
export type IntegrityCheckStatus = (typeof INTEGRITY_CHECK_STATUSES)[number]

/** What a finding says; the app and the MCP word each one. */
export const INTEGRITY_FINDING_CODES = [
  'balance_gap',
  'statement_gap',
  'manual_not_reconciled',
  'holding_differs_from_read',
  'owed_negative',
  'repayment_over_transfer',
  'flow_mismatch',
  'internal_move_counted',
] as const
export type IntegrityFindingCode = (typeof INTEGRITY_FINDING_CODES)[number]

export class IntegrityQueryDto {
  @ApiPropertyOptional({
    type: String,
    pattern: MONTH_PATTERN.source,
    example: '2026-10',
    description:
      'Calendar month (YYYY-MM) whose balances and totals are checked. Default: the current month in Europe/Paris.',
  })
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: '$property must be YYYY-MM' })
  month?: string
}

export class IntegrityCheckDto {
  @ApiProperty({ enum: INTEGRITY_CHECKS, enumName: 'IntegrityCheck' })
  key!: IntegrityCheck

  @ApiProperty({
    enum: ['month', 'current'],
    description:
      '`month`: the asked month’s data (balances, totals). `current`: the data as it stands now, whatever the month (crypto holdings, money owed).',
  })
  scope!: 'month' | 'current'

  @ApiProperty({
    enum: INTEGRITY_CHECK_STATUSES,
    enumName: 'IntegrityCheckStatus',
    description:
      '`failed`: the check could not run (logged); the other checks still answer.',
  })
  status!: IntegrityCheckStatus

  @ApiProperty({ type: 'integer', description: 'Findings of this check.' })
  count!: number
}

export class IntegrityFindingDto {
  @ApiProperty({ enum: INTEGRITY_CHECKS, enumName: 'IntegrityCheck' })
  check!: IntegrityCheck

  @ApiProperty({
    enum: INTEGRITY_FINDING_CODES,
    enumName: 'IntegrityFindingCode',
    description: [
      '`balance_gap`: the balance recomputed from the transactions differs from the bank’s running balance that day (rows missing or extra since `fromDate`).',
      '`statement_gap`: a statement closing balance differs from the balance recomputed from the transactions.',
      '`manual_not_reconciled`: a transaction entered by hand on a bank account, dated well inside the imported period, never matched to a bank row: it counts in the totals but not in the balance.',
      '`holding_differs_from_read`: a crypto holding’s quantity differs from what the last complete chain read (or edit) recorded.',
      '`owed_negative`: what is left on a shared expense (share − repaid − let go) is below zero.',
      '`repayment_over_transfer`: the repayments linked to a transfer add up to more than the transfer.',
      '`flow_mismatch`: income − expenses differs from what is shown as saved.',
      '`internal_move_counted`: an income or expense mirrors a transfer of another of the owner’s accounts (opposite amount, at most 3 days apart): a move between own accounts counted as income or spending.',
    ].join(' '),
  })
  code!: IntegrityFindingCode

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  accountId!: string | null

  @ApiProperty({ type: String, nullable: true })
  accountName!: string | null

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description: 'Day of the finding.',
  })
  date!: string | null

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description:
      '`balance_gap`, `statement_gap`: last day the balance followed.',
  })
  fromDate!: string | null

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Integer cents. Gaps: stated − recomputed. `manual_not_reconciled`, `internal_move_counted`: the transaction’s amount. `owed_negative`: what is left (negative). `repayment_over_transfer`: the excess. `flow_mismatch`: (income − expenses) − saved.',
  })
  amountCents!: number | null

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  transactionId!: string | null

  @ApiProperty({
    type: String,
    nullable: true,
    description: '`holding_differs_from_read`: the asset’s symbol.',
  })
  asset!: string | null

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      '`holding_differs_from_read`: quantity held now (exact decimal string).',
  })
  quantity!: string | null

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      '`holding_differs_from_read`: quantity the last complete read recorded (exact decimal string).',
  })
  readQuantity!: string | null
}

/** `GET /api/integrity`: consistency checks computed from stored data. */
export class IntegrityDto {
  @ApiProperty({ type: String, example: '2026-10' })
  month!: string

  @ApiProperty({ type: [IntegrityCheckDto] })
  checks!: IntegrityCheckDto[]

  @ApiProperty({
    type: [IntegrityFindingDto],
    description: 'Every finding, by check then day.',
  })
  findings!: IntegrityFindingDto[]
}
