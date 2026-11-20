import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { CategoryIcon } from '#/categories/category-icons'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  categorizationRulesTable,
  recurringItemsTable,
  transactionLinesView,
  transactionSplitsTable,
  transactionsTable,
} from '#/database/schema'
import {
  type BulkUpdateTransactionsDto,
  type ListTransactionsQueryDto,
  TRANSACTIONS_PAGE_LIMIT_DEFAULT,
  type TransactionDto,
  type TransactionFiltersQueryDto,
  type TransactionListDto,
  type TransactionSort,
  type SplitPartDto,
  type TransactionSplitDto,
  type TransactionSummaryDto,
  type UpdateTransactionDto,
} from './dto/transaction.dto'
import type { CorrectTransactionDto } from './dto/manual-transaction.dto'
import { splitPartKind } from './split-kind'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** The database or an open transaction. */
type Executor = Db | Tx

type TransactionChanges = Omit<
  UpdateTransactionDto,
  'note' | 'counterpartAccountId'
> & {
  note?: string | null
}

/** Column values of an `UPDATE transactions SET ...`. */
type TransactionSet = Partial<{
  [K in keyof typeof transactionsTable.$inferInsert]:
    | (typeof transactionsTable.$inferInsert)[K]
    | SQL
}>

/** The account a transfer is linked to (#296). */
const counterpartAccounts = alias(accountsTable, 'counterpart_accounts')

/** Columns of a transaction as the API returns it (account name, category). */
const transactionColumns = {
  id: transactionsTable.id,
  accountId: transactionsTable.accountId,
  accountName: accountsTable.name,
  importId: transactionsTable.importId,
  bookingDate: transactionsTable.bookingDate,
  valueDate: transactionsTable.valueDate,
  amountCents: transactionsTable.amountCents,
  rawLabel: transactionsTable.rawLabel,
  merchant: transactionsTable.merchant,
  kind: transactionsTable.kind,
  counterpartAccountId: transactionsTable.counterpartAccountId,
  counterpartAccountName: counterpartAccounts.name,
  categoryId: transactionsTable.categoryId,
  categoryKey: categoriesTable.id,
  categorySlug: categoriesTable.slug,
  categoryName: categoriesTable.name,
  categoryColor: categoriesTable.color,
  categoryIcon: categoriesTable.icon,
  categoryKind: categoriesTable.kind,
  ruleId: transactionsTable.ruleId,
  needsReview: transactionsTable.needsReview,
  isOneOff: transactionsTable.isOneOff,
  note: transactionsTable.note,
  manual: transactionsTable.manual,
  prepaidItemId: transactionsTable.prepaidItemId,
  prepaidTermMonths: sql<
    number | null
  >`(select ${recurringItemsTable.termMonths} from ${recurringItemsTable} where ${recurringItemsTable.id} = ${transactionsTable.prepaidItemId})`,
  originalAmountCents: transactionsTable.originalAmountCents,
  originalBookingDate: transactionsTable.originalBookingDate,
  createdAt: transactionsTable.createdAt,
  updatedAt: transactionsTable.updatedAt,
}

type TransactionRow = Omit<TransactionDto, 'category' | 'splits'> & {
  categoryKey: string | null
  categorySlug: string | null
  categoryName: string | null
  categoryColor: string | null
  categoryIcon: CategoryIcon | null
  categoryKind: TransactionDto['kind'] | null
}

function toDto(
  row: TransactionRow,
  splits: TransactionSplitDto[] = [],
): TransactionDto {
  const {
    categoryKey,
    categorySlug,
    categoryName,
    categoryColor,
    categoryIcon,
    categoryKind,
    ...transaction
  } = row
  return {
    ...transaction,
    category:
      categoryKey === null
        ? null
        : {
            id: categoryKey,
            slug: categorySlug!,
            name: categoryName!,
            color: categoryColor,
            icon: categoryIcon,
            kind: categoryKind!,
          },
    splits,
  }
}

/**
 * First day of a `YYYY-MM` month and first day of the next one, as calendar
 * date strings: plain arithmetic, no `Date`, so no time zone can shift them.
 */
export function monthBounds(month: string): { start: string; next: string } {
  const [year, monthNumber] = month.split('-').map(Number)
  const nextYear = monthNumber === 12 ? year + 1 : year
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1
  const pad = (value: number, length: number) =>
    String(value).padStart(length, '0')
  return {
    start: `${month}-01`,
    next: `${pad(nextYear, 4)}-${pad(nextMonth, 2)}-01`,
  }
}

/** ORDER BY of each sort; ties end on id so pages never overlap. */
function orderBy(sort: TransactionSort): SQL[] {
  const t = transactionsTable
  switch (sort) {
    case 'date_asc':
      return [asc(t.bookingDate), asc(t.id)]
    case 'amount_asc':
      return [asc(t.amountCents), desc(t.bookingDate), desc(t.id)]
    case 'amount_desc':
      return [desc(t.amountCents), desc(t.bookingDate), desc(t.id)]
    case 'date_desc':
      return [desc(t.bookingDate), desc(t.id)]
  }
}

/** `coalesce(sum(amount) filter (where ...), 0)` as a JS number of cents. */
function sumWhere(condition: SQL) {
  return sql<number>`coalesce(sum(${transactionLinesView.amountCents}) filter (where ${condition}), 0)::bigint`.mapWith(
    Number,
  )
}

/** Escapes `%`, `_` and `\` for a literal `ILIKE` pattern. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

/**
 * Transactions as the user sees and corrects them: listing with filters, the
 * review queue counter, and manual changes (category, kind, one-off flag,
 * note, review flag), one at a time or in bulk.
 *
 * Manual categorization rules (see `CLAUDE.md`): a category set here is a
 * manual one (`ruleId` = null), which `POST /categorization-rules/apply` never
 * overwrites.
 */
@Injectable()
export class TransactionsService {
  constructor(private readonly database: DatabaseService) {}

  private get db(): Db {
    return this.database.db
  }

  /**
   * Filtered page, newest booking date first by default (ties: id,
   * descending); see `ListTransactionsQueryDto.sort` for the other orders.
   */
  async list(
    query: ListTransactionsQueryDto,
    executor: Executor = this.db,
  ): Promise<TransactionListDto> {
    const page = query.page ?? 1
    const limit = query.limit ?? TRANSACTIONS_PAGE_LIMIT_DEFAULT
    const where = this.filters(query)

    const [rows, [{ total }]] = await Promise.all([
      this.select(executor)
        .where(where)
        .orderBy(...orderBy(query.sort ?? 'date_desc'))
        .limit(limit)
        .offset((page - 1) * limit),
      executor.select({ total: count() }).from(transactionsTable).where(where),
    ])
    return {
      items: await this.withSplits(rows, executor),
      total,
      page,
      limit,
    }
  }

  /**
   * Totals of the transactions matching the filters. Income and expense only
   * sum their own kind: transfers between the user's own accounts are counted
   * apart (`transferCount`) and never reach the sums.
   */
  async summary(
    query: TransactionFiltersQueryDto,
    executor: Executor = this.db,
  ): Promise<TransactionSummaryDto> {
    // Lines: a split counts each part in its category (filter included) and
    // is still one transaction in the counts.
    const t = transactionLinesView
    const isIncome = eq(t.kind, 'income')
    const isExpense = eq(t.kind, 'expense')
    const [row] = await executor
      .select({
        count: sql<number>`count(distinct ${t.id})`.mapWith(Number),
        transferCount:
          sql<number>`count(distinct ${t.id}) filter (where ${eq(t.kind, 'transfer')})`.mapWith(
            Number,
          ),
        incomeCents: sumWhere(isIncome),
        expenseCents: sumWhere(isExpense),
        oneOffIncomeCents: sumWhere(and(isIncome, eq(t.isOneOff, true))!),
        oneOffExpenseCents: sumWhere(and(isExpense, eq(t.isOneOff, true))!),
      })
      .from(t)
      .where(this.filters(query, t))
    return {
      count: row.count,
      incomeCents: row.incomeCents,
      expenseCents: row.expenseCents,
      netCents: row.incomeCents + row.expenseCents,
      oneOffIncomeCents: row.oneOffIncomeCents,
      oneOffExpenseCents: row.oneOffExpenseCents,
      transferCount: row.transferCount,
    }
  }

  /** Size of the review queue. */
  async reviewCount(executor: Executor = this.db): Promise<number> {
    const [{ value }] = await executor
      .select({ value: count() })
      .from(transactionsTable)
      .where(eq(transactionsTable.needsReview, true))
    return value
  }

  async findOne(
    id: string,
    executor: Executor = this.db,
  ): Promise<TransactionDto> {
    const [row] = await this.select(executor)
      .where(eq(transactionsTable.id, id))
      .limit(1)
    if (!row) throw new NotFoundException('Transaction not found')
    const [item] = await this.withSplits([row], executor)
    return item
  }

  /** Whether the transaction is split between categories. */
  async isSplit(id: string, executor: Executor = this.db): Promise<boolean> {
    const [part] = await executor
      .select({ id: transactionSplitsTable.id })
      .from(transactionSplitsTable)
      .where(eq(transactionSplitsTable.transactionId, id))
      .limit(1)
    return part !== undefined
  }

  /**
   * Splits a transaction between categories, replacing any previous split.
   * The parts keep its sign, are never 0 and sum exactly to its amount; the
   * transaction takes the category of its largest part (first on a tie),
   * filed by hand and out of review. Statistics count each part with its
   * category's kind (#357, `splitPartKind`): an incoming part in an expense
   * category is a refund of it. A transfer category is refused beside income
   * or expense categories, since such a part would keep the transaction's
   * kind while the others take theirs.
   */
  split(id: string, parts: SplitPartDto[]): Promise<TransactionDto> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ amountCents: transactionsTable.amountCents })
        .from(transactionsTable)
        .where(eq(transactionsTable.id, id))
        .for('update')
      if (!current) throw new NotFoundException('Transaction not found')
      const sign = Math.sign(current.amountCents)
      if (parts.some((part) => Math.sign(part.amountCents) !== sign)) {
        throw new BadRequestException(
          'Every part must have the sign of the transaction',
        )
      }
      const total = parts.reduce((sum, part) => sum + part.amountCents, 0)
      if (total !== current.amountCents) {
        throw new BadRequestException(
          'The parts must sum to the transaction amount',
        )
      }
      const categoryIds = [...new Set(parts.map((part) => part.categoryId))]
      const known = await tx
        .select({ id: categoriesTable.id, kind: categoriesTable.kind })
        .from(categoriesTable)
        .where(inArray(categoriesTable.id, categoryIds))
      if (known.length !== categoryIds.length) {
        throw new BadRequestException('categoryId does not match any category')
      }
      const transfers = known.filter((category) => category.kind === 'transfer')
      if (transfers.length > 0 && transfers.length < known.length) {
        throw new BadRequestException(
          'A transfer category cannot be mixed with income or expense categories in a split',
        )
      }
      const largest = parts.reduce((best, part) =>
        Math.abs(part.amountCents) > Math.abs(best.amountCents) ? part : best,
      )
      await tx
        .delete(transactionSplitsTable)
        .where(eq(transactionSplitsTable.transactionId, id))
      await tx.insert(transactionSplitsTable).values(
        parts.map((part, position) => ({
          transactionId: id,
          categoryId: part.categoryId,
          amountCents: part.amountCents,
          position,
        })),
      )
      await tx
        .update(transactionsTable)
        .set({
          categoryId: largest.categoryId,
          ruleId: null,
          needsReview: false,
        })
        .where(eq(transactionsTable.id, id))
      return this.findOne(id, tx)
    })
  }

  /** Puts a split transaction back in one category (its current one). */
  unsplit(id: string): Promise<TransactionDto> {
    return this.db.transaction(async (tx) => {
      await this.findOne(id, tx)
      await tx
        .delete(transactionSplitsTable)
        .where(eq(transactionSplitsTable.transactionId, id))
      return this.findOne(id, tx)
    })
  }

  /**
   * Corrects the amount or date of an imported row by hand ("modifier une
   * opération importée"). The bank values are kept the first time
   * (`originalAmountCents`, `originalBookingDate`) and keep feeding balances,
   * continuity checks, coverage and the dedupe of later imports, so a
   * re-import never duplicates or overwrites the correction. Setting a value
   * back to the bank's drops its original. Rows entered by hand are edited
   * through `PATCH /transactions/manual/{id}` instead.
   */
  correct(id: string, dto: CorrectTransactionDto): Promise<TransactionDto> {
    if (dto.amountCents === undefined && dto.bookingDate === undefined) {
      throw new BadRequestException('Nothing to update')
    }
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          manual: transactionsTable.manual,
          amountCents: transactionsTable.amountCents,
          bookingDate: transactionsTable.bookingDate,
          originalAmountCents: transactionsTable.originalAmountCents,
          originalBookingDate: transactionsTable.originalBookingDate,
        })
        .from(transactionsTable)
        .where(eq(transactionsTable.id, id))
        .for('update')
      if (!current) throw new NotFoundException('Transaction not found')
      if (current.manual) {
        throw new BadRequestException(
          'A manual transaction is edited through PATCH /transactions/manual/{id}',
        )
      }
      const set: TransactionSet = {}
      if (
        dto.amountCents !== undefined &&
        dto.amountCents !== current.amountCents
      ) {
        if (await this.isSplit(id, tx)) {
          throw new BadRequestException(
            'The transaction is split: remove the split before changing its amount',
          )
        }
        const bank = current.originalAmountCents ?? current.amountCents
        set.amountCents = dto.amountCents
        set.originalAmountCents = dto.amountCents === bank ? null : bank
      }
      if (
        dto.bookingDate !== undefined &&
        dto.bookingDate !== current.bookingDate
      ) {
        const bank = current.originalBookingDate ?? current.bookingDate
        set.bookingDate = dto.bookingDate
        set.originalBookingDate = dto.bookingDate === bank ? null : bank
      }
      if (Object.keys(set).length > 0) {
        await tx
          .update(transactionsTable)
          .set(set)
          .where(eq(transactionsTable.id, id))
      }
      return this.findOne(id, tx)
    })
  }

  /** Puts the bank amount and date of a corrected imported row back. */
  restoreBankValues(id: string): Promise<TransactionDto> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          originalAmountCents: transactionsTable.originalAmountCents,
          amountCents: transactionsTable.amountCents,
        })
        .from(transactionsTable)
        .where(eq(transactionsTable.id, id))
        .for('update')
      if (!current) throw new NotFoundException('Transaction not found')
      if (
        current.originalAmountCents !== null &&
        current.originalAmountCents !== current.amountCents &&
        (await this.isSplit(id, tx))
      ) {
        throw new BadRequestException(
          'The transaction is split: remove the split before changing its amount',
        )
      }
      await tx
        .update(transactionsTable)
        .set({
          amountCents: sql`${transactionsTable.bankAmountCents}`,
          bookingDate: sql`${transactionsTable.bankBookingDate}`,
          originalAmountCents: null,
          originalBookingDate: null,
        })
        .where(eq(transactionsTable.id, id))
      return this.findOne(id, tx)
    })
  }

  /** Rows as the API returns them, with the parts of the split ones. */
  private async withSplits(
    rows: TransactionRow[],
    executor: Executor,
  ): Promise<TransactionDto[]> {
    if (rows.length === 0) return []
    const kinds = new Map(rows.map((row) => [row.id, row.kind]))
    const s = transactionSplitsTable
    const parts = await executor
      .select({
        id: s.id,
        transactionId: s.transactionId,
        categoryId: s.categoryId,
        amountCents: s.amountCents,
        slug: categoriesTable.slug,
        name: categoriesTable.name,
        color: categoriesTable.color,
        icon: categoriesTable.icon,
        kind: categoriesTable.kind,
      })
      .from(s)
      .innerJoin(categoriesTable, eq(categoriesTable.id, s.categoryId))
      .where(
        inArray(
          s.transactionId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(s.transactionId), asc(s.position))
    const byTransaction = new Map<string, TransactionSplitDto[]>()
    for (const part of parts) {
      const list = byTransaction.get(part.transactionId) ?? []
      list.push({
        id: part.id,
        categoryId: part.categoryId,
        amountCents: part.amountCents,
        kind: splitPartKind(kinds.get(part.transactionId)!, part.kind),
        category: {
          id: part.categoryId,
          slug: part.slug,
          name: part.name,
          color: part.color,
          icon: part.icon,
          kind: part.kind,
        },
      })
      byTransaction.set(part.transactionId, list)
    }
    return rows.map((row) => toDto(row, byTransaction.get(row.id)))
  }

  /** Partial update of one transaction; returns it as listed. */
  update(id: string, dto: UpdateTransactionDto): Promise<TransactionDto> {
    return this.db.transaction(async (tx) => {
      const current = await this.findOne(id, tx)
      const { counterpartAccountId, ...changes } = dto
      const set = await this.resolveChanges(tx, changes)
      if (counterpartAccountId !== undefined) {
        await this.assertCounterpart(tx, current, set, counterpartAccountId)
        set.counterpartAccountId = counterpartAccountId
      }
      if (Object.keys(set).length > 0) {
        await tx
          .update(transactionsTable)
          .set(set)
          .where(eq(transactionsTable.id, id))
      }
      if (dto.categoryId !== undefined) await this.dropSplits(tx, [id])
      return this.findOne(id, tx)
    })
  }

  /**
   * Applies the same changes to every listed transaction, in one database
   * transaction. Unknown ids are skipped; returns how many rows changed.
   */
  bulkUpdate({
    ids,
    ...changes
  }: BulkUpdateTransactionsDto): Promise<{ updated: number }> {
    return this.db.transaction(async (tx) => {
      const set = await this.resolveChanges(tx, changes)
      if (Object.keys(set).length === 0) {
        throw new BadRequestException('Nothing to update')
      }
      const updated = await tx
        .update(transactionsTable)
        .set(set)
        .where(inArray(transactionsTable.id, ids))
        .returning({ id: transactionsTable.id })
      if (changes.categoryId !== undefined) {
        await this.dropSplits(
          tx,
          updated.map((row) => row.id),
        )
      }
      return { updated: updated.length }
    })
  }

  /**
   * A counterpart is the owner's other account of a transfer (#296): only on
   * a transaction that is (or becomes) a transfer, never its own account.
   */
  private async assertCounterpart(
    executor: Executor,
    current: Pick<TransactionDto, 'accountId' | 'kind'>,
    set: TransactionSet,
    counterpartAccountId: string | null,
  ) {
    if (counterpartAccountId === null) return
    const kind = typeof set.kind === 'string' ? set.kind : current.kind
    if (kind !== 'transfer') {
      throw new BadRequestException(
        'Only a transfer can be linked to another account',
      )
    }
    if (counterpartAccountId === current.accountId) {
      throw new BadRequestException(
        'counterpartAccountId must be another account than the transaction’s',
      )
    }
    const [account] = await executor
      .select({ id: accountsTable.id })
      .from(accountsTable)
      .where(eq(accountsTable.id, counterpartAccountId))
      .limit(1)
    if (!account) {
      throw new BadRequestException(
        'counterpartAccountId does not match any account',
      )
    }
  }

  /** A category chosen for the whole transaction ends its split. */
  private async dropSplits(executor: Executor, ids: string[]) {
    if (ids.length === 0) return
    await executor
      .delete(transactionSplitsTable)
      .where(inArray(transactionSplitsTable.transactionId, ids))
  }

  private select(executor: Executor) {
    return executor
      .select(transactionColumns)
      .from(transactionsTable)
      .innerJoin(
        accountsTable,
        eq(accountsTable.id, transactionsTable.accountId),
      )
      .leftJoin(
        categoriesTable,
        eq(categoriesTable.id, transactionsTable.categoryId),
      )
      .leftJoin(
        counterpartAccounts,
        eq(counterpartAccounts.id, transactionsTable.counterpartAccountId),
      )
  }

  /**
   * WHERE clause of the filters; rejects contradictory combinations. On the
   * transactions, a category matches the transaction's own or one of its
   * split parts; on the lines (`transactionLinesView`), the line's.
   */
  private filters(
    query: TransactionFiltersQueryDto,
    source:
      | typeof transactionsTable
      | typeof transactionLinesView = transactionsTable,
  ): SQL | undefined {
    const transactionsTable = source
    if (query.categoryId !== undefined && query.uncategorized !== undefined) {
      throw new BadRequestException(
        'categoryId and uncategorized cannot be combined',
      )
    }
    if (
      query.month !== undefined &&
      (query.from !== undefined || query.to !== undefined)
    ) {
      throw new BadRequestException('month cannot be combined with from or to')
    }
    const conditions: (SQL | undefined)[] = []
    if (query.ids !== undefined) {
      conditions.push(inArray(transactionsTable.id, query.ids))
    }
    if (query.needsReview !== undefined) {
      conditions.push(eq(transactionsTable.needsReview, query.needsReview))
    }
    if (query.isOneOff !== undefined) {
      conditions.push(eq(transactionsTable.isOneOff, query.isOneOff))
    }
    if (query.accountId !== undefined) {
      conditions.push(eq(transactionsTable.accountId, query.accountId))
    }
    if (query.categoryId !== undefined) {
      const ownCategory = eq(transactionsTable.categoryId, query.categoryId)
      conditions.push(
        source === transactionLinesView
          ? ownCategory
          : or(
              ownCategory,
              sql`exists (select 1 from ${transactionSplitsTable} where ${transactionSplitsTable.transactionId} = ${transactionsTable.id} and ${transactionSplitsTable.categoryId} = ${query.categoryId})`,
            ),
      )
    }
    if (query.counterpartAccountId !== undefined) {
      // The lines view has no counterpart: the transaction table does.
      const table = schema.transactionsTable
      const linked = eq(table.counterpartAccountId, query.counterpartAccountId)
      conditions.push(
        source === transactionLinesView
          ? sql`${source.id} in (select ${table.id} from ${table} where ${linked})`
          : linked,
      )
    }
    if (query.uncategorized !== undefined) {
      conditions.push(
        query.uncategorized
          ? isNull(transactionsTable.categoryId)
          : isNotNull(transactionsTable.categoryId),
      )
    }
    if (query.kind !== undefined) {
      conditions.push(eq(transactionsTable.kind, query.kind))
    }
    if (query.from !== undefined) {
      conditions.push(gte(transactionsTable.bookingDate, query.from))
    }
    if (query.to !== undefined) {
      conditions.push(lte(transactionsTable.bookingDate, query.to))
    }
    if (query.month !== undefined) {
      const { start, next } = monthBounds(query.month)
      conditions.push(
        gte(transactionsTable.bookingDate, start),
        lt(transactionsTable.bookingDate, next),
      )
    }
    if (query.q) {
      const pattern = likePattern(query.q)
      conditions.push(
        or(
          ilike(transactionsTable.rawLabel, pattern),
          ilike(transactionsTable.merchant, pattern),
        ),
      )
    }
    return conditions.length > 0 ? and(...conditions) : undefined
  }

  /**
   * Turns requested changes into column values, applied alike to one or many
   * transactions:
   *
   * - a category files the transaction by hand (`ruleId` = null unless a rule
   *   categorization is being restored), sets the category's kind unless
   *   `kind` is given, and leaves review unless `needsReview` is given;
   * - removing the category (`null`) also clears the rule and keeps the kind;
   * - a kind change alone files a rule-categorized transaction by hand when
   *   the kind actually changes, so re-applying the rules does not undo it.
   */
  private async resolveChanges(
    executor: Executor,
    dto: TransactionChanges,
  ): Promise<TransactionSet> {
    const set: TransactionSet = {}

    if (dto.ruleId !== undefined) {
      if (dto.categoryId == null) {
        throw new BadRequestException('ruleId requires a categoryId')
      }
      if (dto.ruleId !== null) {
        const [rule] = await executor
          .select({ categoryId: categorizationRulesTable.categoryId })
          .from(categorizationRulesTable)
          .where(eq(categorizationRulesTable.id, dto.ruleId))
          .limit(1)
        if (!rule) {
          throw new BadRequestException('ruleId does not match any rule')
        }
        if (rule.categoryId !== dto.categoryId) {
          throw new BadRequestException(
            'categoryId must be the category of the rule',
          )
        }
      }
    }

    if (dto.categoryId !== undefined) {
      set.categoryId = dto.categoryId
      set.ruleId = dto.ruleId ?? null
      if (dto.categoryId === null) {
        if (dto.kind !== undefined) set.kind = dto.kind
        if (dto.needsReview !== undefined) set.needsReview = dto.needsReview
      } else {
        const [category] = await executor
          .select({ kind: categoriesTable.kind })
          .from(categoriesTable)
          .where(eq(categoriesTable.id, dto.categoryId))
          .limit(1)
        if (!category) {
          throw new BadRequestException(
            'categoryId does not match any category',
          )
        }
        set.kind = dto.kind ?? category.kind
        set.needsReview = dto.needsReview ?? false
      }
    } else {
      if (dto.kind !== undefined) {
        set.kind = dto.kind
        set.ruleId = sql`case when ${transactionsTable.kind} = ${dto.kind}::transaction_kind then ${transactionsTable.ruleId} else null end`
      }
      if (dto.needsReview !== undefined) set.needsReview = dto.needsReview
    }

    if (dto.isOneOff !== undefined) set.isOneOff = dto.isOneOff
    if (dto.note !== undefined) set.note = dto.note
    // Only transfers are linked to another account (#296).
    if (set.kind !== undefined && set.kind !== 'transfer') {
      set.counterpartAccountId = null
    }
    // Only an expense pays a prepaid subscription (#314).
    if (set.kind !== undefined && set.kind !== 'expense') {
      set.prepaidItemId = null
    }
    return set
  }
}
