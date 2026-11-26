import { BadRequestException, Injectable } from '@nestjs/common'
import { AccountsService } from '#/accounts/accounts.service'
import { DatabaseService } from '#/database/database.service'
import { EnvelopesService } from '#/envelopes/envelopes.service'
import type { ShareInputDto } from '#/owed/dto/owed.dto'
import { OwedService } from '#/owed/owed.service'
import { todayInParis } from '#/recurring/dates'
import { RecurringService } from '#/recurring/recurring.service'
import type { TransactionDto } from '../dto/transaction.dto'
import { ManualTransactionsService } from '../manual-transactions.service'
import { TransactionsService } from '../transactions.service'
import type { SaveTransactionEditDto } from './transaction-edit.dto'

/** The services an edit goes through, every one on the same transaction. */
interface Scoped {
  transactions: TransactionsService
  manual: ManualTransactionsService
  owed: OwedService
  recurring: RecurringService
  envelopes: EnvelopesService
}

const hasKeys = (value: object | undefined): value is object =>
  value !== undefined && Object.keys(value).length > 0

/**
 * Saves an edit of the transaction editor at once (#435): every change goes
 * through the service that owns it (its rules, its refusals), all of them on
 * one database transaction, so a refusal anywhere leaves the transaction,
 * its split, shares, repayments and prepaid item as they were.
 *
 * The order lets one save move a transaction from one state to another:
 * what a change could forbid is removed first (unlinked repayments, shares
 * lowered or dropped, a prepaid item made ordinary, a split ended), then the
 * fields, then what they allow (a new split, a prepaid term, shares raised
 * or added, new repayments).
 */
@Injectable()
export class TransactionEditService {
  constructor(private readonly database: DatabaseService) {}

  save(
    id: string,
    dto: SaveTransactionEditDto,
    now: Date = new Date(),
  ): Promise<TransactionDto> {
    return this.database.db.transaction(async (tx) => {
      const database = DatabaseService.within(tx)
      const transactions = new TransactionsService(database)
      const recurring = new RecurringService(database)
      const scoped: Scoped = {
        transactions,
        recurring,
        manual: new ManualTransactionsService(database, transactions),
        owed: new OwedService(database, transactions, recurring),
        envelopes: new EnvelopesService(database, new AccountsService(database)),
      }
      const applied = await this.apply(scoped, id, dto, now)
      if (!applied) throw new BadRequestException('Nothing to update')
      return transactions.findOne(id)
    })
  }

  /** Applies `dto` in order; false when there was nothing to apply. */
  private async apply(
    { transactions, manual, owed, recurring, envelopes }: Scoped,
    id: string,
    dto: SaveTransactionEditDto,
    now: Date,
  ): Promise<boolean> {
    const today = todayInParis(now)
    const current = await transactions.findOne(id)
    let applied = false

    if (dto.manual !== undefined && !current.manual) {
      throw new BadRequestException(
        'Only a transaction entered by hand has its amount, day, label and account edited',
      )
    }

    if (dto.restoreBankValues) {
      await transactions.restoreBankValues(id)
      applied = true
    }

    // What the other changes could forbid, removed first.
    for (const paymentId of dto.repayments?.unlink ?? []) {
      if (!current.repayments.some((r) => r.id === paymentId)) {
        throw new BadRequestException(
          'A repayment to unlink must be linked to this transaction',
        )
      }
      await owed.deletePayment(paymentId)
      applied = true
    }
    const shares = dto.shares
    const lowered = shares && this.lowered(current, shares)
    if (lowered) {
      await owed.replaceShares(id, { ...shares, shares: lowered })
      applied = true
    }
    const term = dto.prepaidTermMonths
    if (term === null && current.prepaidItemId !== null) {
      await recurring.update(current.prepaidItemId, { termMonths: null }, today)
      applied = true
    }
    const envelope = dto.envelope
    const envelopeChanges =
      envelope !== undefined &&
      (envelope === null
        ? current.envelopeId !== null
        : envelope.envelopeId !== current.envelopeId ||
          (envelope.amountCents !== undefined &&
            envelope.amountCents !== current.envelopeAmountCents))
    if (envelopeChanges && current.envelopeId !== null) {
      await envelopes.detach(current.envelopeId, id)
      applied = true
    }
    if (dto.split === null && current.splits.length > 0) {
      await transactions.unsplit(id)
      applied = true
    }

    // The fields.
    if (hasKeys(dto.manual)) {
      await manual.update(id, dto.manual, now)
      applied = true
    }
    if (hasKeys(dto.changes)) {
      await transactions.update(id, dto.changes)
      applied = true
    }

    // What they allow.
    if (dto.split) {
      await transactions.split(id, dto.split.parts)
      applied = true
    }
    if (term !== undefined && term !== null) {
      if (current.prepaidItemId === null) {
        await recurring.declarePrepaid(
          { transactionId: id, termMonths: term },
          today,
        )
        applied = true
      } else if (term !== current.prepaidTermMonths) {
        await recurring.update(
          current.prepaidItemId,
          { termMonths: term },
          today,
        )
        applied = true
      }
    }
    if (shares && !this.sameShares(current, shares, lowered ?? null)) {
      await owed.replaceShares(id, shares)
      applied = true
    }
    if (envelopeChanges && envelope) {
      await envelopes.attach(envelope.envelopeId, {
        transactionId: id,
        amountCents: envelope.amountCents,
      })
      applied = true
    }
    if (dto.repayments?.link) {
      await owed.linkRepayment(
        { transactionId: id, ...dto.repayments.link },
        now,
      )
      applied = true
    }
    return applied
  }

  /** The owner's shares on the line `shares` replaces, as they are now. */
  private sharesNow(
    current: TransactionDto,
    shares: NonNullable<SaveTransactionEditDto['shares']>,
  ) {
    return current.shares.filter(
      (s) =>
        s.direction === 'owed_to_me' && s.splitId === (shares.splitId ?? null),
    )
  }

  /**
   * The shares as they are now, each lowered to its new amount and those
   * dropped left out, when that changes anything (else null): applied
   * before the fields, so an amount lowered with its shares fits them.
   */
  private lowered(
    current: TransactionDto,
    shares: NonNullable<SaveTransactionEditDto['shares']>,
  ): ShareInputDto[] | null {
    const now = this.sharesNow(current, shares)
    const wanted = new Map(
      shares.shares
        .filter((s) => s.contactId !== undefined)
        .map((s) => [s.contactId!, s.amountCents]),
    )
    let changed = false
    const kept: ShareInputDto[] = []
    for (const share of now) {
      const amount = wanted.get(share.contactId)
      if (amount === undefined) {
        changed = true
        continue
      }
      if (amount < share.amountCents) changed = true
      kept.push({
        contactId: share.contactId,
        amountCents: Math.min(amount, share.amountCents),
      })
    }
    return changed ? kept : null
  }

  /** Whether the shares wanted are already those of the line. */
  private sameShares(
    current: TransactionDto,
    shares: NonNullable<SaveTransactionEditDto['shares']>,
    lowered: ShareInputDto[] | null,
  ): boolean {
    const now: { contactId?: string; amountCents: number }[] =
      lowered ?? this.sharesNow(current, shares)
    if (now.length !== shares.shares.length) return false
    return shares.shares.every(
      (wanted) =>
        wanted.contactId !== undefined &&
        now.some(
          (s) =>
            s.contactId === wanted.contactId &&
            s.amountCents === wanted.amountCents,
        ),
    )
  }
}
