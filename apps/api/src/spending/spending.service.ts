import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, eq, gte, inArray, lt, lte, min, type SQL, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { targetsInEffect } from '#/budgets/budget-math'
import { dataUntilByAccount, resolvePeriod } from '#/coverage/coverage'
import { monthPeriod } from '#/coverage/period'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  type AccountType,
  budgetsTable,
  categoriesTable,
  transactionLinesView,
  transactionsTable,
} from '#/database/schema'
import { parisToday } from '#/investments/days'
import { RecurringService } from '#/recurring/recurring.service'
import { MOVED_CATEGORIES, savingsAccountsHaveRows } from '#/savings/moved'
import {
  AVERAGE_MONTHS_DEFAULT,
  type CategorySpendingDto,
  type SpendingByCategoryDto,
  type SpendingByCategoryQueryDto,
  type SpendingKind,
  type SpendingTrendDto,
  type SpendingTrendQueryDto,
  type SpendingTrendMonthDto,
  type SpendingTrendSeriesDto,
  TREND_MONTH_TOP_CATEGORIES,
  TREND_MONTHS_DEFAULT,
  TREND_TOP_CATEGORIES,
} from './dto/spending.dto'
import { expectedByCategory } from './expected'
import { firstDay, monthsBetween, shiftMonth } from './spending-months'
import type { CategoryIcon } from '#/categories/category-icons'

type Db = PostgresJsDatabase<typeof schema>

/** Key of the expenses without a category in the per-month aggregates. */
const UNCATEGORIZED = 'uncategorized'
const OTHER = 'other'

/** One row's amount (a category, an account, the uncategorized bucket) in one month. */
interface MonthlyRow {
  month: string
  /** Category id (account id for savings), or `UNCATEGORIZED`. */
  key: string
  spentCents: number
  count: number
  oneOffCents: number
  oneOffCount: number
  /** Savings: paid in and taken out (positive cents); 0 for the other kinds. */
  inCents: number
  outCents: number
}

/** What a row's key names: a category, or an account (savings). */
interface RowInfo {
  categoryId: string | null
  accountId: string | null
  accountType: AccountType | null
  slug: string | null
  name: string
  color: string | null
  icon: CategoryIcon | null
}

interface Scope {
  accountId?: string
  includeOneOffs: boolean
}

/**
 * An account's look in « Épargne » rows (#410): the Épargne page's colours
 * (#407, Livrets emerald, Placements violet) and an icon per type.
 */
const SAVINGS_COLOR = '#10b981'
const INVESTMENTS_COLOR = '#8b5cf6'
const ACCOUNT_ICON: Partial<Record<AccountType, CategoryIcon>> = {
  savings: 'piggy-bank',
  brokerage: 'trending-up',
  securities: 'trending-up',
  life_insurance: 'shield',
  employee_savings: 'briefcase',
  crypto: 'coins',
}

/** Sum of values over the given months, missing months counting as 0. */
function sumOver(values: Map<string, number> | undefined, months: string[]) {
  if (!values) return 0
  return months.reduce((sum, month) => sum + (values.get(month) ?? 0), 0)
}

/** Average in whole cents, or null over no month at all. */
function average(total: number, months: number): number | null {
  return months > 0 ? Math.round(total / months) : null
}

/**
 * Where the money goes: monthly spending per category, compared with the
 * previous month and with the average of the previous full months, and the
 * spending trend over the last months.
 *
 * Spending = every `expense` transaction, whatever its category, so totals
 * match the expense total of the transactions page. Amounts are negated
 * (money out is positive) and netted per category: a refund filed under a
 * category reduces that category's spending. Transfers between the user's
 * own accounts and income never count. One-off expenses are left out unless
 * asked for.
 */
@Injectable()
export class SpendingService {
  /** Clock for "the current month"; replaced in tests. */
  now: () => Date = () => new Date()

  constructor(
    private readonly database: DatabaseService,
    private readonly recurring: RecurringService,
  ) {}

  private get db(): Db {
    return this.database.db
  }

  /**
   * Without `month`, the current month when it has data, else the month the
   * data stops in. While the month is partial, the previous month and the
   * averaged months only count their same first days (like for like), and a
   * category not paid yet this month is flagged rather than shown as saved,
   * and the recurring costs still expected in the rest of the month are
   * returned apart (`expectedCents`), never counted as spent. Each category
   * carries its budget target for the month, if any.
   */
  async byCategory(
    query: SpendingByCategoryQueryDto,
  ): Promise<SpendingByCategoryDto> {
    const period = await resolvePeriod(this.db, query.month, {
      accountId: query.accountId,
      now: this.now(),
    })
    const { month, previousMonth } = period
    const partial = period.status === 'partial'
    const kind = query.kind ?? 'expense'
    const scope: Scope = {
      accountId: query.accountId,
      includeOneOffs: query.includeOneOffs ?? false,
    }
    const wanted = query.averageMonths ?? AVERAGE_MONTHS_DEFAULT
    const windowStart = shiftMonth(month, -wanted)

    const [rows, firstMonth, targets, expected] = await Promise.all([
      this.monthly(
        kind,
        windowStart,
        month,
        scope.accountId,
        period.throughDay,
      ),
      this.firstMonth(scope.accountId),
      kind === 'savings' ? new Map<string, number>() : this.targets(month),
      partial && kind !== 'savings'
        ? this.expected(kind, month, scope.accountId)
        : new Map<string, number>(),
    ])

    // Months before the first transaction are not "no spending", just no
    // data: they stay out of the averages.
    const averageWindow =
      firstMonth === null
        ? []
        : monthsBetween(
            firstMonth > windowStart ? firstMonth : windowStart,
            previousMonth,
          )

    const spent = new Map<string, Map<string, number>>()
    const counts = new Map<string, Map<string, number>>()
    const moves = new Map<string, { inCents: number; outCents: number }>()
    let oneOffCents = 0
    for (const row of rows) {
      if (row.month === month) moves.set(row.key, row)
      const value = scope.includeOneOffs
        ? row.spentCents
        : row.spentCents - row.oneOffCents
      const count = scope.includeOneOffs
        ? row.count
        : row.count - row.oneOffCount
      if (row.month === month) oneOffCents += row.oneOffCents
      if (count === 0) continue
      if (!spent.has(row.key)) spent.set(row.key, new Map())
      if (!counts.has(row.key)) counts.set(row.key, new Map())
      spent.get(row.key)!.set(row.month, value)
      counts.get(row.key)!.set(row.month, count)
    }

    // A month without any data yet lists nothing: every category of the
    // previous month would look like a saving. A category only expected
    // later in the month (the rent not paid yet) is listed too.
    const shown = [...new Set([...spent.keys(), ...expected.keys()])].filter(
      (key) =>
        (counts.get(key)?.get(month) ?? 0) > 0 ||
        (expected.get(key) ?? 0) > 0 ||
        (period.status !== 'empty' &&
          (counts.get(key)?.get(previousMonth) ?? 0) > 0),
    )
    const info = await this.infos(kind, shown)

    let totalCents = 0
    let previousTotalCents = 0
    let transactionCount = 0
    let expectedCents = 0
    for (const key of shown) {
      totalCents += spent.get(key)?.get(month) ?? 0
      previousTotalCents += spent.get(key)?.get(previousMonth) ?? 0
      transactionCount += counts.get(key)?.get(month) ?? 0
      expectedCents += expected.get(key) ?? 0
    }
    let averageTotal = 0
    for (const values of spent.values()) {
      averageTotal += sumOver(values, averageWindow)
    }

    const categories: CategorySpendingDto[] = shown.map((key) => {
      const category = info.get(key)
      const spentCents = spent.get(key)?.get(month) ?? 0
      const previousSpentCents = spent.get(key)?.get(previousMonth) ?? 0
      const transactionCount = counts.get(key)?.get(month) ?? 0
      const move = moves.get(key)
      return {
        categoryId: category?.categoryId ?? null,
        accountId: category?.accountId ?? null,
        accountType: category?.accountType ?? null,
        inCents: kind === 'savings' ? (move?.inCents ?? 0) : null,
        outCents: kind === 'savings' ? (move?.outCents ?? 0) : null,
        slug: category?.slug ?? null,
        name: category?.name ?? null,
        color: category?.color ?? null,
        icon: category?.icon ?? null,
        spentCents,
        share: totalCents > 0 ? spentCents / totalCents : 0,
        transactionCount,
        previousSpentCents,
        deltaCents: spentCents - previousSpentCents,
        averageCents: average(
          sumOver(spent.get(key), averageWindow),
          averageWindow.length,
        ),
        notYetThisMonth:
          partial &&
          transactionCount === 0 &&
          (counts.get(key)?.get(previousMonth) ?? 0) > 0,
        targetCents:
          category?.categoryId == null
            ? null
            : (targets.get(category.categoryId) ?? null),
        expectedCents: expected.get(key) ?? 0,
      }
    })
    categories.sort(
      (a, b) =>
        b.spentCents - a.spentCents ||
        b.expectedCents - a.expectedCents ||
        b.previousSpentCents - a.previousSpentCents ||
        (a.name ?? '').localeCompare(b.name ?? '', 'fr'),
    )

    return {
      kind,
      month,
      previousMonth,
      period,
      includeOneOffs: scope.includeOneOffs,
      averageMonths: averageWindow.length,
      averageFrom: averageWindow[0] ?? null,
      totalCents,
      transactionCount,
      previousTotalCents,
      averageTotalCents: average(averageTotal, averageWindow.length),
      oneOffCents,
      expectedCents,
      categories,
    }
  }

  async trend(query: SpendingTrendQueryDto): Promise<SpendingTrendDto> {
    if (query.categoryId !== undefined && query.uncategorized !== undefined) {
      throw new BadRequestException(
        'categoryId and uncategorized cannot be combined',
      )
    }
    const now = this.now()
    const period = await resolvePeriod(this.db, query.month, {
      accountId: query.accountId,
      now,
    })
    const today = parisToday(now)
    const end = period.month
    const start = shiftMonth(end, -((query.months ?? TREND_MONTHS_DEFAULT) - 1))
    const months = monthsBetween(start, end)
    const includeOneOffs = query.includeOneOffs ?? false
    const kind = query.kind ?? 'expense'

    const [rows, firstMonth] = await Promise.all([
      this.monthly(kind, start, end, query.accountId),
      this.firstMonth(query.accountId),
    ])

    const spent = new Map<string, Map<string, number>>()
    for (const row of rows) {
      const value = includeOneOffs
        ? row.spentCents
        : row.spentCents - row.oneOffCents
      const count = includeOneOffs ? row.count : row.count - row.oneOffCount
      if (count === 0) continue
      if (!spent.has(row.key)) spent.set(row.key, new Map())
      spent.get(row.key)!.set(row.month, value)
    }
    const valuesOf = (keys: string[]) =>
      months.map((month) =>
        keys.reduce((sum, key) => sum + (spent.get(key)?.get(month) ?? 0), 0),
      )

    const single =
      query.categoryId !== undefined || query.uncategorized === true
    const filterKey = query.categoryId ?? UNCATEGORIZED

    // Each month's largest categories, whatever the filter.
    const monthTops = months.map((month) =>
      [...spent.keys()]
        .map((key) => ({ key, cents: spent.get(key)?.get(month) ?? 0 }))
        .filter((entry) => entry.cents > 0)
        .sort((a, b) => b.cents - a.cents)
        .slice(0, TREND_MONTH_TOP_CATEGORIES),
    )

    let series: SpendingTrendSeriesDto[]
    if (single) {
      const key = filterKey
      const info = await this.infos(kind, [key])
      if (query.categoryId !== undefined && !info.has(key)) {
        throw new NotFoundException(
          kind === 'savings' ? 'Account not found' : 'Category not found',
        )
      }
      series = [this.series(key, info.get(key), valuesOf([key]))]
    } else {
      const ranked = [...spent.keys()]
        .map((key) => ({ key, total: sumOver(spent.get(key), months) }))
        .filter((entry) => entry.total > 0)
        .sort((a, b) => b.total - a.total)
      const top = ranked.slice(0, TREND_TOP_CATEGORIES).map((e) => e.key)
      const rest = [...spent.keys()].filter((key) => !top.includes(key))
      const info = await this.infos(kind, top)
      series = top.map((key) =>
        this.series(key, info.get(key), valuesOf([key])),
      )
      const other = valuesOf(rest)
      if (other.some((value) => value !== 0)) {
        series.push({
          key: OTHER,
          type: 'other',
          categoryId: null,
          accountId: null,
          slug: null,
          name: null,
          color: null,
          icon: null,
          valuesCents: other,
          totalCents: other.reduce((sum, value) => sum + value, 0),
        })
      }
    }

    const totalsCents = months.map((_, index) =>
      series.reduce((sum, item) => sum + item.valuesCents[index], 0),
    )
    // Complete months only: the data does not reach the end of the last
    // ones yet, and months before the first transaction have no data at all.
    const complete = months
      .map((month, index) => ({ month, index }))
      .filter(
        ({ month }) =>
          firstMonth !== null &&
          month >= firstMonth &&
          monthPeriod(month, period.dataUntil, today).status === 'complete',
      )
    const averageCents = average(
      complete.reduce((sum, { index }) => sum + totalsCents[index], 0),
      complete.length,
    )

    const periods = months.map((month) =>
      monthPeriod(month, period.dataUntil, today),
    )
    // A partial month is compared like for like: the same complete months,
    // their first days only.
    const throughDay =
      periods.find((p) => p.status === 'partial')?.throughDay ?? null
    let sameDaysAverageCents: number | null = null
    if (throughDay !== null && complete.length > 0) {
      const sameDays = await this.monthly(
        kind,
        complete[0].month,
        complete.at(-1)!.month,
        query.accountId,
        throughDay,
      )
      const counted = new Set(complete.map(({ month }) => month))
      const sum = sameDays
        .filter((row) => counted.has(row.month))
        .filter((row) => !single || row.key === filterKey)
        .reduce(
          (total, row) =>
            total +
            (includeOneOffs
              ? row.spentCents
              : row.spentCents - row.oneOffCents),
          0,
        )
      sameDaysAverageCents = average(sum, complete.length)
    }

    const topInfo = await this.infos(kind, [
      ...new Set(monthTops.flat().map((entry) => entry.key)),
    ])
    const details: SpendingTrendMonthDto[] = months.map((month, index) => ({
      month,
      status: periods[index].status,
      throughDay: periods[index].throughDay,
      topCategories: monthTops[index].map(({ key, cents }) => {
        const info = topInfo.get(key)
        return {
          categoryId: info?.categoryId ?? null,
          name: info?.name ?? null,
          color: info?.color ?? null,
          icon: info?.icon ?? null,
          spentCents: cents,
        }
      }),
    }))

    return {
      kind,
      months,
      includeOneOffs,
      series,
      totalsCents,
      averageCents,
      averageMonths: complete.length,
      details,
      sameDaysAverageCents,
    }
  }

  private series(
    key: string,
    category: RowInfo | undefined,
    valuesCents: number[],
  ): SpendingTrendSeriesDto {
    return {
      key,
      type: category?.accountId
        ? 'account'
        : category
          ? 'category'
          : 'uncategorized',
      categoryId: category?.categoryId ?? null,
      accountId: category?.accountId ?? null,
      slug: category?.slug ?? null,
      name: category?.name ?? null,
      color: category?.color ?? null,
      icon: category?.icon ?? null,
      valuesCents,
      totalCents: valuesCents.reduce((sum, value) => sum + value, 0),
    }
  }

  /**
   * Amounts per month and row from `from` to `to` (months, both included),
   * with the one-off part apart: expenses (money out positive) or income
   * (money in positive) per category, or the moves to savings per account
   * (`monthlySavings`). With `throughDay`, only the first `throughDay` days
   * of each month count (all of a shorter month), so a partial month is
   * compared like for like.
   */
  private async monthly(
    kind: SpendingKind,
    from: string,
    to: string,
    accountId: string | undefined,
    throughDay: number | null = null,
  ): Promise<MonthlyRow[]> {
    if (kind === 'savings') {
      return this.monthlySavings(from, to, accountId, throughDay)
    }
    // Lines: a split transaction counts in each of its categories.
    const t = transactionLinesView
    const month = sql<string>`to_char(${t.bookingDate}, 'YYYY-MM')`
    // Inlined constant: a bound parameter would differ between the SELECT
    // and the GROUP BY, which Postgres then refuses.
    const key = sql<string>`coalesce(${t.categoryId}::text, ${sql.raw(`'${UNCATEGORIZED}'`)})`
    const oneOff = eq(t.isOneOff, true)
    // Money out is positive for expenses, money in for income.
    const sign = sql.raw(kind === 'expense' ? '-' : '')
    const conditions: SQL[] = [
      eq(t.kind, kind),
      gte(t.bookingDate, firstDay(from)),
      lt(t.bookingDate, firstDay(shiftMonth(to, 1))),
    ]
    if (accountId !== undefined) conditions.push(eq(t.accountId, accountId))
    if (throughDay !== null) {
      conditions.push(sql`extract(day from ${t.bookingDate}) <= ${throughDay}`)
    }

    const rows = await this.db
      .select({
        month,
        key,
        spentCents:
          sql<number>`${sign}coalesce(sum(${t.amountCents}), 0)::bigint`.mapWith(
            Number,
          ),
        count: sql<number>`count(*)`.mapWith(Number),
        oneOffCents:
          sql<number>`${sign}coalesce(sum(${t.amountCents}) filter (where ${oneOff}), 0)::bigint`.mapWith(
            Number,
          ),
        oneOffCount: sql<number>`count(*) filter (where ${oneOff})`.mapWith(
          Number,
        ),
      })
      .from(t)
      .where(and(...conditions))
      .groupBy(month, key)
    // `|| 0` turns a `-0` into 0.
    return rows.map((row) => ({
      ...row,
      spentCents: row.spentCents || 0,
      oneOffCents: row.oneOffCents || 0,
      inCents: 0,
      outCents: 0,
    }))
  }

  /**
   * « Mis de côté » per month and account (#410), exactly as the Épargne
   * page counts it (`SavingsService`, `savings/moved.ts`): the transfers
   * booked on the savings accounts (deposits positive, withdrawals
   * negative), or the checking side's `savings_transfer` rows when no
   * savings account has any row; and the checking side's
   * `investment_transfer` rows, sign flipped, keyed by their counterpart
   * account (`UNCATEGORIZED` when unknown). Every move counts, one-off or
   * not. With `accountId`, the moves from or to that account.
   */
  private async monthlySavings(
    from: string,
    to: string,
    accountId: string | undefined,
    throughDay: number | null,
  ): Promise<MonthlyRow[]> {
    const t = transactionLinesView
    const a = accountsTable
    const c = categoriesTable
    const tx = transactionsTable
    const savingsSide = await savingsAccountsHaveRows(this.db)
    const onSavings = sql`${a.type} = 'savings'`
    // Slugs inlined (constants): see `monthly`.
    const onChecking = (slug: string) =>
      sql`(${a.type} = 'checking' and ${c.slug} = ${sql.raw(`'${slug}'`)})`
    const moves = [onChecking(MOVED_CATEGORIES.investments)]
    moves.push(savingsSide ? onSavings : onChecking(MOVED_CATEGORIES.savings))
    const month = sql<string>`to_char(${t.bookingDate}, 'YYYY-MM')`
    const key = sql<string>`case when ${onSavings} then ${t.accountId}::text else coalesce(${tx.counterpartAccountId}::text, ${sql.raw(`'${UNCATEGORIZED}'`)}) end`
    const value = sql`case when ${onSavings} then ${t.amountCents} else -${t.amountCents} end`
    const conditions: SQL[] = [
      eq(t.kind, 'transfer'),
      sql`(${sql.join(moves, sql` or `)})`,
      gte(t.bookingDate, firstDay(from)),
      lt(t.bookingDate, firstDay(shiftMonth(to, 1))),
    ]
    if (accountId !== undefined) {
      conditions.push(
        sql`(${t.accountId} = ${accountId} or ${tx.counterpartAccountId} = ${accountId})`,
      )
    }
    if (throughDay !== null) {
      conditions.push(sql`extract(day from ${t.bookingDate}) <= ${throughDay}`)
    }

    const rows = await this.db
      .select({
        month,
        key,
        spentCents: sql<number>`coalesce(sum(${value}), 0)::bigint`.mapWith(
          Number,
        ),
        count: sql<number>`count(*)`.mapWith(Number),
        inCents:
          sql<number>`coalesce(sum(${value}) filter (where ${value} > 0), 0)::bigint`.mapWith(
            Number,
          ),
        outCents:
          sql<number>`-coalesce(sum(${value}) filter (where ${value} < 0), 0)::bigint`.mapWith(
            Number,
          ),
      })
      .from(t)
      .innerJoin(a, eq(a.id, t.accountId))
      .innerJoin(tx, eq(tx.id, t.id))
      .leftJoin(c, eq(c.id, t.categoryId))
      .where(and(...conditions))
      .groupBy(month, key)
    return rows.map((row) => ({
      ...row,
      spentCents: row.spentCents || 0,
      outCents: row.outCents || 0,
      oneOffCents: 0,
      oneOffCount: 0,
    }))
  }

  /** Budget target of each category in `month`, positive cents. */
  private async targets(month: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        id: budgetsTable.id,
        categoryId: budgetsTable.categoryId,
        effectiveFrom: budgetsTable.effectiveFrom,
        monthlyTargetCents: budgetsTable.monthlyTargetCents,
        note: budgetsTable.note,
      })
      .from(budgetsTable)
      .where(lte(budgetsTable.effectiveFrom, firstDay(month)))
    return new Map(
      [...targetsInEffect(rows, month)].map(([id, row]) => [
        id,
        row.monthlyTargetCents,
      ]),
    )
  }

  /**
   * Recurring amounts still expected in `month` per category key (see
   * `expectedByCategory`), from the confirmed series of the accounts in
   * scope, each read up to the day its own data goes: the debits for
   * expenses, the credits (the salary) for income.
   */
  private async expected(
    kind: 'expense' | 'income',
    month: string,
    accountId: string | undefined,
  ): Promise<Map<string, number>> {
    const [items, horizons] = await Promise.all([
      this.recurring.list('confirmed'),
      dataUntilByAccount(this.db, this.now()),
    ])
    const inScope = items.filter(
      (item) => accountId === undefined || item.accountId === accountId,
    )
    return new Map(
      [
        ...expectedByCategory(
          inScope,
          month,
          horizons,
          kind === 'expense' ? 'debit' : 'credit',
        ),
      ].map(([id, cents]) => [id ?? UNCATEGORIZED, cents]),
    )
  }

  /** Month of the earliest transaction (any kind) in scope, or null. */
  private async firstMonth(accountId: string | undefined) {
    const t = transactionsTable
    const [row] = await this.db
      .select({ first: min(t.bookingDate) })
      .from(t)
      .where(accountId === undefined ? undefined : eq(t.accountId, accountId))
    return row?.first ? row.first.slice(0, 7) : null
  }

  /** What each key names: categories, or accounts for savings. */
  private async infos(
    kind: SpendingKind,
    keys: string[],
  ): Promise<Map<string, RowInfo>> {
    const ids = keys.filter((key) => key !== UNCATEGORIZED && key !== OTHER)
    if (ids.length === 0) return new Map()
    if (kind === 'savings') {
      const rows = await this.db
        .select({
          id: accountsTable.id,
          name: accountsTable.name,
          type: accountsTable.type,
        })
        .from(accountsTable)
        .where(inArray(accountsTable.id, ids))
      return new Map(
        rows.map((row) => [
          row.id,
          {
            categoryId: null,
            accountId: row.id,
            accountType: row.type,
            slug: null,
            name: row.name,
            color: row.type === 'savings' ? SAVINGS_COLOR : INVESTMENTS_COLOR,
            icon: ACCOUNT_ICON[row.type] ?? 'landmark',
          },
        ]),
      )
    }
    const rows = await this.db
      .select({
        id: categoriesTable.id,
        slug: categoriesTable.slug,
        name: categoriesTable.name,
        color: categoriesTable.color,
        icon: categoriesTable.icon,
      })
      .from(categoriesTable)
      .where(inArray(categoriesTable.id, ids))
    return new Map(
      rows.map((row) => [
        row.id,
        {
          categoryId: row.id,
          accountId: null,
          accountType: null,
          slug: row.slug,
          name: row.name,
          color: row.color,
          icon: row.icon,
        },
      ]),
    )
  }
}
