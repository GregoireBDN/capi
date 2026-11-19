import { Injectable } from '@nestjs/common'
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import {
  type AccountWithBalance,
  AccountsService,
  isBankAccount,
  isTransactionalAccount,
} from '#/accounts/accounts.service'
import { BudgetsService } from '#/budgets/budgets.service'
import {
  dataUntilByAccount,
  lastImportDayByAccount,
  resolvePeriod,
} from '#/coverage/coverage'
import { DatabaseService } from '#/database/database.service'
import { daysBetween, parisToday } from '#/investments/days'
import { STALE_AFTER_DAYS } from '#/investments/performance'
import * as schema from '#/database/schema'
import { transactionsTable } from '#/database/schema'
import {
  monthBounds,
  TransactionsService,
} from '#/transactions/transactions.service'
import { currentMonth, monthEnd, monthsUntil, shiftMonth } from './calendar'
import type {
  DashboardAccountDto,
  DashboardHistoryDto,
  DashboardOverviewDto,
  HistoryMonthDto,
  MonthFlowDto,
} from './dto/dashboard.dto'
import {
  type MonthReviewDto,
  REVIEW_TOP_CATEGORIES,
  type ReviewCategoryDto,
  type ReviewMissingAccountDto,
} from './dto/review.dto'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** The database or an open transaction. */
type Executor = Db | Tx

/** Net over income, or null when there is no positive income to divide by. */
export function savingsRate(incomeCents: number, netCents: number) {
  return incomeCents > 0 ? netCents / incomeCents : null
}

/** Sum of the known balances, or null when none is known. */
function sumBalances(accounts: AccountWithBalance[]): number | null {
  let total: number | null = null
  for (const account of accounts) {
    if (account.balanceCents === null) continue
    total = (total ?? 0) + account.balanceCents
  }
  return total
}

/**
 * Aggregates for the dashboard. Every figure follows the domain rules:
 * amounts are integer cents, months are Europe/Paris calendar months
 * compared on `booking_date` strings, and transfers between the user's own
 * accounts are never income or expense (only `kind = income` / `expense`
 * reach the sums).
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly database: DatabaseService,
    private readonly accounts: AccountsService,
    private readonly transactions: TransactionsService,
    private readonly budgets: BudgetsService,
  ) {}

  private get db(): Db {
    return this.database.db
  }

  /**
   * Net worth now and per account, income / expenses of `month` and of the
   * month before, and the review queue size.
   *
   * Without `month`, the current month when it has data, else the month the
   * data stops in (see `coverage/period.ts`). While that month is partial,
   * the previous month only counts its same first days, so an empty or
   * half-imported month is never compared with a full one.
   *
   * The net worth does not depend on `month`: it is today's, compared with
   * the end of the previous calendar month relative to `now`.
   */
  async overview(
    month?: string,
    {
      now = new Date(),
      executor = this.db,
    }: { now?: Date; executor?: Executor } = {},
  ): Promise<DashboardOverviewDto> {
    const lastMonthEnd = monthEnd(shiftMonth(currentMonth(now), -1))
    const period = await resolvePeriod(executor, month, { now })
    const [
      accounts,
      previousAccounts,
      current,
      previous,
      reviewCount,
      coverage,
    ] = await Promise.all([
      this.accounts.list({}, executor),
      this.accounts.list({ asOf: lastMonthEnd }, executor),
      this.monthFlow(period.month, monthEnd(period.month), executor),
      this.monthFlow(
        period.previousMonth,
        period.previousUntil ?? monthEnd(period.previousMonth),
        executor,
      ),
      this.transactions.reviewCount(executor),
      dataUntilByAccount(executor, now),
    ])

    const today = parisToday(now)
    let cashCents = 0
    let investmentsCents = 0
    let unknownBalanceCount = 0
    const rows: DashboardAccountDto[] = accounts.map((account) => {
      const group = isTransactionalAccount(account) ? 'cash' : 'investments'
      if (account.balanceCents === null) unknownBalanceCount++
      else if (group === 'cash') cashCents += account.balanceCents
      else investmentsCents += account.balanceCents
      return {
        id: account.id,
        name: account.name,
        type: account.type,
        institution: account.institution,
        group,
        balanceCents: account.balanceCents,
        balanceDate: account.balanceDate,
        dataUntil:
          group === 'cash'
            ? (coverage.get(account.id) ?? null)
            : account.balanceDate,
        stale:
          group === 'investments' &&
          account.balanceDate !== null &&
          daysBetween(account.balanceDate, today) >
            STALE_AFTER_DAYS[account.type],
      }
    })

    return {
      netWorth: {
        totalCents: cashCents + investmentsCents,
        cashCents,
        investmentsCents,
        previousMonthEnd: lastMonthEnd,
        previousMonthEndCents: sumBalances(previousAccounts),
        unknownBalanceCount,
      },
      accounts: rows,
      period,
      current,
      previous,
      reviewCount,
    }
  }

  /**
   * The `count` calendar months ending with the current one (Europe/Paris),
   * oldest first: income, expenses and net of each month (transfers
   * excluded), and the net worth at its last day.
   *
   * Month-end net worth is the sum, over the non-archived accounts (the ones
   * the overview totals, so the last point matches it), of each account's
   * balance at the end of that day, computed by `AccountsService.list` with
   * `asOf` = the month end, i.e. the very method of the current balances
   * restricted to what was known then:
   *
   * - transactional accounts: the newer of the latest balance snapshot on or
   *   before the month end and the latest end-of-day running balance on or
   *   before it, plus the amounts booked after that anchor up to the month
   *   end; without either anchor, the sum of the amounts up to the month end;
   * - investment accounts: the latest value snapshot on or before the month
   *   end.
   *
   * Accounts with no balance yet at a month end count for nothing; a month
   * where no account has one gets `netWorthCents = null`. Each month also
   * lists the balance of every account that had one, with its type, so the
   * net worth can be broken down (they add up to `netWorthCents`).
   */
  async history(
    count: number,
    {
      now = new Date(),
      executor = this.db,
    }: { now?: Date; executor?: Executor } = {},
  ): Promise<DashboardHistoryDto> {
    const months = monthsUntil(currentMonth(now), count)
    const [flows, monthEnds] = await Promise.all([
      this.monthlyFlows(months, executor),
      Promise.all(
        months.map((month) =>
          this.accounts.list({ asOf: monthEnd(month) }, executor),
        ),
      ),
    ])

    return {
      months: months.map((month, i): HistoryMonthDto => {
        const flow = flows.get(month) ?? { incomeCents: 0, expenseCents: 0 }
        return {
          month,
          incomeCents: flow.incomeCents,
          expenseCents: flow.expenseCents,
          netCents: flow.incomeCents + flow.expenseCents,
          netWorthCents: sumBalances(monthEnds[i]),
          accounts: monthEnds[i].flatMap((account) =>
            account.balanceCents === null
              ? []
              : [
                  {
                    accountId: account.id,
                    type: account.type,
                    balanceCents: account.balanceCents,
                  },
                ],
          ),
        }
      }),
    }
  }

  /**
   * Review of a month, by default the previous calendar month (Europe/Paris):
   * the net worth at its end and how it moved (saved from the month's cash
   * flow vs the rest: investments and anything not booked as income or
   * expense), its income and expenses, its spending against the budget, and
   * the accounts not updated up to its end. Transfers between the user's own
   * accounts are never income, expense or spending.
   */
  async review(
    month?: string,
    {
      now = new Date(),
      executor = this.db,
    }: { now?: Date; executor?: Executor } = {},
  ): Promise<MonthReviewDto> {
    const shown = month ?? shiftMonth(currentMonth(now), -1)
    const end = monthEnd(shown)
    const previousEnd = monthEnd(shiftMonth(shown, -1))
    const [
      period,
      endAccounts,
      previousAccounts,
      current,
      budget,
      coverage,
      imports,
      latest,
      nextMonthBudgeted,
      monthClose,
    ] = await Promise.all([
      resolvePeriod(executor, shown, { now }),
      this.accounts.list({ asOf: end }, executor),
      this.accounts.list({ asOf: previousEnd }, executor),
      this.monthFlow(shown, end, executor),
      this.budgets.month(shown, executor, now),
      dataUntilByAccount(executor, now),
      lastImportDayByAccount(executor),
      this.accounts.list({}, executor),
      this.budgets.hasBudget(shiftMonth(shown, 1), executor),
      executor
        .select({ closedAt: schema.monthClosesTable.closedAt })
        .from(schema.monthClosesTable)
        .where(eq(schema.monthClosesTable.month, shown))
        .limit(1),
    ])

    const endCents = sumBalances(endAccounts)
    const previousEndCents = sumBalances(previousAccounts)
    const changeCents =
      endCents === null || previousEndCents === null
        ? null
        : endCents - previousEndCents

    // A meal-voucher card is entered by hand: nothing to import (#298).
    const missing: ReviewMissingAccountDto[] = latest.flatMap((account) => {
      if (isTransactionalAccount(account) && !isBankAccount(account)) return []
      const cash = isTransactionalAccount(account)
      const lastDate = cash
        ? (coverage.get(account.id) ?? null)
        : account.balanceDate
      const importedAfter = (imports.get(account.id) ?? '') > end
      const upToDate =
        (lastDate !== null && lastDate >= end) || (cash && importedAfter)
      return upToDate
        ? []
        : [
            {
              id: account.id,
              name: account.name,
              type: account.type,
              group: cash ? 'cash' : 'investments',
              lastDate,
            },
          ]
    })

    const lines: ReviewCategoryDto[] = budget.items.map((item) => ({
      categoryId: item.categoryId,
      slug: item.slug,
      name: item.name,
      color: item.color,
      icon: item.icon,
      targetCents: item.targetCents,
      spentCents: item.spentCents,
      gapCents: item.spentCents - item.targetCents,
    }))

    return {
      month: shown,
      nextMonth: shiftMonth(shown, 1),
      period,
      closed: period.status === 'complete' && missing.length === 0,
      closedAt: monthClose[0]?.closedAt?.toISOString() ?? null,
      nextMonthBudgeted,
      netWorth: {
        date: end,
        endCents,
        previousDate: previousEnd,
        previousEndCents,
        changeCents,
        savedCents: current.netCents,
        otherCents:
          changeCents === null ? null : changeCents - current.netCents,
      },
      flow: current,
      budget: {
        budgetCount: budget.totals.budgetCount,
        targetCents: budget.totals.targetCents,
        spentCents: budget.totals.spentCents,
        remainingCents: budget.totals.remainingCents,
        unbudgetedCents: budget.unbudgeted.totalCents,
        over: lines
          .filter((line) => line.gapCents > 0)
          .sort((a, b) => b.gapCents - a.gapCents)
          .slice(0, REVIEW_TOP_CATEGORIES),
        under: lines
          .filter((line) => line.gapCents < 0)
          .sort((a, b) => a.gapCents - b.gapCents)
          .slice(0, REVIEW_TOP_CATEGORIES),
      },
      missing,
    }
  }

  /**
   * Income and expenses of `month` from its first day to `until`, as the
   * transactions summary.
   */
  private async monthFlow(
    month: string,
    until: string,
    executor: Executor,
  ): Promise<MonthFlowDto> {
    const summary = await this.transactions.summary(
      { from: `${month}-01`, to: until },
      executor,
    )
    return {
      month,
      until,
      incomeCents: summary.incomeCents,
      expenseCents: summary.expenseCents,
      netCents: summary.netCents,
      oneOffIncomeCents: summary.oneOffIncomeCents,
      oneOffExpenseCents: summary.oneOffExpenseCents,
      savingsRate: savingsRate(summary.incomeCents, summary.netCents),
    }
  }

  /** Income and expense sums per `YYYY-MM`, in one grouped query. */
  private async monthlyFlows(
    months: string[],
    executor: Executor,
  ): Promise<Map<string, { incomeCents: number; expenseCents: number }>> {
    const t = transactionsTable
    const from = monthBounds(months[0]).start
    const until = monthBounds(months[months.length - 1]).next
    const month = sql<string>`to_char(${t.bookingDate}, 'YYYY-MM')`
    const sumOf = (kind: 'income' | 'expense') =>
      sql<number>`coalesce(sum(${t.amountCents}) filter (where ${eq(t.kind, kind)}), 0)::bigint`.mapWith(
        Number,
      )

    const rows = await executor
      .select({
        month,
        incomeCents: sumOf('income'),
        expenseCents: sumOf('expense'),
      })
      .from(t)
      .where(and(gte(t.bookingDate, from), lt(t.bookingDate, until)))
      .groupBy(month)

    return new Map(
      rows.map((row) => [
        row.month,
        { incomeCents: row.incomeCents, expenseCents: row.expenseCents },
      ]),
    )
  }
}
