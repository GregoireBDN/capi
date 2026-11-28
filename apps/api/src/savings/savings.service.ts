import { Injectable } from '@nestjs/common'
import { and, eq, gte, inArray, lt, type SQL, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { AccountsService } from '#/accounts/accounts.service'
import { resolvePeriod } from '#/coverage/coverage'
import { monthPeriod } from '#/coverage/period'
import { savingsRate } from '#/dashboard/dashboard.service'
import {
  currentMonth,
  monthEnd,
  monthsUntil,
  shiftMonth,
} from '#/dashboard/calendar'
import type { MonthFlowDto } from '#/dashboard/dto/dashboard.dto'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  appSettingsTable,
  categoriesTable,
  transactionLinesView,
  transactionsTable,
} from '#/database/schema'
import { parisToday } from '#/investments/days'
import { InvestmentsService } from '#/investments/investments.service'
import { monthBounds } from '#/transactions/transactions.service'
import {
  AVERAGE_WINDOWS,
  PROJECTION_WINDOW,
  type SavingsMonthDto,
  type SavingsMovedDto,
  type SavingsOverviewDto,
  type SavingsTargetResultDto,
} from './dto/savings.dto'
import { MOVED_CATEGORIES, savingsAccountsHaveRows } from './moved'
import { averageOver, type MonthFigures } from './savings-math'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** The database or an open transaction. */
type Executor = Db | Tx

/** `app_settings` key of the monthly savings target (integer cents). */
export const MONTHLY_TARGET_KEY = 'savings.monthly_target_cents'

const LONGEST_WINDOW = Math.max(...AVERAGE_WINDOWS)

/**
 * Savings figures and goals. Every figure follows the domain rules: integer
 * cents, Europe/Paris calendar months compared on `booking_date` strings,
 * and transfers between the user's own accounts are never income or expense
 * (the net savings of a month is exactly the dashboard's).
 *
 * Money moved to savings and investments in a month (`movedTo*Cents`):
 *
 * - **Savings** (`movedToSavingsCents`): when any `savings` account has
 *   transaction rows, the net of the `transfer` rows booked on `savings`
 *   accounts, whatever their category (deposits positive, withdrawals
 *   negative; a move between two savings accounts nets to zero). The
 *   checking side of those moves is ignored, so a move recorded on both
 *   accounts counts once. Only when no savings account has any row (savings
 *   not imported) does it fall back to the `savings_transfer` rows on
 *   `checking` accounts, sign flipped.
 * - **Investments** (`movedToInvestmentsCents`): investment accounts have no
 *   transaction rows (snapshots only), so it is measured on the checking
 *   side: the `transfer` rows on `checking` accounts with the
 *   `investment_transfer` category, sign flipped (money leaving checking is
 *   positive, money coming back reduces it).
 *
 * Not counted: transfers on checking filed under any other category (e.g.
 * `internal_transfer` between checking accounts). A move to a savings
 * account filed `investment_transfer` on checking would be counted twice.
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
      month,
    }: { now?: Date; executor?: Executor; month?: string } = {},
  ): Promise<SavingsOverviewDto> {
    const current = currentMonth(now)
    const today = parisToday(now)
    // The month of the headline figures (asked for, else the current one
    // when it has data, else the month the data stops in), compared like
    // for like.
    const period = await resolvePeriod(executor, month, { now })
    // The averages need the full months before the current one, whatever
    // the number of months returned.
    const span = Math.max(count, LONGEST_WINDOW + 1)
    const [
      figures,
      firstDataMonth,
      target,
      accounts,
      investments,
      shownFigures,
      previousFigures,
    ] = await Promise.all([
      this.monthlyFigures(monthsUntil(current, span), executor),
      this.firstDataMonth(executor),
      this.readTarget(executor),
      this.accounts.list({}, executor),
      this.investments.summary(now),
      this.monthlyFigures([period.month], executor),
      this.monthlyFigures([period.previousMonth], executor, period.throughDay),
    ])

    const months = monthsUntil(current, count).map((month): SavingsMonthDto => {
      const row = figures.get(month) ?? emptyFigures(month)
      const netCents = row.incomeCents + row.expenseCents
      const oneOffNetCents = row.oneOffIncomeCents + row.oneOffExpenseCents
      return {
        month,
        complete:
          monthPeriod(month, period.dataUntil, today).status === 'complete',
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
      period,
      current: flowOf(
        shownFigures.get(period.month) ?? emptyFigures(period.month),
        monthEnd(period.month),
      ),
      previous: flowOf(
        previousFigures.get(period.previousMonth) ??
          emptyFigures(period.previousMonth),
        period.previousUntil ?? monthEnd(period.previousMonth),
      ),
      moved: movedOf(
        shownFigures.get(period.month) ?? emptyFigures(period.month),
      ),
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
   * moved to savings / investments, in one grouped query. With `throughDay`,
   * only the first `throughDay` days of each month count (like for like).
   */
  private async monthlyFigures(
    months: string[],
    executor: Executor,
    throughDay: number | null = null,
  ): Promise<Map<string, MonthFigures>> {
    // Lines: a split part counts with its own category (moves to savings).
    const t = transactionLinesView
    const from = monthBounds(months[0]).start
    const until = monthBounds(months[months.length - 1]).next
    const month = sql<string>`to_char(${t.bookingDate}, 'YYYY-MM')`
    const sumWhere = (condition: SQL) =>
      sql<number>`coalesce(sum(${t.amountCents}) filter (where ${condition}), 0)::bigint`.mapWith(
        Number,
      )
    const onChecking = (slug: string) =>
      sql`${t.kind} = 'transfer' and ${accountsTable.type} = 'checking' and ${categoriesTable.slug} = ${slug}`

    const [rows, savingsSideKnown] = await Promise.all([
      executor
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
          intoSavingsAccounts: sumWhere(
            sql`${t.kind} = 'transfer' and ${accountsTable.type} = 'savings'`,
          ),
          checkingToSavings: sumWhere(onChecking(MOVED_CATEGORIES.savings)),
          checkingToInvestments: sumWhere(
            onChecking(MOVED_CATEGORIES.investments),
          ),
        })
        .from(t)
        .innerJoin(accountsTable, eq(accountsTable.id, t.accountId))
        .leftJoin(categoriesTable, eq(categoriesTable.id, t.categoryId))
        .where(
          and(
            gte(t.bookingDate, from),
            lt(t.bookingDate, until),
            throughDay === null
              ? undefined
              : sql`extract(day from ${t.bookingDate}) <= ${throughDay}`,
          ),
        )
        .groupBy(month),
      savingsAccountsHaveRows(executor),
    ])

    return new Map(
      rows.map((row) => [
        row.month,
        {
          month: row.month,
          incomeCents: row.incomeCents,
          expenseCents: row.expenseCents,
          oneOffIncomeCents: row.oneOffIncomeCents,
          oneOffExpenseCents: row.oneOffExpenseCents,
          // `|| 0` turns a `-0` into 0.
          movedToSavingsCents: savingsSideKnown
            ? row.intoSavingsAccounts
            : -row.checkingToSavings || 0,
          movedToInvestmentsCents: -row.checkingToInvestments || 0,
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
          target: [appSettingsTable.userId, appSettingsTable.key],
          set: { value: monthlyTargetCents, updatedAt: new Date() },
        })
    }
    return { monthlyTargetCents }
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

/** Income and expenses of one month up to `until`, as the dashboard shows them. */
function movedOf(row: MonthFigures): SavingsMovedDto {
  return {
    toSavingsCents: row.movedToSavingsCents,
    toInvestmentsCents: row.movedToInvestmentsCents,
    totalCents: row.movedToSavingsCents + row.movedToInvestmentsCents,
  }
}

function flowOf(row: MonthFigures, until: string): MonthFlowDto {
  const netCents = row.incomeCents + row.expenseCents
  return {
    month: row.month,
    until,
    incomeCents: row.incomeCents,
    expenseCents: row.expenseCents,
    netCents,
    oneOffIncomeCents: row.oneOffIncomeCents,
    oneOffExpenseCents: row.oneOffExpenseCents,
    savingsRate: savingsRate(row.incomeCents, netCents),
  }
}
