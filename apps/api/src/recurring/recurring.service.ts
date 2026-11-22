import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  type SQL,
  sql,
} from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { CategoryIcon } from '#/categories/category-icons'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  contactsTable,
  recurringItemsTable,
  type SelectRecurringItem,
  transactionsTable,
} from '#/database/schema'
import type { RecurringStatus } from '#/database/schema/domain-enums'
import { normalizeLabel } from '#/imports/normalize/label'
import { applyRecurringShares } from '#/owed/recurring-shares'
import { recurringShareOf } from '#/owed/shares'
import { daysBetween, todayInParis } from './dates'
import {
  accountHorizons,
  CADENCE_SPECS,
  describeSeries,
  detectRecurring,
  groupTransactions,
  monthlyEquivalentCents,
  type RecurringTransaction,
  type SeriesStats,
  seriesKey,
  STALE_PERIODS,
  type TransactionGroup,
  yearlyCostCents,
} from './detect'
import {
  RECURRING_AMOUNT_RUNS_SHOWN,
  RECURRING_OCCURRENCES_SHOWN,
  type RecurringAmountRunDto,
  type RecurringConfirmResultDto,
  type RecurringDetectResultDto,
  type RecurringItemDto,
  type RecurringSummaryDto,
  type RecurringTotalDto,
  type DeclarePrepaidDto,
  type PrepaidDeclarationDto,
  type UpdateRecurringItemDto,
} from './dto/recurring.dto'
import {
  cadenceTermMonths,
  matchRenewals,
  prepaidActive,
  prepaidMonthlyCents,
  prepaidYearlyCents,
  renewalDate,
  renewalReminderDue,
} from './prepaid'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** The database or an open transaction. */
type Executor = Db | Tx

/** Categories whose debits count as fixed costs by default. */
export const FIXED_COST_CATEGORY_SLUGS: ReadonlySet<string> = new Set([
  'rent',
  'insurance',
  'telecom',
  'energy',
  'subscriptions',
])
export const SUBSCRIPTIONS_SLUG = 'subscriptions'

const itemColumns = {
  item: recurringItemsTable,
  accountName: accountsTable.name,
  shareContactName: contactsTable.name,
  categorySlug: categoriesTable.slug,
  categoryName: categoriesTable.name,
  categoryColor: categoriesTable.color,
  categoryIcon: categoriesTable.icon,
}

interface ItemRow {
  item: SelectRecurringItem
  accountName: string
  shareContactName: string | null
  categorySlug: string | null
  categoryName: string | null
  categoryColor: string | null
  categoryIcon: CategoryIcon | null
}

/** An item before its share (#359) is added (`withShare`). */
type BaseItemDto = Omit<
  RecurringItemDto,
  'share' | 'ownMonthlyEquivalentCents' | 'ownYearlyCostCents'
>

/** Rows booked on one of the owner's accounts (#359). */
const hasAccount = isNotNull(transactionsTable.accountId)

const transactionColumns = {
  id: transactionsTable.id,
  // Read with `hasAccount`: an expense paid by a contact (#359) has none and
  // is never part of a series.
  accountId: sql<string>`${transactionsTable.accountId}`.as('account_id'),
  bookingDate: transactionsTable.bookingDate,
  amountCents: transactionsTable.amountCents,
  rawLabel: transactionsTable.rawLabel,
  merchant: transactionsTable.merchant,
  kind: transactionsTable.kind,
  categoryId: transactionsTable.categoryId,
  isOneOff: transactionsTable.isOneOff,
}

/** A payment linked to a prepaid item (#314). */
interface PrepaidPayment {
  transactionId: string
  date: string
  /** Positive cents. */
  amountCents: number
}

function emptyTotal(): RecurringTotalDto {
  return { monthlyCents: 0, yearlyCents: 0, count: 0 }
}

function addTo(total: RecurringTotalDto, yearlyCents: number) {
  total.yearlyCents += yearlyCents
  total.monthlyCents = Math.round(total.yearlyCents / 12)
  total.count++
}

function mostFrequent(values: readonly (string | null)[]): string | null {
  const counts = new Map<string, number>()
  let best: string | null = null
  for (let i = values.length - 1; i >= 0; i--) {
    const value = values[i]
    if (value === null) continue
    const count = (counts.get(value) ?? 0) + 1
    counts.set(value, count)
    if (best === null || count > counts.get(best)!) best = value
  }
  return best
}

/**
 * Recurring items: detection over the transactions (`detect.ts`), review
 * (confirm / dismiss / edit) and costs.
 *
 * Transfers between own accounts and one-off transactions are never part of
 * a series, so they never count in a recurring cost. Amounts are positive
 * integer cents with a `direction`. Stats returned by the list are
 * recomputed from the transactions on every call (so they follow imports and
 * cadence overrides); the stored ones are the snapshot of the last detection,
 * used when an item's transactions are gone.
 *
 * Never logs labels or amounts.
 */
@Injectable()
export class RecurringService {
  private readonly logger = new Logger(RecurringService.name)

  constructor(private readonly database: DatabaseService) {}

  private get db(): Db {
    return this.database.db
  }

  /**
   * Runs the detector over every transaction and stores the result: new
   * active series become suggestions; existing items (whatever their status)
   * get their detection stats refreshed, never their user fields; dismissed
   * items stay dismissed. Suggestions no longer detected, or now inactive,
   * are removed. Idempotent; concurrent runs are serialized.
   */
  detect(today: string = todayInParis()): Promise<RecurringDetectResultDto> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('recurring_items_detect'))`,
      )
      const [transactions, existing, categories] = await Promise.all([
        tx.select(transactionColumns).from(transactionsTable).where(hasAccount),
        tx.select().from(recurringItemsTable),
        tx
          .select({ id: categoriesTable.id, slug: categoriesTable.slug })
          .from(categoriesTable),
      ])
      const slugs = new Map(categories.map((c) => [c.id, c.slug]))
      const byKey = new Map(
        existing.map((item) => [
          seriesKey(item.accountId, item.merchantKey, item.direction),
          item,
        ]),
      )

      const detected = detectRecurring(transactions, today)
      const keep = new Set<string>()
      let createdCount = 0
      let updatedCount = 0
      for (const series of detected) {
        const snapshot = {
          cadence: series.cadence,
          amountType: series.amountType,
          typicalAmountCents: series.typicalAmountCents,
          confidence: series.confidence,
          lastSeenDate: series.lastDate,
          nextExpectedDate: series.nextExpectedDate,
        }
        const item = byKey.get(series.key)
        if (item) {
          if (item.status !== 'suggested' || series.active) keep.add(series.key)
          // A prepaid item's stats come from its payments (`attachRenewals`).
          if (item.termMonths !== null) continue
          await tx
            .update(recurringItemsTable)
            .set(snapshot)
            .where(eq(recurringItemsTable.id, item.id))
          updatedCount++
          continue
        }
        if (!series.active) continue
        keep.add(series.key)
        const slug = series.categoryId ? slugs.get(series.categoryId) : null
        const inserted = await tx
          .insert(recurringItemsTable)
          .values({
            ...snapshot,
            accountId: series.accountId,
            merchantKey: series.merchantKey,
            direction: series.direction,
            name: series.displayName.slice(0, 255),
            categoryId: series.categoryId,
            status: 'suggested',
            isFixedCost:
              series.direction === 'debit' &&
              !!slug &&
              FIXED_COST_CATEGORY_SLUGS.has(slug),
          })
          .onConflictDoNothing()
          .returning({ id: recurringItemsTable.id })
        createdCount += inserted.length
      }

      const stale = existing.filter(
        (item) =>
          item.status === 'suggested' &&
          !keep.has(
            seriesKey(item.accountId, item.merchantKey, item.direction),
          ),
      )
      if (stale.length > 0) {
        await tx.delete(recurringItemsTable).where(
          inArray(
            recurringItemsTable.id,
            stale.map((item) => item.id),
          ),
        )
      }
      for (const item of existing) {
        if (item.termMonths === null) continue
        // A prepaid item without payment (#439: made prepaid by the
        // migration, or its payments unlinked) takes its series' charges.
        if (!(await this.hasPayment(tx, item.id))) {
          await this.linkSeries(tx, item, today)
        }
        await this.attachRenewals(tx, item)
      }
      // Charges of items shared with a contact get their share (#359).
      await applyRecurringShares(tx)
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(recurringItemsTable)
        .where(eq(recurringItemsTable.status, 'suggested'))

      return {
        detectedCount: detected.length,
        createdCount,
        updatedCount: updatedCount,
        removedCount: stale.length,
        suggestedCount: count,
      }
    })
  }

  /**
   * Runs `detect` without waiting for it (after an import is committed or
   * undone). A failure is logged, never thrown.
   */
  detectInBackground(): void {
    this.detect().catch((error: unknown) => {
      this.logger.warn(
        `Background recurring detection failed: ${error instanceof Error ? error.name : 'unknown error'}`,
      )
    })
  }

  /** Items with their stats, by name; `ended` is judged against `today`. */
  list(
    status?: RecurringStatus,
    today: string = todayInParis(),
  ): Promise<RecurringItemDto[]> {
    return this.items(
      status ? eq(recurringItemsTable.status, status) : undefined,
      this.db,
      today,
    )
  }

  /**
   * Totals of the confirmed, active items not cancelled as of today (an item
   * cancelled from a future date counts until then).
   */
  async summary(today: string = todayInParis()): Promise<RecurringSummaryDto> {
    const [items, [{ count: suggestedCount }]] = await Promise.all([
      this.list('confirmed', today),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(recurringItemsTable)
        .where(eq(recurringItemsTable.status, 'suggested')),
    ])
    const debits = {
      ...emptyTotal(),
      fixed: emptyTotal(),
      variable: emptyTotal(),
      subscriptions: emptyTotal(),
    }
    const credits = emptyTotal()
    let inactiveCount = 0
    let endedCount = 0
    for (const item of items) {
      if (item.ended) {
        endedCount++
        continue
      }
      if (!item.active) {
        inactiveCount++
        continue
      }
      if (item.direction === 'credit') {
        addTo(credits, item.yearlyCostCents)
        continue
      }
      // The owner's part of a debit shared with a contact (#359).
      addTo(debits, item.ownYearlyCostCents)
      addTo(
        item.isFixedCost ? debits.fixed : debits.variable,
        item.ownYearlyCostCents,
      )
      if (item.isSubscription) {
        addTo(debits.subscriptions, item.ownYearlyCostCents)
      }
    }
    return { debits, credits, suggestedCount, inactiveCount, endedCount }
  }

  /**
   * Confirm, dismiss, rename, recategorize, override the cadence, cancel
   * (`endedOn`, confirmed items only: 400 otherwise), set or clear the
   * prepaid term (`termMonths`), keep the coming renewal (`keepRenewal`),
   * ...
   */
  async update(
    id: string,
    dto: UpdateRecurringItemDto,
    today: string = todayInParis(),
  ): Promise<RecurringItemDto> {
    const [item] = await this.db
      .select()
      .from(recurringItemsTable)
      .where(eq(recurringItemsTable.id, id))
    if (!item) throw new NotFoundException('Recurring item not found')
    if (
      dto.endedOn !== undefined &&
      (dto.status ?? item.status) !== 'confirmed'
    ) {
      throw new BadRequestException('Only a confirmed item can be cancelled')
    }
    const termMonths =
      dto.termMonths === undefined ? item.termMonths : dto.termMonths
    if (dto.keepRenewal !== undefined && termMonths === null) {
      throw new BadRequestException('Only a prepaid item has a renewal')
    }
    if (dto.termMonths != null && item.direction !== 'debit') {
      throw new BadRequestException('Only a debit can be prepaid')
    }
    if (
      dto.termMonths != null &&
      dto.status !== undefined &&
      dto.status !== 'confirmed'
    ) {
      throw new BadRequestException('Only a confirmed item can be prepaid')
    }

    if (dto.categoryId) {
      const [category] = await this.db
        .select({ id: categoriesTable.id })
        .from(categoriesTable)
        .where(eq(categoriesTable.id, dto.categoryId))
      if (!category) {
        throw new BadRequestException('categoryId does not match any category')
      }
    }

    const changes: Partial<typeof recurringItemsTable.$inferInsert> = {}
    if (dto.status !== undefined) changes.status = dto.status
    // A prepaid term belongs to a confirmed item (#439): setting one
    // confirms it, like a declaration.
    if (dto.termMonths != null && dto.status === undefined) {
      changes.status = 'confirmed'
    }
    const status = changes.status ?? item.status
    // A cancellation and a prepaid term belong to a confirmed item: one left
    // for another status loses them (`recurring_items_ended_only_confirmed`,
    // `recurring_items_term_only_confirmed`).
    const leavesConfirmed = status !== 'confirmed'
    if (leavesConfirmed) {
      changes.endedOn = null
      if (item.termMonths !== null) {
        changes.termMonths = null
        changes.renewalKeptOn = null
      }
    }
    if (dto.name !== undefined) changes.name = dto.name
    if (dto.categoryId !== undefined) changes.categoryId = dto.categoryId
    if (dto.isFixedCost !== undefined) changes.isFixedCost = dto.isFixedCost
    if (dto.cadence !== undefined) {
      // Choosing the detected cadence clears the override.
      changes.cadenceOverride =
        dto.cadence === item.cadence ? null : dto.cadence
    }
    if (dto.notes !== undefined) changes.notes = dto.notes
    if (dto.endedOn !== undefined) changes.endedOn = dto.endedOn
    if (dto.termMonths !== undefined && !leavesConfirmed) {
      changes.termMonths = dto.termMonths
      if (dto.termMonths !== item.termMonths) changes.renewalKeptOn = null
    }
    const cadence = dto.cadence ?? item.cadenceOverride ?? item.cadence
    // A debit series charged every quarter or year becomes prepaid once
    // confirmed (#439), unless the owner says otherwise in the same request.
    const prepaidByCadence =
      status === 'confirmed' &&
      item.termMonths === null &&
      dto.termMonths === undefined &&
      (item.status !== 'confirmed' ||
        cadence !== (item.cadenceOverride ?? item.cadence))
    await this.db.transaction(async (tx) => {
      if (changes.termMonths === null && item.termMonths !== null) {
        await tx
          .update(transactionsTable)
          .set({ prepaidItemId: null })
          .where(eq(transactionsTable.prepaidItemId, id))
      }
      if (dto.termMonths != null && item.termMonths === null) {
        await this.linkLatestDebit(tx, item)
      }
      if (dto.keepRenewal !== undefined) {
        changes.renewalKeptOn = dto.keepRenewal
          ? await this.currentRenewal(tx, id, termMonths!)
          : null
      }
      if (Object.keys(changes).length > 0) {
        await tx
          .update(recurringItemsTable)
          .set(changes)
          .where(eq(recurringItemsTable.id, id))
      }
      if (dto.termMonths != null) {
        await this.attachRenewals(tx, { ...item, termMonths: dto.termMonths })
      }
      if (prepaidByCadence) {
        await this.prepaidFromCadence(
          tx,
          {
            ...item,
            cadenceOverride:
              changes.cadenceOverride !== undefined
                ? changes.cadenceOverride
                : item.cadenceOverride,
          },
          today,
        )
      }
    })
    const [updated] = await this.items(
      eq(recurringItemsTable.id, id),
      this.db,
      today,
    )
    return updated
  }

  /**
   * Declares the expense `transactionId` as the upfront payment of a
   * subscription prepaid for `termMonths` (#314): the item of its account +
   * merchant becomes (or is created as) a confirmed prepaid item, with no
   * need for a second occurrence. Later charges of the merchant around the
   * renewal date are linked too. 400 for anything but an expense, 409 when
   * the transaction already pays a prepaid item.
   */
  async declarePrepaid(
    dto: DeclarePrepaidDto,
    today: string = todayInParis(),
  ): Promise<PrepaidDeclarationDto> {
    const { itemId, previousStatus } = await this.db.transaction(async (tx) => {
      const [transaction] = await tx
        .select({
          id: transactionsTable.id,
          accountId: transactionsTable.accountId,
          bookingDate: transactionsTable.bookingDate,
          amountCents: transactionsTable.amountCents,
          rawLabel: transactionsTable.rawLabel,
          merchant: transactionsTable.merchant,
          kind: transactionsTable.kind,
          categoryId: transactionsTable.categoryId,
          prepaidItemId: transactionsTable.prepaidItemId,
        })
        .from(transactionsTable)
        .where(eq(transactionsTable.id, dto.transactionId))
        .for('update')
      if (!transaction) throw new NotFoundException('Transaction not found')
      if (transaction.accountId === null) {
        throw new BadRequestException(
          'An expense paid by a contact is not a subscription',
        )
      }
      const accountId = transaction.accountId
      if (transaction.kind !== 'expense' || transaction.amountCents >= 0) {
        throw new BadRequestException(
          'Only an expense can be a prepaid subscription',
        )
      }
      if (transaction.prepaidItemId !== null) {
        throw new ConflictException(
          'This transaction already pays a prepaid subscription',
        )
      }
      const normalized = normalizeLabel(
        transaction.rawLabel,
        transaction.amountCents,
      )
      const merchantKey = (normalized.merchantKey ?? '').slice(0, 255)
      if (!merchantKey) {
        throw new BadRequestException('No merchant found in this label')
      }
      const amountCents = -transaction.amountCents
      const [existing] = await tx
        .select()
        .from(recurringItemsTable)
        .where(
          and(
            eq(recurringItemsTable.accountId, accountId),
            eq(recurringItemsTable.merchantKey, merchantKey),
            eq(recurringItemsTable.direction, 'debit'),
          ),
        )
        .for('update')

      let item: SelectRecurringItem
      if (existing) {
        const [updated] = await tx
          .update(recurringItemsTable)
          .set({
            status: 'confirmed',
            termMonths: dto.termMonths,
            renewalKeptOn:
              existing.termMonths === dto.termMonths
                ? existing.renewalKeptOn
                : null,
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.isFixedCost !== undefined && {
              isFixedCost: dto.isFixedCost,
            }),
          })
          .where(eq(recurringItemsTable.id, existing.id))
          .returning()
        item = updated
      } else {
        const [inserted] = await tx
          .insert(recurringItemsTable)
          .values({
            accountId: accountId,
            merchantKey,
            direction: 'debit',
            name: (
              dto.name ??
              transaction.merchant ??
              normalized.merchant ??
              merchantKey
            ).slice(0, 255),
            categoryId: transaction.categoryId,
            status: 'confirmed',
            isFixedCost: dto.isFixedCost ?? true,
            // Detection columns: the term is what counts for a prepaid item.
            cadence: 'yearly',
            amountType: 'fixed',
            typicalAmountCents: amountCents,
            confidence: 1,
            lastSeenDate: transaction.bookingDate,
            nextExpectedDate: renewalDate(
              transaction.bookingDate,
              dto.termMonths,
            ),
            termMonths: dto.termMonths,
          })
          .returning()
        item = inserted
      }
      await tx
        .update(transactionsTable)
        .set({ prepaidItemId: item.id })
        .where(eq(transactionsTable.id, transaction.id))
      await this.attachRenewals(tx, item)
      return {
        itemId: item.id,
        previousStatus: existing ? existing.status : null,
      }
    })
    const [item] = await this.items(
      eq(recurringItemsTable.id, itemId),
      this.db,
      today,
    )
    return { item, previousStatus }
  }

  /**
   * Removes a prepaid item (the undo of a declaration that created it): its
   * payments are unlinked. 400 for an item that is not prepaid.
   */
  async remove(id: string): Promise<void> {
    const [item] = await this.db
      .select({ termMonths: recurringItemsTable.termMonths })
      .from(recurringItemsTable)
      .where(eq(recurringItemsTable.id, id))
    if (!item) throw new NotFoundException('Recurring item not found')
    if (item.termMonths === null) {
      throw new BadRequestException('Only a prepaid item can be removed')
    }
    // `transactions.prepaid_item_id` is set null by its foreign key.
    await this.db
      .delete(recurringItemsTable)
      .where(eq(recurringItemsTable.id, id))
  }

  /**
   * Confirms several items at once ("Tout confirmer"); unknown ids are
   * ignored. A quarterly or yearly debit becomes prepaid (#439).
   */
  async confirm(
    ids: readonly string[],
    today: string = todayInParis(),
  ): Promise<RecurringConfirmResultDto> {
    return this.db.transaction(async (tx) => {
      const confirmed = await tx
        .update(recurringItemsTable)
        .set({ status: 'confirmed' })
        .where(
          and(
            inArray(recurringItemsTable.id, [...new Set(ids)]),
            ne(recurringItemsTable.status, 'confirmed'),
          ),
        )
        .returning()
      for (const item of confirmed) {
        await this.prepaidFromCadence(tx, item, today)
      }
      return { confirmedCount: confirmed.length }
    })
  }

  // --- Helpers --------------------------------------------------------------

  /**
   * Makes a confirmed debit series charged every quarter or every year a
   * prepaid item of term 3 / 12 (#439): its charges become its payments
   * (`transactions.prepaid_item_id`), so they count in their month but stay
   * out of averages and budget suggestions, and its renewal is reminded.
   * Nothing for another cadence, a credit or an item already prepaid.
   */
  private async prepaidFromCadence(
    executor: Executor,
    item: SelectRecurringItem,
    today: string,
  ): Promise<void> {
    if (item.direction !== 'debit' || item.termMonths !== null) return
    const termMonths = cadenceTermMonths(item.cadenceOverride ?? item.cadence)
    if (termMonths === null) return
    await executor
      .update(recurringItemsTable)
      .set({ termMonths, renewalKeptOn: null })
      .where(eq(recurringItemsTable.id, item.id))
    await this.linkSeries(executor, item, today)
    await this.attachRenewals(executor, { ...item, termMonths })
  }

  /** Whether a prepaid item has a payment linked. */
  private async hasPayment(executor: Executor, id: string): Promise<boolean> {
    const [linked] = await executor
      .select({ id: transactionsTable.id })
      .from(transactionsTable)
      .where(eq(transactionsTable.prepaidItemId, id))
      .limit(1)
    return linked !== undefined
  }

  /**
   * Links the expenses of an item's series (the run its cadence fits, not
   * linked to another item) as its prepaid payments (#439).
   */
  private async linkSeries(
    executor: Executor,
    item: Pick<
      SelectRecurringItem,
      | 'id'
      | 'accountId'
      | 'merchantKey'
      | 'direction'
      | 'cadence'
      | 'cadenceOverride'
    >,
    today: string,
  ): Promise<void> {
    const transactions = await executor
      .select(transactionColumns)
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.accountId, item.accountId),
          isNull(transactionsTable.prepaidItemId),
        ),
      )
    const group = groupTransactions(transactions).get(
      seriesKey(item.accountId, item.merchantKey, item.direction),
    )
    if (!group?.occurrences.length) return
    const stats = describeSeries(
      group.occurrences,
      item.cadenceOverride ?? item.cadence,
      accountHorizons(transactions, today).get(item.accountId) ?? today,
    )
    await executor
      .update(transactionsTable)
      .set({ prepaidItemId: item.id })
      .where(
        and(
          inArray(
            transactionsTable.id,
            stats.occurrences.map((o) => o.transactionId),
          ),
          eq(transactionsTable.kind, 'expense'),
          isNull(transactionsTable.prepaidItemId),
        ),
      )
  }

  /**
   * Links to a prepaid item the charges of its merchant that renew it
   * (`matchRenewals`: the closest to each renewal date, within the window),
   * then stores its stats snapshot from its payments.
   */
  private async attachRenewals(
    executor: Executor,
    item: Pick<
      SelectRecurringItem,
      'id' | 'accountId' | 'merchantKey' | 'termMonths'
    >,
  ): Promise<void> {
    if (item.termMonths === null) return
    const payments = await executor
      .select({
        date: transactionsTable.bookingDate,
        amountCents: transactionsTable.amountCents,
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.prepaidItemId, item.id))
      .orderBy(asc(transactionsTable.bookingDate), asc(transactionsTable.id))
    const latest = payments.at(-1)
    if (!latest) return
    const rows = await executor
      .select({
        id: transactionsTable.id,
        date: transactionsTable.bookingDate,
        amountCents: transactionsTable.amountCents,
        rawLabel: transactionsTable.rawLabel,
      })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.accountId, item.accountId),
          isNull(transactionsTable.prepaidItemId),
          eq(transactionsTable.kind, 'expense'),
          lt(transactionsTable.amountCents, 0),
          gt(transactionsTable.bookingDate, latest.date),
        ),
      )
    const candidates = rows.filter(
      (row) =>
        normalizeLabel(row.rawLabel, row.amountCents).merchantKey ===
        item.merchantKey,
    )
    const renewals = matchRenewals(latest.date, item.termMonths, candidates)
    if (renewals.length > 0) {
      await executor
        .update(transactionsTable)
        .set({ prepaidItemId: item.id })
        .where(
          inArray(
            transactionsTable.id,
            renewals.map((r) => r.id),
          ),
        )
    }
    const last = renewals.length
      ? candidates.find((c) => c.id === renewals.at(-1)!.id)!
      : latest
    await executor
      .update(recurringItemsTable)
      .set({
        amountType: 'fixed',
        typicalAmountCents: -last.amountCents,
        confidence: 1,
        lastSeenDate: last.date,
        nextExpectedDate: renewalDate(last.date, item.termMonths),
      })
      .where(eq(recurringItemsTable.id, item.id))
  }

  /**
   * Makes the latest debit of an item's series its prepaid payment, when
   * the term is set on an item without one. 400 when it has no debit.
   */
  private async linkLatestDebit(
    executor: Executor,
    item: SelectRecurringItem,
  ): Promise<void> {
    const [linked] = await executor
      .select({ id: transactionsTable.id })
      .from(transactionsTable)
      .where(eq(transactionsTable.prepaidItemId, item.id))
      .limit(1)
    if (linked) return
    const transactions = await executor
      .select(transactionColumns)
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.accountId, item.accountId),
          isNull(transactionsTable.prepaidItemId),
        ),
      )
    const group = groupTransactions(transactions).get(
      seriesKey(item.accountId, item.merchantKey, item.direction),
    )
    const latest = group?.occurrences.at(-1)
    if (!latest) {
      throw new BadRequestException('No payment found for this item')
    }
    await executor
      .update(transactionsTable)
      .set({ prepaidItemId: item.id })
      .where(eq(transactionsTable.id, latest.transactionId))
  }

  /** The renewal date of a prepaid item, from its latest payment. */
  private async currentRenewal(
    executor: Executor,
    id: string,
    termMonths: number,
  ): Promise<string | null> {
    const [{ last }] = await executor
      .select({
        last: sql<string | null>`max(${transactionsTable.bookingDate})`,
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.prepaidItemId, id))
    return last === null ? null : renewalDate(last, termMonths)
  }

  /** Payments of the prepaid items among `itemIds`, oldest first. */
  private async prepaidPayments(
    executor: Executor,
    itemIds: readonly string[],
  ): Promise<Map<string, PrepaidPayment[]>> {
    const payments = new Map<string, PrepaidPayment[]>()
    if (itemIds.length === 0) return payments
    const rows = await executor
      .select({
        itemId: transactionsTable.prepaidItemId,
        transactionId: transactionsTable.id,
        date: transactionsTable.bookingDate,
        amountCents: transactionsTable.amountCents,
      })
      .from(transactionsTable)
      .where(
        and(
          isNotNull(transactionsTable.prepaidItemId),
          inArray(transactionsTable.prepaidItemId, [...itemIds]),
        ),
      )
      .orderBy(asc(transactionsTable.bookingDate), asc(transactionsTable.id))
    for (const row of rows) {
      const list = payments.get(row.itemId!) ?? []
      list.push({
        transactionId: row.transactionId,
        date: row.date,
        amountCents: Math.abs(row.amountCents),
      })
      payments.set(row.itemId!, list)
    }
    return payments
  }

  private async items(
    where: SQL | undefined,
    executor: Executor = this.db,
    today: string = todayInParis(),
  ): Promise<RecurringItemDto[]> {
    const rows = await executor
      .select(itemColumns)
      .from(recurringItemsTable)
      .innerJoin(
        accountsTable,
        eq(accountsTable.id, recurringItemsTable.accountId),
      )
      .leftJoin(
        categoriesTable,
        eq(categoriesTable.id, recurringItemsTable.categoryId),
      )
      .leftJoin(
        contactsTable,
        eq(contactsTable.id, recurringItemsTable.shareContactId),
      )
      .where(where)
      .orderBy(asc(recurringItemsTable.name), asc(recurringItemsTable.id))
    if (rows.length === 0) return []

    const accountIds = [...new Set(rows.map((row) => row.item.accountId))]
    const transactions: RecurringTransaction[] = await executor
      .select(transactionColumns)
      .from(transactionsTable)
      .where(inArray(transactionsTable.accountId, accountIds))
    const groups = groupTransactions(transactions)
    const horizons = accountHorizons(transactions, today)
    const payments = await this.prepaidPayments(
      executor,
      rows
        .filter((row) => row.item.termMonths !== null)
        .map((row) => row.item.id),
    )
    return rows.map((row) =>
      this.withShare(
        row,
        this.toDto(
          row,
          payments.get(row.item.id) ?? [],
          groups.get(
            seriesKey(
              row.item.accountId,
              row.item.merchantKey,
              row.item.direction,
            ),
          ),
          horizons.get(row.item.accountId) ?? today,
          today,
        ),
      ),
    )
  }

  /**
   * The share of an item shared with a contact (#359) and the owner's part
   * of its cost: each charge minus their share, spread like the charge.
   */
  private withShare(
    row: ItemRow,
    dto: Omit<
      RecurringItemDto,
      'share' | 'ownMonthlyEquivalentCents' | 'ownYearlyCostCents'
    >,
  ): RecurringItemDto {
    const { item } = row
    if (item.shareContactId === null || item.shareFrom === null) {
      return {
        ...dto,
        share: null,
        ownMonthlyEquivalentCents: dto.monthlyEquivalentCents,
        ownYearlyCostCents: dto.yearlyCostCents,
      }
    }
    const own =
      dto.typicalAmountCents -
      recurringShareOf(dto.typicalAmountCents, {
        bps: item.shareBps,
        amountCents: item.shareAmountCents,
      })
    return {
      ...dto,
      share: {
        contactId: item.shareContactId,
        contactName: row.shareContactName ?? '',
        bps: item.shareBps,
        amountCents: item.shareAmountCents,
        from: item.shareFrom,
      },
      ownMonthlyEquivalentCents:
        item.termMonths !== null
          ? prepaidMonthlyCents(own, item.termMonths)
          : monthlyEquivalentCents(own, dto.cadence),
      ownYearlyCostCents:
        item.termMonths !== null
          ? prepaidYearlyCents(own, item.termMonths)
          : yearlyCostCents(own, dto.cadence),
    }
  }

  private toDto(
    row: ItemRow,
    payments: readonly PrepaidPayment[],
    group: TransactionGroup | undefined,
    asOf: string,
    today: string,
  ): BaseItemDto {
    const { item } = row
    if (item.termMonths !== null) {
      return this.toPrepaidDto(row, item.termMonths, payments, asOf, today)
    }
    const cadence = item.cadenceOverride ?? item.cadence
    const stats: SeriesStats | null = group?.occurrences.length
      ? describeSeries(group.occurrences, cadence, asOf)
      : null
    const typicalAmountCents =
      stats?.typicalAmountCents ?? item.typicalAmountCents
    const lastSeenDate = stats?.lastDate ?? item.lastSeenDate
    const yearly = yearlyCostCents(typicalAmountCents, cadence)
    const { endedOn } = item
    return {
      id: item.id,
      accountId: item.accountId,
      accountName: row.accountName,
      merchantKey: item.merchantKey,
      searchText:
        mostFrequent(stats?.occurrences.map((o) => o.merchant) ?? []) ??
        item.merchantKey,
      name: item.name,
      direction: item.direction,
      status: item.status,
      categoryId: item.categoryId,
      categorySlug: row.categorySlug,
      categoryName: row.categoryName,
      categoryColor: row.categoryColor,
      categoryIcon: row.categoryIcon,
      isFixedCost: item.isFixedCost,
      isSubscription: row.categorySlug === SUBSCRIPTIONS_SLUG,
      cadence,
      detectedCadence: item.cadence,
      cadenceOverridden: item.cadenceOverride !== null,
      amountType: stats?.amountType ?? item.amountType,
      typicalAmountCents,
      latestAmountCents: stats?.latestAmountCents ?? typicalAmountCents,
      minAmountCents: stats?.minAmountCents ?? typicalAmountCents,
      maxAmountCents: stats?.maxAmountCents ?? typicalAmountCents,
      yearlyCostCents: yearly,
      monthlyEquivalentCents: monthlyEquivalentCents(
        typicalAmountCents,
        cadence,
      ),
      previousAmountCents: stats?.previousAmountCents ?? null,
      priceChangeCents: stats?.priceChangeCents ?? null,
      priceChangedOn: stats?.priceChangedOn ?? null,
      confidence: stats?.confidence ?? item.confidence,
      active:
        stats?.active ??
        daysBetween(lastSeenDate, asOf) <=
          STALE_PERIODS * CADENCE_SPECS[cadence].days,
      firstSeenDate: stats?.firstDate ?? lastSeenDate,
      lastSeenDate,
      nextExpectedDate: stats?.nextExpectedDate ?? item.nextExpectedDate,
      occurrenceCount: stats?.occurrences.length ?? 0,
      occurrences: (stats?.occurrences ?? [])
        .slice(-RECURRING_OCCURRENCES_SHOWN)
        .reverse()
        .map((o) => ({
          transactionId: o.transactionId,
          date: o.date,
          amountCents: o.amountCents,
        })),
      amountRuns: amountRuns(stats?.occurrences ?? []),
      notes: item.notes,
      endedOn,
      ended: endedOn !== null && endedOn <= today,
      chargedAfterEnd:
        endedOn === null ? null : chargedAfterEnd(endedOn, stats, lastSeenDate),
      termMonths: null,
      renewalDate: null,
      renewalReminder: false,
    }
  }

  /**
   * A prepaid item (#314) from its payments: the latest one is the price,
   * spread over the term for the monthly and yearly costs, and the renewal
   * is its date + the term. Without payments (all deleted), the stored
   * snapshot stands for them.
   */
  private toPrepaidDto(
    row: ItemRow,
    termMonths: number,
    payments: readonly PrepaidPayment[],
    asOf: string,
    today: string,
  ): BaseItemDto {
    const { item } = row
    const latest = payments.at(-1)
    const amountCents = latest?.amountCents ?? item.typicalAmountCents
    const lastSeenDate = latest?.date ?? item.lastSeenDate
    const renewalOn = renewalDate(lastSeenDate, termMonths)
    const amounts = payments.map((p) => p.amountCents)
    const previous = payments.at(-2)
    const priceChangeCents =
      previous && previous.amountCents !== amountCents
        ? amountCents - previous.amountCents
        : null
    const { endedOn } = item
    return {
      id: item.id,
      accountId: item.accountId,
      accountName: row.accountName,
      merchantKey: item.merchantKey,
      searchText: item.merchantKey,
      name: item.name,
      direction: item.direction,
      status: item.status,
      categoryId: item.categoryId,
      categorySlug: row.categorySlug,
      categoryName: row.categoryName,
      categoryColor: row.categoryColor,
      categoryIcon: row.categoryIcon,
      isFixedCost: item.isFixedCost,
      isSubscription: row.categorySlug === SUBSCRIPTIONS_SLUG,
      cadence: item.cadenceOverride ?? item.cadence,
      detectedCadence: item.cadence,
      cadenceOverridden: item.cadenceOverride !== null,
      amountType: 'fixed',
      typicalAmountCents: amountCents,
      latestAmountCents: amountCents,
      minAmountCents: amounts.length ? Math.min(...amounts) : amountCents,
      maxAmountCents: amounts.length ? Math.max(...amounts) : amountCents,
      yearlyCostCents: prepaidYearlyCents(amountCents, termMonths),
      monthlyEquivalentCents: prepaidMonthlyCents(amountCents, termMonths),
      previousAmountCents:
        priceChangeCents === null ? null : previous!.amountCents,
      priceChangeCents,
      priceChangedOn: priceChangeCents === null ? null : lastSeenDate,
      confidence: 1,
      active: prepaidActive(renewalOn, asOf),
      firstSeenDate: payments[0]?.date ?? lastSeenDate,
      lastSeenDate,
      nextExpectedDate: renewalOn,
      occurrenceCount: payments.length,
      occurrences: payments
        .slice(-RECURRING_OCCURRENCES_SHOWN)
        .reverse()
        .map(({ transactionId, date, amountCents }) => ({
          transactionId,
          date,
          amountCents,
        })),
      amountRuns: amountRuns(payments),
      notes: item.notes,
      endedOn,
      ended: endedOn !== null && endedOn <= today,
      chargedAfterEnd:
        endedOn === null
          ? null
          : chargedAfterEnd(endedOn, { occurrences: payments }, lastSeenDate),
      termMonths,
      renewalDate: renewalOn,
      renewalReminder:
        item.status === 'confirmed' &&
        renewalReminderDue({
          renewalOn,
          endedOn,
          renewalKeptOn: item.renewalKeptOn,
          today,
        }),
    }
  }
}

/**
 * Latest occurrence booked on or after the cancellation date `endedOn` (a
 * cancellation the provider did not apply), else null. Without the series'
 * transactions, the stored last seen date stands for them.
 */
export function chargedAfterEnd(
  endedOn: string,
  stats: { occurrences: readonly { date: string }[] } | null,
  lastSeenDate: string,
): string | null {
  const dates = stats
    ? stats.occurrences.map((occurrence) => occurrence.date)
    : [lastSeenDate]
  let latest: string | null = null
  for (const date of dates) {
    if (date >= endedOn && (latest === null || date > latest)) latest = date
  }
  return latest
}

/**
 * Consecutive occurrences of the same amount, newest first, at most
 * `RECURRING_AMOUNT_RUNS_SHOWN` (#279): the price history of a fixed series
 * in a few lines instead of one per charge. `occurrences` are oldest first.
 */
export function amountRuns(
  occurrences: readonly { date: string; amountCents: number }[],
): RecurringAmountRunDto[] {
  const runs: RecurringAmountRunDto[] = []
  for (const { date, amountCents } of occurrences) {
    const last = runs.at(-1)
    if (last && last.amountCents === amountCents) {
      last.to = date
      last.count++
    } else {
      runs.push({ amountCents, from: date, to: date, count: 1 })
    }
  }
  return runs.reverse().slice(0, RECURRING_AMOUNT_RUNS_SHOWN)
}
