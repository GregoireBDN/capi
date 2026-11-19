import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { randomUUID } from 'node:crypto'
import { isTransactionalAccount } from '#/accounts/accounts.service'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  transactionLinesView,
  transactionsTable,
} from '#/database/schema'
import type { TransactionKind } from '#/database/schema/domain-enums'
import { parisToday } from '#/investments/days'
import {
  type CreateManualTransactionDto,
  MANUAL_CATEGORIES_MAX,
  MANUAL_SUGGESTIONS_MAX,
  type ManualSuggestionsDto,
  type MoneyDirection,
  type UpdateManualTransactionDto,
} from './dto/manual-transaction.dto'
import { rankSuggestions, type SuggestionGroup } from './manual-suggestions'
import type { TransactionDto } from './dto/transaction.dto'
import { TransactionsService } from './transactions.service'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * Prefix of the dedupe hash of a manual transaction. The hash column is the
 * identity of a bank row; a manual transaction has none, so it gets a random
 * one that no import can produce (imports use 64 hex characters).
 */
const MANUAL_HASH_PREFIX = 'manual:'

/** Sign of the amount when no direction is sent. */
function defaultDirection(kind: TransactionKind): MoneyDirection {
  return kind === 'income' ? 'in' : 'out'
}

/** Days back the labels typed on manual transactions are suggested. */
const TYPED_LABEL_DAYS = 365
/** Days back the merchants of imported rows are suggested. */
const MERCHANT_DAYS = 180
/** Days back the most used categories are counted. */
const CATEGORY_DAYS = 90

/**
 * Meal vouchers pay at most 25 € a day (the legal cap, #298): the card's
 * payments of one day never add up to more.
 */
export const MEAL_VOUCHER_DAILY_CAP_CENTS = 2_500

function signed(amountCents: number, direction: MoneyDirection): number {
  return direction === 'in' ? amountCents : -amountCents
}

/**
 * Transactions entered by hand (#137, #74): expense, income or transfer, with
 * amount, day, account, label, category, one-off flag and note. Stored with
 * `manual = true`, without an import; the import of the bank export replaces
 * each one by its bank row (`imports/reconcile/`). They count in statistics
 * and balances at once but never as imported data (`coverage/`).
 */
@Injectable()
export class ManualTransactionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly transactions: TransactionsService,
  ) {}

  private get db(): Db {
    return this.database.db
  }

  async create(
    dto: CreateManualTransactionDto,
    now: Date = new Date(),
  ): Promise<TransactionDto> {
    const id = await this.db.transaction(async (tx) => {
      const category = dto.categoryId
        ? await this.requireCategory(tx, dto.categoryId)
        : null
      const label = dto.label ?? category?.name
      if (!label) {
        throw new BadRequestException('A label or a categoryId is required')
      }
      const kind = dto.kind ?? category?.kind ?? 'expense'
      const accountId = dto.accountId
        ? await this.requireAccount(tx, dto.accountId)
        : await this.defaultAccount(tx)
      const bookingDate = this.checkDate(
        dto.bookingDate ?? parisToday(now),
        now,
      )
      const amountCents = signed(
        dto.amountCents,
        dto.direction ?? defaultDirection(kind),
      )
      await this.checkVoucherCap(tx, {
        accountId,
        bookingDate,
        amountCents,
        kind,
      })
      const [row] = await tx
        .insert(transactionsTable)
        .values({
          accountId,
          bookingDate,
          amountCents,
          rawLabel: label,
          kind,
          categoryId: category?.id ?? null,
          needsReview: category === null,
          isOneOff: dto.isOneOff ?? false,
          note: dto.note ?? null,
          manual: true,
          dedupeHash: `${MANUAL_HASH_PREFIX}${randomUUID()}`,
        })
        .returning({ id: transactionsTable.id })
      return row.id
    })
    return this.transactions.findOne(id)
  }

  /**
   * Partial update. A label left to its default (the category name) follows
   * a category change; `label: null` goes back to the default. The sign of
   * the amount is kept unless `direction` is sent.
   */
  async update(
    id: string,
    dto: UpdateManualTransactionDto,
    now: Date = new Date(),
  ): Promise<TransactionDto> {
    await this.db.transaction(async (tx) => {
      const current = await this.findManual(tx, id)
      const [currentCategory] = current.categoryId
        ? await tx
            .select({ name: categoriesTable.name })
            .from(categoriesTable)
            .where(eq(categoriesTable.id, current.categoryId))
        : []
      const defaultLabel = currentCategory?.name ?? null
      const labelIsDefault = current.rawLabel === defaultLabel

      const set: Partial<typeof transactionsTable.$inferInsert> = {}
      let categoryName: string | null = defaultLabel
      if (dto.categoryId !== undefined) {
        const category = dto.categoryId
          ? await this.requireCategory(tx, dto.categoryId)
          : null
        set.categoryId = category?.id ?? null
        set.ruleId = null
        set.needsReview = category === null
        if (category) set.kind = category.kind
        categoryName = category?.name ?? null
      }
      if (dto.kind !== undefined) set.kind = dto.kind
      if (dto.amountCents !== undefined || dto.direction !== undefined) {
        const magnitude = dto.amountCents ?? Math.abs(current.amountCents)
        const direction =
          dto.direction ?? (current.amountCents > 0 ? 'in' : 'out')
        set.amountCents = signed(magnitude, direction)
        if (set.amountCents !== current.amountCents && current.split) {
          throw new BadRequestException(
            'The transaction is split: remove the split before changing its amount',
          )
        }
      }
      if (dto.bookingDate !== undefined) {
        set.bookingDate = this.checkDate(dto.bookingDate, now)
      }
      if (dto.accountId !== undefined) {
        set.accountId = await this.requireAccount(tx, dto.accountId)
      }
      if (dto.label !== undefined) {
        const label = dto.label ?? categoryName
        if (!label) {
          throw new BadRequestException('A label or a categoryId is required')
        }
        set.rawLabel = label
      } else if (dto.categoryId !== undefined && labelIsDefault) {
        if (categoryName) set.rawLabel = categoryName
      }
      if (dto.isOneOff !== undefined) set.isOneOff = dto.isOneOff
      if (dto.note !== undefined) set.note = dto.note
      if (Object.keys(set).length === 0) {
        throw new BadRequestException('Nothing to update')
      }
      await this.checkVoucherCap(tx, {
        id,
        accountId: set.accountId ?? current.accountId,
        bookingDate: set.bookingDate ?? current.bookingDate,
        amountCents: set.amountCents ?? current.amountCents,
        kind: set.kind ?? current.kind,
      })
      await tx
        .update(transactionsTable)
        .set(set)
        .where(eq(transactionsTable.id, id))
    })
    return this.transactions.findOne(id)
  }

  /**
   * Labels to suggest when entering a transaction of this kind (#196): the
   * labels typed on manual transactions of the last year and the frequent
   * merchants of imported rows of the last six months, each with the
   * category it is usually filed under (see `manual-suggestions.ts`), and
   * the open categories of the kind most used over the last 90 days.
   * Computed from existing data; labels are never logged.
   */
  async suggestions(
    kind: TransactionKind = 'expense',
    now: Date = new Date(),
  ): Promise<ManualSuggestionsDto> {
    const t = transactionsTable
    const c = categoriesTable
    const today = parisToday(now)
    const since = (days: number) => sql`(${today}::date - ${days}::int)`

    const typedKey = sql<string>`lower(btrim(${t.rawLabel}))`
    const typed = this.db
      .select({
        key: typedKey,
        label: sql<string>`(array_agg(btrim(${t.rawLabel}) order by ${t.bookingDate} desc))[1]`,
        categoryId: t.categoryId,
        uses: sql<number>`count(*)::int`,
        lastUsed: sql<string>`max(${t.bookingDate})::text`,
      })
      .from(t)
      .leftJoin(c, eq(c.id, t.categoryId))
      .where(
        and(
          eq(t.manual, true),
          eq(t.kind, kind),
          gte(t.bookingDate, since(TYPED_LABEL_DAYS)),
          // A label left to its default is the category name: not typed.
          or(isNull(c.name), ne(t.rawLabel, c.name)),
        ),
      )
      .groupBy(typedKey, t.categoryId)

    const merchantKey = sql<string>`lower(btrim(${t.merchant}))`
    const merchants = this.db
      .select({
        key: merchantKey,
        label: sql<string>`(array_agg(btrim(${t.merchant}) order by ${t.bookingDate} desc))[1]`,
        categoryId: t.categoryId,
        uses: sql<number>`count(*)::int`,
        lastUsed: sql<string>`max(${t.bookingDate})::text`,
      })
      .from(t)
      .where(
        and(
          eq(t.manual, false),
          eq(t.kind, kind),
          isNotNull(t.merchant),
          gte(t.bookingDate, since(MERCHANT_DAYS)),
        ),
      )
      .groupBy(merchantKey, t.categoryId)

    const lines = transactionLinesView
    const uses = sql<number>`count(*)::int`
    const mostUsed = this.db
      .select({ id: c.id })
      .from(lines)
      .innerJoin(c, eq(c.id, lines.categoryId))
      .where(
        and(
          eq(lines.kind, kind),
          eq(c.kind, kind),
          isNull(c.archivedAt),
          gte(lines.bookingDate, since(CATEGORY_DAYS)),
          sql`${lines.bookingDate} <= ${today}::date`,
        ),
      )
      .groupBy(c.id)
      .orderBy(desc(uses), asc(c.name))
      .limit(MANUAL_CATEGORIES_MAX)

    const [typedRows, merchantRows, pickable, categoryRows] = await Promise.all(
      [
        typed,
        merchants,
        this.db
          .select({ id: c.id })
          .from(c)
          .where(and(eq(c.kind, kind), isNull(c.archivedAt))),
        mostUsed,
      ],
    )
    const groups: SuggestionGroup[] = [
      ...typedRows.map((row) => ({ ...row, manual: true })),
      ...merchantRows.map((row) => ({ ...row, manual: false })),
    ]
    return {
      items: rankSuggestions(
        groups,
        new Set(pickable.map((category) => category.id)),
        MANUAL_SUGGESTIONS_MAX,
      ),
      categoryIds: categoryRows.map((category) => category.id),
    }
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.db
      .delete(transactionsTable)
      .where(
        and(eq(transactionsTable.id, id), eq(transactionsTable.manual, true)),
      )
      .returning({ id: transactionsTable.id })
    if (deleted.length === 0) {
      throw new NotFoundException('Manual transaction not found')
    }
  }

  private async findManual(tx: Tx, id: string) {
    const [row] = await tx
      .select({
        rawLabel: transactionsTable.rawLabel,
        categoryId: transactionsTable.categoryId,
        amountCents: transactionsTable.amountCents,
        accountId: transactionsTable.accountId,
        bookingDate: transactionsTable.bookingDate,
        kind: transactionsTable.kind,
      })
      .from(transactionsTable)
      .where(
        and(eq(transactionsTable.id, id), eq(transactionsTable.manual, true)),
      )
      .for('update')
    if (!row) throw new NotFoundException('Manual transaction not found')
    const split = await this.transactions.isSplit(id, tx)
    return { ...row, split }
  }

  /**
   * A payment with the meal-voucher card (an expense out of a `meal_voucher`
   * account) is refused when the card's payments of that day, this one
   * included (and its previous version left out), would go over the daily
   * cap. Refunds and credits are never capped.
   */
  private async checkVoucherCap(
    tx: Tx,
    entry: {
      id?: string
      accountId: string
      bookingDate: string
      amountCents: number
      kind: TransactionKind
    },
  ): Promise<void> {
    if (entry.kind !== 'expense' || entry.amountCents >= 0) return
    const t = transactionsTable
    const [account] = await tx
      .select({ type: accountsTable.type })
      .from(accountsTable)
      .where(eq(accountsTable.id, entry.accountId))
    if (account?.type !== 'meal_voucher') return
    const [{ paid }] = await tx
      .select({
        paid: sql<string>`coalesce(sum(-${t.amountCents}), 0)`,
      })
      .from(t)
      .where(
        and(
          eq(t.accountId, entry.accountId),
          eq(t.bookingDate, entry.bookingDate),
          eq(t.kind, 'expense'),
          sql`${t.amountCents} < 0`,
          entry.id === undefined ? undefined : ne(t.id, entry.id),
        ),
      )
    if (Number(paid) - entry.amountCents > MEAL_VOUCHER_DAILY_CAP_CENTS) {
      throw new BadRequestException(
        'Meal-voucher payments are capped at 25 € a day',
      )
    }
  }

  private async requireCategory(tx: Tx, id: string) {
    const [category] = await tx
      .select({
        id: categoriesTable.id,
        name: categoriesTable.name,
        kind: categoriesTable.kind,
      })
      .from(categoriesTable)
      .where(eq(categoriesTable.id, id))
      .limit(1)
    if (!category) {
      throw new BadRequestException('categoryId does not match any category')
    }
    return category
  }

  private async requireAccount(tx: Tx, id: string): Promise<string> {
    const [account] = await tx
      .select({
        id: accountsTable.id,
        type: accountsTable.type,
        archivedAt: accountsTable.archivedAt,
      })
      .from(accountsTable)
      .where(eq(accountsTable.id, id))
      .limit(1)
    if (!account) {
      throw new BadRequestException('accountId does not match any account')
    }
    if (!isTransactionalAccount(account) || account.archivedAt) {
      throw new BadRequestException(
        'accountId must be an open checking, savings or meal voucher account',
      )
    }
    return account.id
  }

  /** The first open checking account (oldest). */
  private async defaultAccount(tx: Tx): Promise<string> {
    const [account] = await tx
      .select({ id: accountsTable.id })
      .from(accountsTable)
      .where(
        and(
          eq(accountsTable.type, 'checking'),
          isNull(accountsTable.archivedAt),
        ),
      )
      .orderBy(asc(accountsTable.createdAt), asc(accountsTable.id))
      .limit(1)
    if (!account) {
      throw new BadRequestException(
        'No checking account: create one or pass accountId',
      )
    }
    return account.id
  }

  /** A transaction entered by hand has happened: never after today (Paris). */
  private checkDate(day: string, now: Date): string {
    if (day > parisToday(now)) {
      throw new BadRequestException('bookingDate cannot be in the future')
    }
    return day
  }
}
