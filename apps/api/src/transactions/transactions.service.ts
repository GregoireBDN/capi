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
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  categorizationRulesTable,
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
  type TransactionSummaryDto,
  type UpdateTransactionDto,
} from './dto/transaction.dto'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** The database or an open transaction. */
type Executor = Db | Tx

type TransactionChanges = Omit<UpdateTransactionDto, 'note'> & {
  note?: string | null
}

/** Column values of an `UPDATE transactions SET ...`. */
type TransactionSet = Partial<{
  [K in keyof typeof transactionsTable.$inferInsert]:
    | (typeof transactionsTable.$inferInsert)[K]
    | SQL
}>

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
  categoryId: transactionsTable.categoryId,
  categoryKey: categoriesTable.id,
  categorySlug: categoriesTable.slug,
  categoryName: categoriesTable.name,
  categoryColor: categoriesTable.color,
  categoryKind: categoriesTable.kind,
  ruleId: transactionsTable.ruleId,
  needsReview: transactionsTable.needsReview,
  isOneOff: transactionsTable.isOneOff,
  note: transactionsTable.note,
  manual: transactionsTable.manual,
  createdAt: transactionsTable.createdAt,
  updatedAt: transactionsTable.updatedAt,
}

type TransactionRow = Omit<TransactionDto, 'category'> & {
  categoryKey: string | null
  categorySlug: string | null
  categoryName: string | null
  categoryColor: string | null
  categoryKind: TransactionDto['kind'] | null
}

function toDto(row: TransactionRow): TransactionDto {
  const {
    categoryKey,
    categorySlug,
    categoryName,
    categoryColor,
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
            kind: categoryKind!,
          },
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
  return sql<number>`coalesce(sum(${transactionsTable.amountCents}) filter (where ${condition}), 0)::bigint`.mapWith(
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
    return { items: rows.map(toDto), total, page, limit }
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
    const t = transactionsTable
    const isIncome = eq(t.kind, 'income')
    const isExpense = eq(t.kind, 'expense')
    const [row] = await executor
      .select({
        count: count(),
        transferCount:
          sql<number>`count(*) filter (where ${eq(t.kind, 'transfer')})`.mapWith(
            Number,
          ),
        incomeCents: sumWhere(isIncome),
        expenseCents: sumWhere(isExpense),
        oneOffIncomeCents: sumWhere(and(isIncome, eq(t.isOneOff, true))!),
        oneOffExpenseCents: sumWhere(and(isExpense, eq(t.isOneOff, true))!),
      })
      .from(t)
      .where(this.filters(query))
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
    return toDto(row)
  }

  /** Partial update of one transaction; returns it as listed. */
  update(id: string, dto: UpdateTransactionDto): Promise<TransactionDto> {
    return this.db.transaction(async (tx) => {
      await this.findOne(id, tx)
      const set = await this.resolveChanges(tx, dto)
      if (Object.keys(set).length > 0) {
        await tx
          .update(transactionsTable)
          .set(set)
          .where(eq(transactionsTable.id, id))
      }
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
      return { updated: updated.length }
    })
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
  }

  /** WHERE clause of the filters; rejects contradictory combinations. */
  private filters(query: TransactionFiltersQueryDto): SQL | undefined {
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
      conditions.push(eq(transactionsTable.categoryId, query.categoryId))
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
    return set
  }
}
