import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq, isNull } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { randomUUID } from 'node:crypto'
import { isTransactionalAccount } from '#/accounts/accounts.service'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  transactionsTable,
} from '#/database/schema'
import { parisToday } from '#/investments/days'
import type {
  CreateManualExpenseDto,
  UpdateManualExpenseDto,
} from './dto/manual-expense.dto'
import type { TransactionDto } from './dto/transaction.dto'
import { TransactionsService } from './transactions.service'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * Prefix of the dedupe hash of a manual expense. The hash column is the
 * identity of a bank row; a manual expense has none, so it gets a random one
 * that no import can produce (imports use 64 hex characters).
 */
const MANUAL_HASH_PREFIX = 'manual:'

/**
 * Expenses noted by hand during the month (#137): amount, expense category,
 * day, optional label, account. Stored as `expense` transactions flagged
 * `manual`, without an import; the CIC import replaces each one by its bank
 * row (`imports/reconcile/`). They never count as imported data
 * (`coverage/`). A minimal subset of manual transactions (#74).
 */
@Injectable()
export class ManualExpensesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly transactions: TransactionsService,
  ) {}

  private get db(): Db {
    return this.database.db
  }

  async create(
    dto: CreateManualExpenseDto,
    now: Date = new Date(),
  ): Promise<TransactionDto> {
    const id = await this.db.transaction(async (tx) => {
      const category = await this.expenseCategory(tx, dto.categoryId)
      const accountId = dto.accountId
        ? await this.requireAccount(tx, dto.accountId)
        : await this.defaultAccount(tx)
      const bookingDate = this.checkDate(dto.bookingDate ?? parisToday(now), now)
      const [row] = await tx
        .insert(transactionsTable)
        .values({
          accountId,
          bookingDate,
          amountCents: -dto.amountCents,
          rawLabel: dto.label ?? category.name,
          kind: 'expense',
          categoryId: category.id,
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
   * a category change; `label: null` goes back to the default.
   */
  async update(
    id: string,
    dto: UpdateManualExpenseDto,
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
      let categoryName = defaultLabel
      if (dto.categoryId !== undefined) {
        const category = await this.expenseCategory(tx, dto.categoryId)
        set.categoryId = category.id
        set.kind = 'expense'
        categoryName = category.name
      }
      if (dto.amountCents !== undefined) set.amountCents = -dto.amountCents
      if (dto.bookingDate !== undefined) {
        set.bookingDate = this.checkDate(dto.bookingDate, now)
      }
      if (dto.accountId !== undefined) {
        set.accountId = await this.requireAccount(tx, dto.accountId)
      }
      if (dto.label !== undefined) {
        set.rawLabel = dto.label ?? categoryName ?? current.rawLabel
      } else if (dto.categoryId !== undefined && labelIsDefault) {
        set.rawLabel = categoryName
      }
      if (Object.keys(set).length === 0) {
        throw new BadRequestException('Nothing to update')
      }
      await tx
        .update(transactionsTable)
        .set(set)
        .where(eq(transactionsTable.id, id))
    })
    return this.transactions.findOne(id)
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.db
      .delete(transactionsTable)
      .where(
        and(eq(transactionsTable.id, id), eq(transactionsTable.manual, true)),
      )
      .returning({ id: transactionsTable.id })
    if (deleted.length === 0) {
      throw new NotFoundException('Manual expense not found')
    }
  }

  private async findManual(tx: Tx, id: string) {
    const [row] = await tx
      .select({
        rawLabel: transactionsTable.rawLabel,
        categoryId: transactionsTable.categoryId,
      })
      .from(transactionsTable)
      .where(
        and(eq(transactionsTable.id, id), eq(transactionsTable.manual, true)),
      )
      .for('update')
    if (!row) throw new NotFoundException('Manual expense not found')
    return row
  }

  private async expenseCategory(tx: Tx, id: string) {
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
    if (category.kind !== 'expense') {
      throw new BadRequestException('categoryId must be an expense category')
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
        'accountId must be an open checking or savings account',
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

  /** An expense noted by hand has happened: never after today (Paris). */
  private checkDate(day: string, now: Date): string {
    if (day > parisToday(now)) {
      throw new BadRequestException('bookingDate cannot be in the future')
    }
    return day
  }
}
