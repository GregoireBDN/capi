import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq, gte, inArray, lt, type SQL, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { AccountsService } from '#/accounts/accounts.service'
import { savingsRate } from '#/dashboard/dashboard.service'
import { currentMonth, monthsUntil, shiftMonth } from '#/dashboard/calendar'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  appSettingsTable,
  categoriesTable,
  savingsGoalAccountsTable,
  savingsGoalsTable,
  type SelectSavingsGoal,
  transactionsTable,
} from '#/database/schema'
import { parisToday } from '#/investments/days'
import { InvestmentsService } from '#/investments/investments.service'
import { monthBounds } from '#/transactions/transactions.service'
import {
  AVERAGE_WINDOWS,
  type CreateGoalDto,
  PROJECTION_WINDOW,
  type SavingsGoalDto,
  type SavingsMonthDto,
  type SavingsOverviewDto,
  type SavingsTargetResultDto,
  type UpdateGoalDto,
} from './dto/savings.dto'
import { averageOver, goalPlan, type MonthFigures } from './savings-math'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** The database or an open transaction. */
type Executor = Db | Tx

/** `app_settings` key of the monthly savings target (integer cents). */
export const MONTHLY_TARGET_KEY = 'savings.monthly_target_cents'

/** Categories whose checking-side transfers count as "moved to savings". */
const MOVED_CATEGORIES = {
  savings: 'savings_transfer',
  investments: 'investment_transfer',
} as const

const LONGEST_WINDOW = Math.max(...AVERAGE_WINDOWS)

/**
 * Savings figures and goals. Every figure follows the domain rules: integer
 * cents, Europe/Paris calendar months compared on `booking_date` strings,
 * and transfers between the user's own accounts are never income or expense
 * (the net savings of a month is exactly the dashboard's).
 *
 * "Moved to savings" is measured on the checking side only, so a move that
 * appears on both accounts (checking −100, Livret +100) is counted once: the
 * `transfer` transactions booked on `checking` accounts with the
 * `savings_transfer` (savings) or `investment_transfer` (investments)
 * category, sign flipped (money leaving checking is positive; a withdrawal
 * back to checking with the same category reduces it). Transfers filed under
 * another category (e.g. `internal_transfer`) are not counted.
 */
@Injectable()
export class SavingsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly accounts: AccountsService,
    private readonly investments: InvestmentsService,
  ) {}

  private get db(): Db {
    return this.database.db
  }

  /* ==========================================================================
   * OVERVIEW
   * ======================================================================= */

  async overview(
    count: number,
    {
      now = new Date(),
      executor = this.db,
    }: { now?: Date; executor?: Executor } = {},
  ): Promise<SavingsOverviewDto> {
    const current = currentMonth(now)
    // The averages need the full months before the current one, whatever
    // the number of months returned.
    const span = Math.max(count, LONGEST_WINDOW + 1)
    const [figures, firstDataMonth, target, accounts, investments] =
      await Promise.all([
        this.monthlyFigures(monthsUntil(current, span), executor),
        this.firstDataMonth(executor),
        this.readTarget(executor),
        this.accounts.list({}, executor),
        this.investments.summary(now),
      ])

    const months = monthsUntil(current, count).map((month): SavingsMonthDto => {
      const row = figures.get(month) ?? emptyFigures(month)
      const netCents = row.incomeCents + row.expenseCents
      const oneOffNetCents = row.oneOffIncomeCents + row.oneOffExpenseCents
      return {
        month,
        complete: month < current,
        incomeCents: row.incomeCents,
        expenseCents: row.expenseCents,
        netCents,
        savingsRate: savingsRate(row.incomeCents, netCents),
        oneOffIncomeCents: row.oneOffIncomeCents,
        oneOffExpenseCents: row.oneOffExpenseCents,
        oneOffNetCents,
        netExcludingOneOffsCents: netCents - oneOffNetCents,
        movedToSavingsCents: row.movedToSavingsCents,
        movedToInvestmentsCents: row.movedToInvestmentsCents,
        movedCents: row.movedToSavingsCents + row.movedToInvestmentsCents,
        targetGapCents: target === null ? null : netCents - target,
      }
    })

    const averages = AVERAGE_WINDOWS.map((window) =>
      averageOver(figures, current, window, firstDataMonth),
    )
    const projection = averages.find((a) => a.months === PROJECTION_WINDOW)!

    const cashAccounts = accounts
      .filter((account) => account.type === 'savings')
      .map((account) => ({
        id: account.id,
        name: account.name,
        type: account.type,
        institution: account.institution,
        balanceCents: account.balanceCents,
        balanceDate: account.balanceDate,
      }))
    const cashTotal = cashAccounts.reduce(
      (total, account) => total + (account.balanceCents ?? 0),
      0,
    )

    return {
      currentMonth: current,
      monthlyTargetCents: target,
      months,
      averages,
      projectionAverageCents: projection.netExcludingOneOffsCents,
      stock: {
        totalCents: cashTotal + investments.totals.valueCents,
        gainCents: investments.totals.gainCents,
        cash: { totalCents: cashTotal, accounts: cashAccounts },
        investments,
      },
    }
  }

  /** Average monthly savings the goal projections use (see the DTO). */
  async projectionAverage(
    now: Date,
    executor: Executor = this.db,
  ): Promise<number | null> {
    const current = currentMonth(now)
    const [figures, firstDataMonth] = await Promise.all([
      this.monthlyFigures(
        monthsUntil(shiftMonth(current, -1), PROJECTION_WINDOW),
        executor,
      ),
      this.firstDataMonth(executor),
    ])
    return averageOver(figures, current, PROJECTION_WINDOW, firstDataMonth)
      .netExcludingOneOffsCents
  }

  /**
   * Per `YYYY-MM`: income, expenses, their one-off parts and the amounts
   * moved to savings / investments, in one grouped query.
   */
  private async monthlyFigures(
    months: string[],
    executor: Executor,
  ): Promise<Map<string, MonthFigures>> {
    const t = transactionsTable
    const from = monthBounds(months[0]).start
    const until = monthBounds(months[months.length - 1]).next
    const month = sql<string>`to_char(${t.bookingDate}, 'YYYY-MM')`
    const sumWhere = (condition: SQL) =>
      sql<number>`coalesce(sum(${t.amountCents}) filter (where ${condition}), 0)::bigint`.mapWith(
        Number,
      )
    const moved = (slug: string) =>
      sql`${t.kind} = 'transfer' and ${accountsTable.type} = 'checking' and ${categoriesTable.slug} = ${slug}`

    const rows = await executor
      .select({
        month,
        incomeCents: sumWhere(sql`${t.kind} = 'income'`),
        expenseCents: sumWhere(sql`${t.kind} = 'expense'`),
        oneOffIncomeCents: sumWhere(
          sql`${t.kind} = 'income' and ${t.isOneOff}`,
        ),
        oneOffExpenseCents: sumWhere(
          sql`${t.kind} = 'expense' and ${t.isOneOff}`,
        ),
        movedToSavings: sumWhere(moved(MOVED_CATEGORIES.savings)),
        movedToInvestments: sumWhere(moved(MOVED_CATEGORIES.investments)),
      })
      .from(t)
      .innerJoin(accountsTable, eq(accountsTable.id, t.accountId))
      .leftJoin(categoriesTable, eq(categoriesTable.id, t.categoryId))
      .where(and(gte(t.bookingDate, from), lt(t.bookingDate, until)))
      .groupBy(month)

    return new Map(
      rows.map((row) => [
        row.month,
        {
          month: row.month,
          incomeCents: row.incomeCents,
          expenseCents: row.expenseCents,
          oneOffIncomeCents: row.oneOffIncomeCents,
          oneOffExpenseCents: row.oneOffExpenseCents,
          // `0 - 0` would give -0.
          movedToSavingsCents: -row.movedToSavings || 0,
          movedToInvestmentsCents: -row.movedToInvestments || 0,
        },
      ]),
    )
  }

  /** Month of the first income or expense transaction, if any. */
  private async firstDataMonth(executor: Executor): Promise<string | null> {
    const t = transactionsTable
    const [row] = await executor
      .select({ first: sql<string | null>`min(${t.bookingDate})` })
      .from(t)
      .where(inArray(t.kind, ['income', 'expense']))
    return row?.first ? row.first.slice(0, 7) : null
  }

  /* ==========================================================================
   * MONTHLY TARGET
   * ======================================================================= */

  async readTarget(executor: Executor = this.db): Promise<number | null> {
    const [row] = await executor
      .select({ value: appSettingsTable.value })
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, MONTHLY_TARGET_KEY))
    const value = row?.value
    return typeof value === 'number' && Number.isSafeInteger(value)
      ? value
      : null
  }

  /** Sets the monthly savings target, or clears it with null. */
  async setTarget(
    monthlyTargetCents: number | null,
    executor: Executor = this.db,
  ): Promise<SavingsTargetResultDto> {
    if (monthlyTargetCents === null) {
      await executor
        .delete(appSettingsTable)
        .where(eq(appSettingsTable.key, MONTHLY_TARGET_KEY))
    } else {
      await executor
        .insert(appSettingsTable)
        .values({ key: MONTHLY_TARGET_KEY, value: monthlyTargetCents })
        .onConflictDoUpdate({
          target: appSettingsTable.key,
          set: { value: monthlyTargetCents, updatedAt: new Date() },
        })
    }
    return { monthlyTargetCents }
  }

  /* ==========================================================================
   * GOALS
   * ======================================================================= */

  /** Active goals first (no date last), then archived ones when asked. */
  async listGoals(
    { includeArchived = false }: { includeArchived?: boolean } = {},
    {
      now = new Date(),
      executor = this.db,
    }: { now?: Date; executor?: Executor } = {},
  ): Promise<SavingsGoalDto[]> {
    const g = savingsGoalsTable
    const goals = await executor
      .select()
      .from(g)
      .where(includeArchived ? undefined : sql`${g.archivedAt} is null`)
      .orderBy(
        sql`${g.archivedAt} is not null`,
        sql`${g.targetDate} asc nulls last`,
        asc(g.createdAt),
        asc(g.id),
      )
    return this.withProgress(goals, now, executor)
  }

  async createGoal(
    dto: CreateGoalDto,
    {
      now = new Date(),
      executor = this.db,
    }: { now?: Date; executor?: Executor } = {},
  ): Promise<SavingsGoalDto> {
    const source = dto.source ?? 'accounts'
    const accountIds = dto.accountIds ?? []
    assertSource(source, accountIds)
    await this.assertAccountsExist(accountIds, executor)
    const [goal] = await executor
      .insert(savingsGoalsTable)
      .values({
        name: dto.name,
        targetCents: dto.targetCents,
        targetDate: dto.targetDate ?? null,
        source,
        manualAmountCents:
          source === 'manual' ? (dto.manualAmountCents ?? 0) : null,
        color: dto.color ?? null,
      })
      .returning()
    await this.linkAccounts(goal.id, accountIds, executor)
    const [result] = await this.withProgress([goal], now, executor)
    return result
  }

  async updateGoal(
    id: string,
    dto: UpdateGoalDto,
    {
      now = new Date(),
      executor = this.db,
    }: { now?: Date; executor?: Executor } = {},
  ): Promise<SavingsGoalDto> {
    const existing = await this.findGoal(id, executor)
    const source = dto.source ?? existing.source
    const accountIds =
      dto.accountIds ?? (await this.linkedAccountIds([id], executor)).get(id)!
    assertSource(source, accountIds)
    if (dto.accountIds) await this.assertAccountsExist(dto.accountIds, executor)

    const set: Partial<SelectSavingsGoal> = { updatedAt: now }
    if (dto.name !== undefined) set.name = dto.name
    if (dto.targetCents !== undefined) set.targetCents = dto.targetCents
    if (dto.targetDate !== undefined) set.targetDate = dto.targetDate
    if (dto.color !== undefined) set.color = dto.color
    set.source = source
    set.manualAmountCents =
      source === 'manual'
        ? (dto.manualAmountCents ?? existing.manualAmountCents ?? 0)
        : null
    if (dto.archived !== undefined) {
      set.archivedAt = dto.archived ? (existing.archivedAt ?? now) : null
    }

    const [goal] = await executor
      .update(savingsGoalsTable)
      .set(set)
      .where(eq(savingsGoalsTable.id, id))
      .returning()
    if (dto.accountIds) {
      await executor
        .delete(savingsGoalAccountsTable)
        .where(eq(savingsGoalAccountsTable.goalId, id))
      await this.linkAccounts(id, dto.accountIds, executor)
    }
    const [result] = await this.withProgress([goal], now, executor)
    return result
  }

  async removeGoal(id: string, executor: Executor = this.db): Promise<void> {
    const deleted = await executor
      .delete(savingsGoalsTable)
      .where(eq(savingsGoalsTable.id, id))
      .returning({ id: savingsGoalsTable.id })
    if (deleted.length === 0) throw new NotFoundException('Goal not found')
  }

  private async findGoal(
    id: string,
    executor: Executor,
  ): Promise<SelectSavingsGoal> {
    const [goal] = await executor
      .select()
      .from(savingsGoalsTable)
      .where(eq(savingsGoalsTable.id, id))
    if (!goal) throw new NotFoundException('Goal not found')
    return goal
  }

  private async assertAccountsExist(ids: string[], executor: Executor) {
    if (ids.length === 0) return
    const found = await executor
      .select({ id: accountsTable.id })
      .from(accountsTable)
      .where(inArray(accountsTable.id, ids))
    if (found.length !== ids.length) {
      throw new BadRequestException('Unknown account in accountIds')
    }
  }

  private async linkAccounts(
    goalId: string,
    accountIds: string[],
    executor: Executor,
  ) {
    if (accountIds.length === 0) return
    await executor
      .insert(savingsGoalAccountsTable)
      .values(accountIds.map((accountId) => ({ goalId, accountId })))
  }

  private async linkedAccountIds(
    goalIds: string[],
    executor: Executor,
  ): Promise<Map<string, string[]>> {
    const links = new Map(goalIds.map((id) => [id, [] as string[]]))
    if (goalIds.length === 0) return links
    const rows = await executor
      .select({
        goalId: savingsGoalAccountsTable.goalId,
        accountId: savingsGoalAccountsTable.accountId,
      })
      .from(savingsGoalAccountsTable)
      .innerJoin(
        accountsTable,
        eq(accountsTable.id, savingsGoalAccountsTable.accountId),
      )
      .where(inArray(savingsGoalAccountsTable.goalId, goalIds))
      .orderBy(asc(accountsTable.position), asc(accountsTable.createdAt))
    for (const row of rows) links.get(row.goalId)!.push(row.accountId)
    return links
  }

  /** Goals with their progress, plan and projection. */
  private async withProgress(
    goals: SelectSavingsGoal[],
    now: Date,
    executor: Executor,
  ): Promise<SavingsGoalDto[]> {
    if (goals.length === 0) return []
    const [links, accounts, average] = await Promise.all([
      this.linkedAccountIds(
        goals.map((goal) => goal.id),
        executor,
      ),
      this.accounts.list({ includeArchived: true }, executor),
      this.projectionAverage(now, executor),
    ])
    const balances = new Map(
      accounts.map((account) => [account.id, account.balanceCents ?? 0]),
    )
    const today = parisToday(now)

    return goals.map((goal) => {
      const accountIds = links.get(goal.id) ?? []
      const currentCents =
        goal.source === 'manual'
          ? (goal.manualAmountCents ?? 0)
          : accountIds.reduce((sum, id) => sum + (balances.get(id) ?? 0), 0)
      return {
        id: goal.id,
        name: goal.name,
        targetCents: goal.targetCents,
        targetDate: goal.targetDate,
        source: goal.source,
        manualAmountCents: goal.manualAmountCents,
        accountIds,
        color: goal.color,
        archived: goal.archivedAt !== null,
        ...goalPlan({
          currentCents,
          targetCents: goal.targetCents,
          targetDate: goal.targetDate,
          today,
          averageMonthlyCents: average,
        }),
      }
    })
  }
}

function emptyFigures(month: string): MonthFigures {
  return {
    month,
    incomeCents: 0,
    expenseCents: 0,
    oneOffIncomeCents: 0,
    oneOffExpenseCents: 0,
    movedToSavingsCents: 0,
    movedToInvestmentsCents: 0,
  }
}

function assertSource(source: string, accountIds: string[]) {
  if (source === 'accounts' && accountIds.length === 0) {
    throw new BadRequestException(
      'A goal measured on accounts needs at least one account',
    )
  }
}
