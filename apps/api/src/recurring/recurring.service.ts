import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq, inArray, ne, type SQL, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  recurringItemsTable,
  type SelectRecurringItem,
  transactionsTable,
} from '#/database/schema'
import type { RecurringStatus } from '#/database/schema/domain-enums'
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
  RECURRING_OCCURRENCES_SHOWN,
  type RecurringConfirmResultDto,
  type RecurringDetectResultDto,
  type RecurringItemDto,
  type RecurringSummaryDto,
  type RecurringTotalDto,
  type UpdateRecurringItemDto,
} from './dto/recurring.dto'

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
  categorySlug: categoriesTable.slug,
  categoryName: categoriesTable.name,
  categoryColor: categoriesTable.color,
}

interface ItemRow {
  item: SelectRecurringItem
  accountName: string
  categorySlug: string | null
  categoryName: string | null
  categoryColor: string | null
}

const transactionColumns = {
  id: transactionsTable.id,
  accountId: transactionsTable.accountId,
  bookingDate: transactionsTable.bookingDate,
  amountCents: transactionsTable.amountCents,
  rawLabel: transactionsTable.rawLabel,
  merchant: transactionsTable.merchant,
  kind: transactionsTable.kind,
  categoryId: transactionsTable.categoryId,
  isOneOff: transactionsTable.isOneOff,
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
        tx.select(transactionColumns).from(transactionsTable),
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
      addTo(debits, item.yearlyCostCents)
      addTo(
        item.isFixedCost ? debits.fixed : debits.variable,
        item.yearlyCostCents,
      )
      if (item.isSubscription) addTo(debits.subscriptions, item.yearlyCostCents)
    }
    return { debits, credits, suggestedCount, inactiveCount, endedCount }
  }

  /**
   * Confirm, dismiss, rename, recategorize, override the cadence, cancel
   * (`endedOn`, confirmed items only: 400 otherwise), ...
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
    if (Object.keys(changes).length > 0) {
      await this.db
        .update(recurringItemsTable)
        .set(changes)
        .where(eq(recurringItemsTable.id, id))
    }
    const [updated] = await this.items(
      eq(recurringItemsTable.id, id),
      this.db,
      today,
    )
    return updated
  }

  /** Confirms several items at once ("Tout confirmer"); unknown ids are ignored. */
  async confirm(ids: readonly string[]): Promise<RecurringConfirmResultDto> {
    const confirmed = await this.db
      .update(recurringItemsTable)
      .set({ status: 'confirmed' })
      .where(
        and(
          inArray(recurringItemsTable.id, [...new Set(ids)]),
          ne(recurringItemsTable.status, 'confirmed'),
        ),
      )
      .returning({ id: recurringItemsTable.id })
    return { confirmedCount: confirmed.length }
  }

  // --- Helpers --------------------------------------------------------------

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
    return rows.map((row) =>
      this.toDto(
        row,
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
    )
  }

  private toDto(
    row: ItemRow,
    group: TransactionGroup | undefined,
    asOf: string,
    today: string,
  ): RecurringItemDto {
    const { item } = row
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
      notes: item.notes,
      endedOn,
      ended: endedOn !== null && endedOn <= today,
      chargedAfterEnd:
        endedOn === null ? null : chargedAfterEnd(endedOn, stats, lastSeenDate),
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
  stats: Pick<SeriesStats, 'occurrences'> | null,
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
