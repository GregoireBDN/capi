import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  ne,
  type SQL,
  sql,
} from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { randomUUID } from 'node:crypto'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  categoriesTable,
  contactsTable,
  receivablePaymentsTable,
  receivablesTable,
  recurringItemsTable,
  transactionSplitsTable,
  transactionsTable,
} from '#/database/schema'
import type { ReceivableDirection } from '#/database/schema/domain-enums'
import { daysBetween, todayInParis } from '#/recurring/dates'
import { RecurringService } from '#/recurring/recurring.service'
import type { TransactionDto } from '#/transactions/dto/transaction.dto'
import { TransactionsService } from '#/transactions/transactions.service'
import {
  type ContactDirectionDto,
  type ContactDto,
  type ContactOwedDto,
  type ContactRefDto,
  type CreateContactDto,
  type CreateDebtDto,
  type CreateSharesDto,
  type ExpectedRepaymentDto,
  type ForgiveReceivableDto,
  type LinkRepaymentDto,
  type LinkRepaymentResultDto,
  type OwedContactRowDto,
  type OwedListDto,
  type OwedSummaryDto,
  type ReceivableDto,
  type ReceivablePaymentDto,
  type ReceivableState,
  type RecurringShareInfoDto,
  type RepaymentOptionsDto,
  type RepaymentSuggestionDto,
  type ReplaceSharesDto,
  type SetRecurringShareDto,
  type ShareInputDto,
  type UpdateContactDto,
  type UpdateReceivableDto,
} from './dto/owed.dto'
import {
  type ChargeReceivable,
  expectedRepayments,
  type SharedRecurringItem,
} from './expected'
import { applyRecurringShares } from './recurring-shares'
import { labelMatches, suggestRepayment } from './suggest'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx

/** Days back the review queue looks for repayment transfers. */
export const SUGGESTION_DAYS = 60
/** Repayment suggestions listed at most. */
const SUGGESTIONS_MAX = 20

/** A transaction line: the transaction, or one part of a split. */
interface Line {
  transactionId: string
  splitId: string | null
  accountId: string | null
  paidByContactId: string | null
  kind: TransactionDto['kind']
  bookingDate: string
  /** Signed cents of the line. */
  amountCents: number
  label: string
  /** The bank's label, matched with a contact's bank words. */
  rawLabel: string
}

/** Paid so far on each receivable. */
const paidSubquery = (executor: Executor) =>
  executor
    .select({
      receivableId: receivablePaymentsTable.receivableId,
      paidCents:
        sql<number>`coalesce(sum(${receivablePaymentsTable.amountCents}), 0)::bigint`
          .mapWith(Number)
          .as('paid_cents'),
    })
    .from(receivablePaymentsTable)
    .groupBy(receivablePaymentsTable.receivableId)
    .as('paid')

export function receivableState(row: {
  amountCents: number
  repaidCents: number
  forgivenAt: Date | null
}): ReceivableState {
  if (row.forgivenAt !== null) return 'forgiven'
  return row.repaidCents >= row.amountCents ? 'repaid' : 'open'
}

/** What is still owed: nothing once repaid or let go. */
export function leftCents(row: {
  amountCents: number
  repaidCents: number
  forgivenAt: Date | null
}): number {
  if (row.forgivenAt !== null) return 0
  return Math.max(0, row.amountCents - row.repaidCents)
}

/**
 * Money owed between the owner and the people around him (#359): contacts,
 * what they owe him on the expenses he advanced (`owed_to_me`), what he owes
 * them on the expenses they paid for him (`i_owe`, « Payé pour moi »), and
 * the repayments linked to them. States are computed, nothing is deleted
 * when a debt is settled or let go. Statistics read the owner's part through
 * the `transaction_lines` view; names, labels and amounts are never logged.
 */
@Injectable()
export class OwedService {
  constructor(
    private readonly database: DatabaseService,
    private readonly transactions: TransactionsService,
    private readonly recurring: RecurringService,
  ) {}

  private get db(): Db {
    return this.database.db
  }

  // --- Contacts -------------------------------------------------------------

  async listContacts(includeArchived = false): Promise<ContactDto[]> {
    const rows = await this.db
      .select()
      .from(contactsTable)
      .where(includeArchived ? undefined : isNull(contactsTable.archivedAt))
      .orderBy(asc(sql`lower(${contactsTable.name})`))
    const balances = await this.balances(this.db)
    return rows.map((row) => this.toContact(row, balances))
  }

  async createContact(dto: CreateContactDto): Promise<ContactDto> {
    return this.db.transaction(async (tx) => {
      await this.assertNameFree(tx, dto.name)
      const [row] = await tx
        .insert(contactsTable)
        .values({
          name: dto.name,
          matchLabels: cleanLabels(dto.matchLabels ?? []),
          repaymentDay: dto.repaymentDay ?? null,
        })
        .returning()
      return this.toContact(row, new Map())
    })
  }

  async updateContact(id: string, dto: UpdateContactDto): Promise<ContactDto> {
    return this.db.transaction(async (tx) => {
      const current = await this.requireContact(tx, id)
      const set: Partial<typeof contactsTable.$inferInsert> = {}
      if (dto.name !== undefined && dto.name !== current.name) {
        await this.assertNameFree(tx, dto.name, id)
        set.name = dto.name
      }
      if (dto.matchLabels !== undefined) {
        set.matchLabels = cleanLabels(dto.matchLabels)
      }
      if (dto.repaymentDay !== undefined) set.repaymentDay = dto.repaymentDay
      if (dto.archived !== undefined) {
        set.archivedAt = dto.archived
          ? (current.archivedAt ?? new Date())
          : null
      }
      const [row] =
        Object.keys(set).length === 0
          ? [current]
          : await tx
              .update(contactsTable)
              .set(set)
              .where(eq(contactsTable.id, id))
              .returning()
      return this.toContact(row, await this.balances(tx))
    })
  }

  /** Deletes a contact never used; one with history is archived instead. */
  async deleteContact(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.requireContact(tx, id)
      const [used] = await tx
        .select({ id: receivablesTable.id })
        .from(receivablesTable)
        .where(eq(receivablesTable.contactId, id))
        .limit(1)
      const [shared] = await tx
        .select({ id: recurringItemsTable.id })
        .from(recurringItemsTable)
        .where(eq(recurringItemsTable.shareContactId, id))
        .limit(1)
      if (used || shared) {
        throw new ConflictException(
          'This contact has a history: archive it instead',
        )
      }
      await tx.delete(contactsTable).where(eq(contactsTable.id, id))
    })
  }

  // --- Owed to me: shares of an expense -------------------------------------

  /**
   * Adds what each person owes on an expense the owner paid (`owed_to_me`).
   * 409 when one of them already has a share of it; 400 when the shares
   * would exceed the expense.
   */
  async createShares(dto: CreateSharesDto): Promise<TransactionDto> {
    await this.db.transaction(async (tx) => {
      const line = await this.expenseLine(tx, dto.transactionId, dto.splitId)
      const contacts = await this.resolveShareContacts(tx, dto.shares)
      const existing = await this.sharesOn(tx, line.transactionId)
      for (const { contactId } of contacts) {
        if (existing.some((share) => share.contactId === contactId)) {
          throw new ConflictException(
            'This person already has a share of this expense',
          )
        }
      }
      const total = contacts.reduce((sum, share) => sum + share.amountCents, 0)
      const used = await this.usedOnLine(tx, line)
      if (used + total > Math.abs(line.amountCents)) {
        throw new BadRequestException('The shares exceed the expense')
      }
      await tx.insert(receivablesTable).values(
        contacts.map((share) => ({
          direction: 'owed_to_me' as const,
          transactionId: line.transactionId,
          splitId: line.splitId,
          contactId: share.contactId,
          amountCents: share.amountCents,
          note: dto.note ?? null,
        })),
      )
    })
    return this.transactions.findOne(dto.transactionId)
  }

  /**
   * Sets everyone an expense is shared with (« Partager »): listed people
   * get or keep a share of that amount, the others lose theirs. A share
   * cannot go below what was repaid on it, and one partly repaid or let go
   * cannot be removed (409).
   */
  async replaceShares(
    transactionId: string,
    dto: ReplaceSharesDto,
  ): Promise<TransactionDto> {
    await this.db.transaction(async (tx) => {
      const line = await this.expenseLine(tx, transactionId, dto.splitId)
      const contacts = await this.resolveShareContacts(tx, dto.shares)
      const existing = await this.receivableRows(
        tx,
        and(
          eq(receivablesTable.transactionId, transactionId),
          eq(receivablesTable.direction, 'owed_to_me'),
        ),
      )
      const wanted = new Map(contacts.map((c) => [c.contactId, c.amountCents]))
      for (const row of existing) {
        const amount = wanted.get(row.contactId)
        if (amount === undefined) {
          if (row.repaidCents > 0 || row.forgivenAt !== null) {
            throw new ConflictException(
              'A share already repaid or let go cannot be removed',
            )
          }
        } else if (amount < row.repaidCents) {
          throw new BadRequestException(
            'A share cannot be less than what was repaid on it',
          )
        }
      }
      const total = contacts.reduce((sum, c) => sum + c.amountCents, 0)
      const otherUse = await this.usedOnLine(tx, line, { sharesToo: false })
      if (otherUse + total > Math.abs(line.amountCents)) {
        throw new BadRequestException('The shares exceed the expense')
      }
      const removed = existing.filter((row) => !wanted.has(row.contactId))
      if (removed.length > 0) {
        await tx.delete(receivablesTable).where(
          inArray(
            receivablesTable.id,
            removed.map((row) => row.id),
          ),
        )
      }
      for (const row of existing) {
        const amount = wanted.get(row.contactId)
        if (amount !== undefined && amount !== row.amountCents) {
          await tx
            .update(receivablesTable)
            .set({ amountCents: amount, splitId: line.splitId })
            .where(eq(receivablesTable.id, row.id))
        }
      }
      const added = contacts.filter(
        (c) => !existing.some((row) => row.contactId === c.contactId),
      )
      if (added.length > 0) {
        await tx.insert(receivablesTable).values(
          added.map((share) => ({
            direction: 'owed_to_me' as const,
            transactionId,
            splitId: line.splitId,
            contactId: share.contactId,
            amountCents: share.amountCents,
          })),
        )
      }
    })
    return this.transactions.findOne(transactionId)
  }

  // --- I owe: « Payé pour moi » ---------------------------------------------

  /**
   * Notes an expense a contact paid for the owner (« Payé pour moi »): a
   * manual expense without an account holding his part, in its category on
   * its day, and the `i_owe` receivable of that part (the bill kept beside).
   */
  async createDebt(
    dto: CreateDebtDto,
    now: Date = new Date(),
  ): Promise<TransactionDto> {
    if (dto.partCents > dto.billCents) {
      throw new BadRequestException('partCents cannot exceed billCents')
    }
    const id = await this.db.transaction(async (tx) => {
      const contactId = await this.resolveContact(tx, dto)
      const [category] = await tx
        .select({
          id: categoriesTable.id,
          name: categoriesTable.name,
          kind: categoriesTable.kind,
        })
        .from(categoriesTable)
        .where(eq(categoriesTable.id, dto.categoryId))
      if (!category) {
        throw new BadRequestException('categoryId does not match any category')
      }
      if (category.kind !== 'expense') {
        throw new BadRequestException('categoryId must be an expense category')
      }
      const today = todayInParis(now)
      const bookingDate = dto.bookingDate ?? today
      if (bookingDate > today) {
        throw new BadRequestException('bookingDate cannot be in the future')
      }
      const [row] = await tx
        .insert(transactionsTable)
        .values({
          accountId: null,
          paidByContactId: contactId,
          bookingDate,
          amountCents: -dto.partCents,
          rawLabel: dto.label ?? category.name,
          kind: 'expense',
          categoryId: category.id,
          needsReview: false,
          note: dto.note ?? null,
          manual: true,
          dedupeHash: `manual:${randomUUID()}`,
        })
        .returning({ id: transactionsTable.id })
      await tx.insert(receivablesTable).values({
        direction: 'i_owe',
        transactionId: row.id,
        contactId,
        amountCents: dto.partCents,
        billCents: dto.billCents,
      })
      return row.id
    })
    return this.transactions.findOne(id)
  }

  // --- One item -------------------------------------------------------------

  async updateReceivable(
    id: string,
    dto: UpdateReceivableDto,
  ): Promise<ReceivableDto> {
    await this.db.transaction(async (tx) => {
      const [row] = await this.receivableRows(tx, eq(receivablesTable.id, id), {
        lock: true,
      })
      if (!row) throw new NotFoundException('Receivable not found')
      const set: Partial<typeof receivablesTable.$inferInsert> = {}
      if (dto.note !== undefined) set.note = dto.note
      if (
        dto.amountCents !== undefined &&
        dto.amountCents !== row.amountCents
      ) {
        if (dto.amountCents < row.repaidCents) {
          throw new BadRequestException(
            'A share cannot be less than what was repaid on it',
          )
        }
        if (row.direction === 'i_owe') {
          if (row.billCents !== null && dto.amountCents > row.billCents) {
            throw new BadRequestException('partCents cannot exceed billCents')
          }
          // The owner's part is the expense « Payé pour moi » itself.
          await tx
            .update(transactionsTable)
            .set({ amountCents: -dto.amountCents })
            .where(eq(transactionsTable.id, row.transactionId))
        } else {
          const line = await this.expenseLine(
            tx,
            row.transactionId,
            row.splitId ?? undefined,
          )
          const used = await this.usedOnLine(tx, line)
          if (
            used - row.amountCents + dto.amountCents >
            Math.abs(line.amountCents)
          ) {
            throw new BadRequestException('The shares exceed the expense')
          }
        }
        set.amountCents = dto.amountCents
      }
      if (Object.keys(set).length > 0) {
        await tx
          .update(receivablesTable)
          .set(set)
          .where(eq(receivablesTable.id, id))
      }
    })
    return this.findReceivable(id)
  }

  /**
   * Removes an item. What the owner owes goes with its expense « Payé pour
   * moi »; a share of an expense the owner paid leaves the expense as it is.
   */
  async deleteReceivable(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          direction: receivablesTable.direction,
          transactionId: receivablesTable.transactionId,
        })
        .from(receivablesTable)
        .where(eq(receivablesTable.id, id))
        .for('update')
      if (!row) throw new NotFoundException('Receivable not found')
      if (row.direction === 'i_owe') {
        await tx
          .delete(transactionsTable)
          .where(eq(transactionsTable.id, row.transactionId))
      } else {
        await tx.delete(receivablesTable).where(eq(receivablesTable.id, id))
      }
    })
  }

  /**
   * « Je ne me fais pas rembourser » (or « … ne veut pas être remboursé »):
   * what was not repaid by now is let go. The item stays in the history.
   */
  async forgive(
    id: string,
    dto: ForgiveReceivableDto,
    now: Date = new Date(),
  ): Promise<ReceivableDto> {
    await this.db.transaction(async (tx) => {
      const [row] = await this.receivableRows(tx, eq(receivablesTable.id, id), {
        lock: true,
      })
      if (!row) throw new NotFoundException('Receivable not found')
      if (row.forgivenAt !== null) {
        throw new ConflictException('Already let go')
      }
      if (row.repaidCents >= row.amountCents) {
        throw new BadRequestException('Already repaid: nothing to let go')
      }
      await tx
        .update(receivablesTable)
        .set({ forgivenAt: now, forgivenNote: dto.note ?? null })
        .where(eq(receivablesTable.id, id))
    })
    return this.findReceivable(id)
  }

  /** « Réclamer à nouveau »: the item is owed again. */
  async unforgive(id: string): Promise<ReceivableDto> {
    const [row] = await this.db
      .update(receivablesTable)
      .set({ forgivenAt: null, forgivenNote: null })
      .where(eq(receivablesTable.id, id))
      .returning({ id: receivablesTable.id })
    if (!row) throw new NotFoundException('Receivable not found')
    return this.findReceivable(id)
  }

  // --- Repayments -----------------------------------------------------------

  /**
   * Links a repayment to one or several items, partly or in full: an
   * incoming transfer for what is owed to the owner, an outgoing one for
   * what he owes, or « Réglé autrement » without a transfer. The linked
   * part settles the items (neither income nor spending); what is left of
   * the transfer stays in its own category. Nothing goes past the transfer
   * or past what is left on an item.
   */
  async linkRepayment(
    dto: LinkRepaymentDto,
    now: Date = new Date(),
  ): Promise<LinkRepaymentResultDto> {
    const ids = dto.items.map((item) => item.receivableId)
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('An item is listed twice')
    }
    const today = todayInParis(now)
    const result = await this.db.transaction(async (tx) => {
      const rows = await this.receivableRows(
        tx,
        inArray(receivablesTable.id, ids),
        { lock: true },
      )
      if (rows.length !== ids.length) {
        throw new BadRequestException('receivableId does not match any item')
      }
      const directions = new Set(rows.map((row) => row.direction))
      if (directions.size > 1) {
        throw new BadRequestException(
          'One repayment settles items of one direction',
        )
      }
      const byId = new Map(rows.map((row) => [row.id, row]))
      for (const item of dto.items) {
        const row = byId.get(item.receivableId)!
        if (row.forgivenAt !== null) {
          throw new BadRequestException('This item was let go')
        }
        if (item.amountCents > leftCents(row)) {
          throw new BadRequestException(
            'The repayment exceeds what is left on an item',
          )
        }
      }
      const linked = dto.items.reduce((sum, item) => sum + item.amountCents, 0)

      let paidOn: string
      let restCents: number | null = null
      let line: Line | null = null
      if (dto.transactionId !== undefined) {
        line = await this.lockLine(tx, dto.transactionId, dto.splitId)
        if (line.accountId === null) {
          throw new BadRequestException(
            'An expense paid by a contact cannot be a repayment',
          )
        }
        const direction: ReceivableDirection =
          line.amountCents > 0 ? 'owed_to_me' : 'i_owe'
        if (!directions.has(direction)) {
          throw new BadRequestException(
            line.amountCents > 0
              ? 'Money in repays what is owed to the owner'
              : 'Money out repays what the owner owes',
          )
        }
        if (rows.some((row) => row.transactionId === line!.transactionId)) {
          throw new BadRequestException('An expense cannot repay itself')
        }
        const available =
          Math.abs(line.amountCents) - (await this.usedOnLine(tx, line))
        if (linked > available) {
          throw new BadRequestException('The repayment exceeds the transfer')
        }
        paidOn = line.bookingDate
        restCents = available - linked
      } else {
        if (dto.splitId !== undefined) {
          throw new BadRequestException('splitId needs a transactionId')
        }
        paidOn = dto.paidOn ?? today
        if (paidOn > today) {
          throw new BadRequestException('paidOn cannot be in the future')
        }
      }
      const inserted = await tx
        .insert(receivablePaymentsTable)
        .values(
          dto.items.map((item) => ({
            receivableId: item.receivableId,
            transactionId: line?.transactionId ?? null,
            splitId: line?.splitId ?? null,
            amountCents: item.amountCents,
            paidOn,
            note: dto.note ?? null,
          })),
        )
        .returning()
      return {
        payments: inserted.map((p) => ({
          id: p.id,
          receivableId: p.receivableId,
          transactionId: p.transactionId,
          amountCents: p.amountCents,
          paidOn: p.paidOn,
          note: p.note,
          label: line?.label ?? null,
        })),
        linkedCents: linked,
        restCents,
      }
    })
    return result
  }

  /** Unlinks a repayment (undo). */
  async deletePayment(id: string): Promise<void> {
    const deleted = await this.db
      .delete(receivablePaymentsTable)
      .where(eq(receivablePaymentsTable.id, id))
      .returning({ id: receivablePaymentsTable.id })
    if (deleted.length === 0) throw new NotFoundException('Payment not found')
  }

  /**
   * What a transfer can repay (« C'est un remboursement › », « Je
   * rembourse … › »): the people with something open in its direction (the
   * one whose bank words match its label first), that person's open items
   * oldest first, and the suggestion to tick.
   */
  async repaymentOptions(
    transactionId: string,
    contactId?: string,
    splitId?: string,
  ): Promise<RepaymentOptionsDto> {
    const line = await this.lockLine(this.db, transactionId, splitId, false)
    if (line.accountId === null) {
      throw new BadRequestException(
        'An expense paid by a contact cannot be a repayment',
      )
    }
    const direction: ReceivableDirection =
      line.amountCents > 0 ? 'owed_to_me' : 'i_owe'
    const used = await this.usedOnLine(this.db, line)
    const linkedCents = await this.linkedFromLine(this.db, line)
    const available = Math.max(0, Math.abs(line.amountCents) - used)

    const open = (
      await this.receivableRows(
        this.db,
        and(
          eq(receivablesTable.direction, direction),
          isNull(receivablesTable.forgivenAt),
          ne(receivablesTable.transactionId, transactionId),
        ),
      )
    ).filter((row) => leftCents(row) > 0)
    const contacts = await this.db
      .select()
      .from(contactsTable)
      .where(
        inArray(contactsTable.id, [
          ...new Set(open.map((row) => row.contactId)),
          ...(contactId ? [contactId] : []),
          '00000000-0000-0000-0000-000000000000',
        ]),
      )
    const owedBy = new Map<string, number>()
    for (const row of open) {
      owedBy.set(
        row.contactId,
        (owedBy.get(row.contactId) ?? 0) + leftCents(row),
      )
    }
    const options = contacts
      .map((c) => ({
        id: c.id,
        name: c.name,
        owedCents: owedBy.get(c.id) ?? 0,
        matched:
          labelMatches(line.rawLabel, c.matchLabels) ||
          labelMatches(line.label, c.matchLabels),
      }))
      .sort(
        (a, b) =>
          Number(b.matched) - Number(a.matched) ||
          b.owedCents - a.owedCents ||
          a.name.localeCompare(b.name, 'fr'),
      )
    const selected = contactId ?? options[0]?.id ?? null
    const items = selected
      ? await this.toReceivables(
          this.db,
          open
            .filter((row) => row.contactId === selected)
            .sort(
              (a, b) =>
                a.bookingDate.localeCompare(b.bookingDate) ||
                a.id.localeCompare(b.id),
            ),
        )
      : []
    const suggestion = suggestRepayment(
      available,
      items.map((item) => ({
        id: item.id,
        date: item.bookingDate,
        leftCents: item.leftCents,
      })),
    )
    return {
      transactionId,
      splitId: line.splitId,
      direction,
      amountCents: Math.abs(line.amountCents),
      linkedCents,
      availableCents: available,
      contacts: options,
      contactId: selected,
      items,
      suggestion: suggestion.links,
      exact: suggestion.exact,
    }
  }

  /**
   * Repayments to confirm in the review queue (« Remboursement de Camille
   * ? »): transfers of the last `SUGGESTION_DAYS` days not linked yet, whose
   * label matches a contact's bank words and whose amount is exactly some of
   * that contact's open items in its direction.
   */
  async repaymentSuggestions(
    now: Date = new Date(),
  ): Promise<RepaymentSuggestionDto[]> {
    const contacts = (
      await this.db
        .select()
        .from(contactsTable)
        .where(isNull(contactsTable.archivedAt))
    ).filter((c) => c.matchLabels.length > 0)
    if (contacts.length === 0) return []
    const open = (
      await this.receivableRows(this.db, isNull(receivablesTable.forgivenAt))
    ).filter((row) => leftCents(row) > 0)
    if (open.length === 0) return []
    const today = todayInParis(now)
    const t = transactionsTable
    const candidates = await this.db
      .select({
        id: t.id,
        bookingDate: t.bookingDate,
        amountCents: t.amountCents,
        rawLabel: t.rawLabel,
        merchant: t.merchant,
      })
      .from(t)
      .where(
        and(
          isNotNull(t.accountId),
          gte(t.bookingDate, sql`(${today}::date - ${SUGGESTION_DAYS}::int)`),
          sql`not exists (select 1 from ${receivablePaymentsTable} where ${receivablePaymentsTable.transactionId} = ${t.id})`,
          sql`not exists (select 1 from ${receivablesTable} where ${receivablesTable.transactionId} = ${t.id})`,
          sql`not exists (select 1 from ${transactionSplitsTable} where ${transactionSplitsTable.transactionId} = ${t.id})`,
        ),
      )
      .orderBy(desc(t.bookingDate), desc(t.id))
    const result: RepaymentSuggestionDto[] = []
    const taken = new Set<string>()
    for (const row of candidates) {
      if (result.length >= SUGGESTIONS_MAX) break
      const direction: ReceivableDirection =
        row.amountCents > 0 ? 'owed_to_me' : 'i_owe'
      const contact = contacts.find((c) =>
        labelMatches(row.rawLabel, c.matchLabels),
      )
      if (!contact) continue
      const items = open.filter(
        (item) =>
          item.contactId === contact.id &&
          item.direction === direction &&
          item.bookingDate <= row.bookingDate &&
          !taken.has(item.id),
      )
      const suggestion = suggestRepayment(
        Math.abs(row.amountCents),
        items.map((item) => ({
          id: item.id,
          date: item.bookingDate,
          leftCents: leftCents(item),
        })),
      )
      if (!suggestion.exact) continue
      for (const link of suggestion.links) taken.add(link.receivableId)
      result.push({
        transactionId: row.id,
        bookingDate: row.bookingDate,
        label: row.merchant ?? row.rawLabel,
        amountCents: row.amountCents,
        direction,
        contactId: contact.id,
        contactName: contact.name,
        links: suggestion.links,
      })
    }
    return result
  }

  // --- Reading --------------------------------------------------------------

  /** « Entre proches »: both lists, per person, and this month's expected. */
  async summary(now: Date = new Date()): Promise<OwedSummaryDto> {
    const today = todayInParis(now)
    const month = today.slice(0, 7)
    const [rows, contacts, expected] = await Promise.all([
      this.receivableRows(this.db),
      this.db.select().from(contactsTable),
      this.expected(month, today),
    ])
    const names = new Map(contacts.map((c) => [c.id, c.name]))
    return {
      today,
      month,
      owedToMe: this.list(rows, 'owed_to_me', names, today),
      iOwe: this.list(rows, 'i_owe', names, today),
      expected,
    }
  }

  async contactOwed(
    id: string,
    now: Date = new Date(),
  ): Promise<ContactOwedDto> {
    const today = todayInParis(now)
    const contact = await this.requireContact(this.db, id)
    const rows = await this.receivableRows(
      this.db,
      eq(receivablesTable.contactId, id),
    )
    const items = await this.toReceivables(this.db, rows)
    const direction = (d: ReceivableDirection): ContactDirectionDto => {
      const mine = items.filter((item) => item.direction === d)
      return {
        totals: {
          totalCents: sum(mine.map((item) => item.amountCents)),
          repaidCents: sum(mine.map((item) => item.repaidCents)),
          forgivenCents: sum(
            mine
              .filter((item) => item.state === 'forgiven')
              .map((item) => Math.max(0, item.amountCents - item.repaidCents)),
          ),
          openCents: sum(mine.map((item) => item.leftCents)),
        },
        open: mine
          .filter((item) => item.state === 'open')
          .sort(
            (a, b) =>
              a.bookingDate.localeCompare(b.bookingDate) ||
              a.id.localeCompare(b.id),
          ),
        history: mine
          .filter((item) => item.state !== 'open')
          .sort(
            (a, b) =>
              b.bookingDate.localeCompare(a.bookingDate) ||
              b.id.localeCompare(a.id),
          ),
      }
    }
    const shared = await this.db
      .select({
        id: recurringItemsTable.id,
        name: recurringItemsTable.name,
        bps: recurringItemsTable.shareBps,
        amountCents: recurringItemsTable.shareAmountCents,
        from: recurringItemsTable.shareFrom,
      })
      .from(recurringItemsTable)
      .where(eq(recurringItemsTable.shareContactId, id))
      .orderBy(asc(recurringItemsTable.name))
    const balances = new Map([
      [
        id,
        {
          owedToMe: sum(
            items
              .filter((item) => item.direction === 'owed_to_me')
              .map((item) => item.leftCents),
          ),
          iOwe: sum(
            items
              .filter((item) => item.direction === 'i_owe')
              .map((item) => item.leftCents),
          ),
        },
      ],
    ])
    return {
      contact: this.toContact(contact, balances),
      owedToMe: direction('owed_to_me'),
      iOwe: direction('i_owe'),
      expected: (await this.expected(today.slice(0, 7), today)).filter(
        (item) => item.contactId === id,
      ),
      sharedItems: shared.map((item) => ({
        recurringItemId: item.id,
        name: item.name,
        share: {
          contactId: id,
          contactName: contact.name,
          bps: item.bps,
          amountCents: item.amountCents,
          from: item.from!,
        },
      })),
    }
  }

  async findReceivable(id: string): Promise<ReceivableDto> {
    const rows = await this.receivableRows(this.db, eq(receivablesTable.id, id))
    if (rows.length === 0) throw new NotFoundException('Receivable not found')
    const [item] = await this.toReceivables(this.db, rows)
    return item
  }

  /** Items of some expenses (a page of transactions), by expense. */
  async receivablesOf(transactionIds: string[]): Promise<ReceivableDto[]> {
    if (transactionIds.length === 0) return []
    return this.toReceivables(
      this.db,
      await this.receivableRows(
        this.db,
        inArray(receivablesTable.transactionId, transactionIds),
      ),
    )
  }

  /**
   * This month's repayments expected from the recurring items shared with a
   * contact, from their booked charges and the ones still expected.
   */
  async expected(
    month: string,
    today: string = todayInParis(),
  ): Promise<ExpectedRepaymentDto[]> {
    const shared = await this.db
      .select({
        id: recurringItemsTable.id,
        contactId: recurringItemsTable.shareContactId,
        bps: recurringItemsTable.shareBps,
        amountCents: recurringItemsTable.shareAmountCents,
        from: recurringItemsTable.shareFrom,
        contactName: contactsTable.name,
        repaymentDay: contactsTable.repaymentDay,
      })
      .from(recurringItemsTable)
      .innerJoin(
        contactsTable,
        eq(contactsTable.id, recurringItemsTable.shareContactId),
      )
      .where(eq(recurringItemsTable.status, 'confirmed'))
    if (shared.length === 0) return []
    const byId = new Map(shared.map((item) => [item.id, item]))
    const items = (await this.recurring.list('confirmed', today))
      .filter((item) => byId.has(item.id) && item.direction === 'debit')
      .map((item): SharedRecurringItem => {
        const share = byId.get(item.id)!
        return {
          id: item.id,
          name: item.name,
          accountId: item.accountId,
          contactId: share.contactId!,
          contactName: share.contactName,
          repaymentDay: share.repaymentDay,
          share: { bps: share.bps, amountCents: share.amountCents },
          shareFrom: share.from!,
          typicalAmountCents: item.typicalAmountCents,
          nextExpectedDate: item.nextExpectedDate,
          active: item.active,
          endedOn: item.endedOn,
          occurrences: item.occurrences,
        }
      })
    const transactionIds = items.flatMap((item) =>
      item.occurrences
        .filter((o) => o.date.startsWith(month))
        .map((o) => o.transactionId),
    )
    const receivables =
      transactionIds.length === 0
        ? []
        : await this.receivableRows(
            this.db,
            and(
              inArray(receivablesTable.transactionId, transactionIds),
              eq(receivablesTable.direction, 'owed_to_me'),
            ),
          )
    const byCharge = new Map<string, ChargeReceivable>(
      receivables.map((row) => [
        `${row.transactionId}|${row.contactId}`,
        {
          id: row.id,
          amountCents: row.amountCents,
          repaidCents: row.repaidCents,
          forgiven: row.forgivenAt !== null,
        },
      ]),
    )
    return expectedRepayments(items, month, (transactionId, contactId) =>
      byCharge.get(`${transactionId}|${contactId}`),
    )
  }

  // --- Recurring items shared with a contact ---------------------------------

  /**
   * Shares a confirmed recurring debit with a contact (the partner case):
   * each charge booked from `from` on gets their receivable, unless it has
   * a share of its own. Changing the share changes later charges only.
   */
  async setRecurringShare(
    itemId: string,
    dto: SetRecurringShareDto,
    now: Date = new Date(),
  ): Promise<RecurringShareInfoDto> {
    return this.db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(recurringItemsTable)
        .where(eq(recurringItemsTable.id, itemId))
        .for('update')
      if (!item) throw new NotFoundException('Recurring item not found')
      if (item.status !== 'confirmed' || item.direction !== 'debit') {
        throw new BadRequestException(
          'Only a confirmed recurring debit can be shared',
        )
      }
      if (dto.bps !== undefined && dto.amountCents !== undefined) {
        throw new BadRequestException('Give bps or amountCents, not both')
      }
      const contactId = await this.resolveContact(tx, dto)
      const from = dto.from ?? `${todayInParis(now).slice(0, 7)}-01`
      const sameContact = item.shareContactId === contactId
      await tx
        .update(recurringItemsTable)
        .set({
          shareContactId: contactId,
          shareBps: dto.bps ?? null,
          shareAmountCents: dto.amountCents ?? null,
          shareFrom: from,
          // Shared with someone new: every charge since `from` is looked at.
          shareAppliedAt:
            sameContact && item.shareFrom === from ? item.shareAppliedAt : null,
        })
        .where(eq(recurringItemsTable.id, itemId))
      await applyRecurringShares(tx, itemId)
      const [contact] = await tx
        .select({ name: contactsTable.name })
        .from(contactsTable)
        .where(eq(contactsTable.id, contactId))
      return {
        contactId,
        contactName: contact.name,
        bps: dto.bps ?? null,
        amountCents: dto.amountCents ?? null,
        from,
      }
    })
  }

  /** Stops sharing a recurring item; the shares already made stay. */
  async clearRecurringShare(itemId: string): Promise<void> {
    const updated = await this.db
      .update(recurringItemsTable)
      .set({
        shareContactId: null,
        shareBps: null,
        shareAmountCents: null,
        shareFrom: null,
        shareAppliedAt: null,
      })
      .where(eq(recurringItemsTable.id, itemId))
      .returning({ id: recurringItemsTable.id })
    if (updated.length === 0) {
      throw new NotFoundException('Recurring item not found')
    }
  }

  // --- Helpers --------------------------------------------------------------

  private list(
    rows: ReceivableRow[],
    direction: ReceivableDirection,
    names: Map<string, string>,
    today: string,
  ): OwedListDto {
    const byContact = new Map<string, ReceivableRow[]>()
    for (const row of rows) {
      if (row.direction !== direction) continue
      const list = byContact.get(row.contactId) ?? []
      list.push(row)
      byContact.set(row.contactId, list)
    }
    const contacts: OwedContactRowDto[] = []
    const settled: OwedContactRowDto[] = []
    for (const [contactId, items] of byContact) {
      const open = items.filter((row) => leftCents(row) > 0)
      const oldest = open.map((row) => row.bookingDate).sort()[0] ?? null
      const entry = {
        contactId,
        name: names.get(contactId) ?? '',
        owedCents: sum(open.map(leftCents)),
        openCount: open.length,
        oldestOpenDate: oldest,
        oldestOpenDays: oldest === null ? null : daysBetween(oldest, today),
      }
      ;(entry.owedCents > 0 ? contacts : settled).push(entry)
    }
    contacts.sort(
      (a, b) => b.owedCents - a.owedCents || a.name.localeCompare(b.name, 'fr'),
    )
    settled.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    return {
      totalCents: sum(contacts.map((c) => c.owedCents)),
      contacts,
      settled,
    }
  }

  /** Open totals per contact, both directions. */
  private async balances(
    executor: Executor,
  ): Promise<Map<string, { owedToMe: number; iOwe: number }>> {
    const rows = await this.receivableRows(
      executor,
      isNull(receivablesTable.forgivenAt),
    )
    const result = new Map<string, { owedToMe: number; iOwe: number }>()
    for (const row of rows) {
      const entry = result.get(row.contactId) ?? { owedToMe: 0, iOwe: 0 }
      if (row.direction === 'owed_to_me') entry.owedToMe += leftCents(row)
      else entry.iOwe += leftCents(row)
      result.set(row.contactId, entry)
    }
    return result
  }

  private toContact(
    row: typeof contactsTable.$inferSelect,
    balances: Map<string, { owedToMe: number; iOwe: number }>,
  ): ContactDto {
    const balance = balances.get(row.id)
    return {
      id: row.id,
      name: row.name,
      matchLabels: row.matchLabels,
      repaymentDay: row.repaymentDay,
      archivedAt: row.archivedAt,
      owedToMeCents: balance?.owedToMe ?? 0,
      iOweCents: balance?.iOwe ?? 0,
    }
  }

  /** Receivables with what was paid on them and their expense's day. */
  private async receivableRows(
    executor: Executor,
    where?: SQL,
    { lock = false }: { lock?: boolean } = {},
  ): Promise<ReceivableRow[]> {
    if (lock) {
      // Lock the items first, then read them with their payments.
      await executor
        .select({ id: receivablesTable.id })
        .from(receivablesTable)
        .where(where)
        .for('update')
    }
    const paid = paidSubquery(executor)
    const r = receivablesTable
    return executor
      .select({
        id: r.id,
        direction: r.direction,
        transactionId: r.transactionId,
        splitId: r.splitId,
        contactId: r.contactId,
        amountCents: r.amountCents,
        billCents: r.billCents,
        origin: r.origin,
        recurringItemId: r.recurringItemId,
        note: r.note,
        forgivenAt: r.forgivenAt,
        forgivenNote: r.forgivenNote,
        repaidCents: sql<number>`coalesce(${paid.paidCents}, 0)`.mapWith(
          Number,
        ),
        bookingDate: transactionsTable.bookingDate,
      })
      .from(r)
      .innerJoin(transactionsTable, eq(transactionsTable.id, r.transactionId))
      .leftJoin(paid, eq(paid.receivableId, r.id))
      .where(where)
  }

  private async toReceivables(
    executor: Executor,
    rows: ReceivableRow[],
  ): Promise<ReceivableDto[]> {
    if (rows.length === 0) return []
    const t = transactionsTable
    const s = transactionSplitsTable
    const details = await executor
      .select({
        id: receivablesTable.id,
        label: sql<string>`coalesce(${t.merchant}, ${t.rawLabel})`,
        lineCents:
          sql<number>`abs(coalesce(${s.amountCents}, ${t.amountCents}))`.mapWith(
            Number,
          ),
        categoryId: categoriesTable.id,
        categoryName: categoriesTable.name,
        categoryColor: categoriesTable.color,
        categoryIcon: categoriesTable.icon,
        contactName: contactsTable.name,
      })
      .from(receivablesTable)
      .innerJoin(t, eq(t.id, receivablesTable.transactionId))
      .innerJoin(
        contactsTable,
        eq(contactsTable.id, receivablesTable.contactId),
      )
      .leftJoin(s, eq(s.id, receivablesTable.splitId))
      .leftJoin(
        categoriesTable,
        eq(categoriesTable.id, sql`coalesce(${s.categoryId}, ${t.categoryId})`),
      )
      .where(
        inArray(
          receivablesTable.id,
          rows.map((row) => row.id),
        ),
      )
    const detailById = new Map(details.map((d) => [d.id, d]))
    const p = receivablePaymentsTable
    const payments = await executor
      .select({
        id: p.id,
        receivableId: p.receivableId,
        transactionId: p.transactionId,
        amountCents: p.amountCents,
        paidOn: p.paidOn,
        note: p.note,
        label: sql<string | null>`coalesce(${t.merchant}, ${t.rawLabel})`,
      })
      .from(p)
      .leftJoin(t, eq(t.id, p.transactionId))
      .where(
        inArray(
          p.receivableId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(p.paidOn), asc(p.createdAt))
    const paymentsBy = new Map<string, ReceivablePaymentDto[]>()
    for (const payment of payments) {
      const list = paymentsBy.get(payment.receivableId) ?? []
      list.push(payment)
      paymentsBy.set(payment.receivableId, list)
    }
    return rows.map((row) => {
      const detail = detailById.get(row.id)!
      return {
        id: row.id,
        direction: row.direction,
        contactId: row.contactId,
        contactName: detail.contactName,
        transactionId: row.transactionId,
        splitId: row.splitId,
        bookingDate: row.bookingDate,
        label: detail.label,
        category:
          detail.categoryId === null
            ? null
            : {
                id: detail.categoryId,
                name: detail.categoryName!,
                color: detail.categoryColor,
                icon: detail.categoryIcon,
              },
        expenseCents: detail.lineCents,
        amountCents: row.amountCents,
        billCents: row.billCents,
        repaidCents: row.repaidCents,
        leftCents: leftCents(row),
        state: receivableState(row),
        forgivenAt: row.forgivenAt,
        forgivenNote: row.forgivenNote,
        note: row.note,
        origin: row.origin,
        recurringItemId: row.recurringItemId,
        payments: paymentsBy.get(row.id) ?? [],
      }
    })
  }

  /** Locks a transaction and reads one of its lines. */
  private async lockLine(
    executor: Executor,
    transactionId: string,
    splitId: string | undefined,
    lock = true,
  ): Promise<Line> {
    const query = executor
      .select({
        id: transactionsTable.id,
        accountId: transactionsTable.accountId,
        paidByContactId: transactionsTable.paidByContactId,
        kind: transactionsTable.kind,
        bookingDate: transactionsTable.bookingDate,
        amountCents: transactionsTable.amountCents,
        label: sql<string>`coalesce(${transactionsTable.merchant}, ${transactionsTable.rawLabel})`,
        rawLabel: transactionsTable.rawLabel,
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.id, transactionId))
    const [row] = lock ? await query.for('update') : await query
    if (!row) throw new NotFoundException('Transaction not found')
    const parts = await executor
      .select({
        id: transactionSplitsTable.id,
        amountCents: transactionSplitsTable.amountCents,
      })
      .from(transactionSplitsTable)
      .where(eq(transactionSplitsTable.transactionId, transactionId))
    let amountCents = row.amountCents
    if (parts.length > 0) {
      const part = parts.find((p) => p.id === splitId)
      if (!part) {
        throw new BadRequestException(
          'The transaction is split: give the splitId of the part',
        )
      }
      amountCents = part.amountCents
    } else if (splitId !== undefined) {
      throw new BadRequestException('The transaction is not split')
    }
    return {
      transactionId,
      splitId: parts.length > 0 ? splitId! : null,
      accountId: row.accountId,
      paidByContactId: row.paidByContactId,
      kind: row.kind,
      bookingDate: row.bookingDate,
      amountCents,
      label: row.label,
      rawLabel: row.rawLabel,
    }
  }

  /** An expense the owner paid from one of his accounts, to share. */
  private async expenseLine(
    tx: Tx,
    transactionId: string,
    splitId: string | undefined,
  ): Promise<Line> {
    const line = await this.lockLine(tx, transactionId, splitId)
    if (line.accountId === null) {
      throw new BadRequestException(
        'An expense paid by a contact is not shared: it is what the owner owes',
      )
    }
    if (line.kind !== 'expense' || line.amountCents >= 0) {
      throw new BadRequestException('Only money out on an expense is shared')
    }
    return line
  }

  /**
   * What a line already carries: the shares on it (money out) and the
   * repayments taken from it. Both together never exceed the line.
   */
  private async usedOnLine(
    executor: Executor,
    line: Line,
    { sharesToo = true }: { sharesToo?: boolean } = {},
  ): Promise<number> {
    const splitMatch = (column: typeof receivablesTable.splitId) =>
      line.splitId === null ? isNull(column) : eq(column, line.splitId)
    const linked = await this.linkedFromLine(executor, line)
    if (!sharesToo || line.amountCents > 0) return linked
    const [{ shares }] = await executor
      .select({
        shares:
          sql<number>`coalesce(sum(${receivablesTable.amountCents}), 0)::bigint`.mapWith(
            Number,
          ),
      })
      .from(receivablesTable)
      .where(
        and(
          eq(receivablesTable.transactionId, line.transactionId),
          eq(receivablesTable.direction, 'owed_to_me'),
          splitMatch(receivablesTable.splitId),
        ),
      )
    return linked + shares
  }

  /** Repayments already taken from a line. */
  private async linkedFromLine(
    executor: Executor,
    line: Line,
  ): Promise<number> {
    const p = receivablePaymentsTable
    const [{ linked }] = await executor
      .select({
        linked: sql<number>`coalesce(sum(${p.amountCents}), 0)::bigint`.mapWith(
          Number,
        ),
      })
      .from(p)
      .where(
        and(
          eq(p.transactionId, line.transactionId),
          line.splitId === null
            ? isNull(p.splitId)
            : eq(p.splitId, line.splitId),
        ),
      )
    return linked
  }

  private async sharesOn(tx: Tx, transactionId: string) {
    return tx
      .select({ contactId: receivablesTable.contactId })
      .from(receivablesTable)
      .where(eq(receivablesTable.transactionId, transactionId))
  }

  private async resolveShareContacts(
    tx: Tx,
    shares: ShareInputDto[],
  ): Promise<{ contactId: string; amountCents: number }[]> {
    const result: { contactId: string; amountCents: number }[] = []
    for (const share of shares) {
      const contactId = await this.resolveContact(tx, share)
      if (result.some((r) => r.contactId === contactId)) {
        throw new BadRequestException('A person is listed twice')
      }
      result.push({ contactId, amountCents: share.amountCents })
    }
    return result
  }

  /** A contact by id, or by name (an existing one, case ignored, else new). */
  async resolveContact(
    executor: Executor,
    ref: ContactRefDto,
  ): Promise<string> {
    if (ref.contactId !== undefined) {
      await this.requireContact(executor, ref.contactId)
      return ref.contactId
    }
    const name = ref.contactName?.trim()
    if (!name) throw new BadRequestException('contactId or contactName')
    const [existing] = await executor
      .select({ id: contactsTable.id })
      .from(contactsTable)
      .where(sql`lower(${contactsTable.name}) = lower(${name})`)
      .limit(1)
    if (existing) return existing.id
    const [created] = await executor
      .insert(contactsTable)
      .values({ name })
      .onConflictDoNothing()
      .returning({ id: contactsTable.id })
    if (created) return created.id
    const [raced] = await executor
      .select({ id: contactsTable.id })
      .from(contactsTable)
      .where(sql`lower(${contactsTable.name}) = lower(${name})`)
    return raced.id
  }

  private async requireContact(executor: Executor, id: string) {
    const [row] = await executor
      .select()
      .from(contactsTable)
      .where(eq(contactsTable.id, id))
    if (!row) throw new NotFoundException('Contact not found')
    return row
  }

  private async assertNameFree(
    executor: Executor,
    name: string,
    except?: string,
  ) {
    const [taken] = await executor
      .select({ id: contactsTable.id })
      .from(contactsTable)
      .where(
        and(
          sql`lower(${contactsTable.name}) = lower(${name})`,
          except === undefined ? undefined : ne(contactsTable.id, except),
        ),
      )
      .limit(1)
    if (taken) throw new ConflictException('A contact already has this name')
  }
}

type ReceivableRow = {
  id: string
  direction: ReceivableDirection
  transactionId: string
  splitId: string | null
  contactId: string
  amountCents: number
  billCents: number | null
  origin: 'manual' | 'recurring'
  recurringItemId: string | null
  note: string | null
  forgivenAt: Date | null
  forgivenNote: string | null
  repaidCents: number
  bookingDate: string
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

/** Trimmed, non-empty, unique (case ignored) bank words. */
function cleanLabels(labels: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const label of labels) {
    const trimmed = label.trim().replace(/\s+/g, ' ')
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}
