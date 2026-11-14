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
  budgetsTable,
  categoriesTable,
  transactionLinesView,
  transactionsTable,
} from '#/database/schema'
import { parisToday } from '#/investments/days'
import { RecurringService } from '#/recurring/recurring.service'
import {
  AVERAGE_MONTHS_DEFAULT,
  type CategorySpendingDto,
  type SpendingByCategoryDto,
  type SpendingByCategoryQueryDto,
  type SpendingTrendDto,
  type SpendingTrendQueryDto,
  type SpendingTrendSeriesDto,
  TREND_MONTHS_DEFAULT,
  TREND_TOP_CATEGORIES,
} from './dto/spending.dto'
import { expectedByCategory } from './expected'
import { firstDay, monthsBetween, shiftMonth } from './spending-months'

type Db = PostgresJsDatabase<typeof schema>

/** Key of the expenses without a category in the per-month aggregates. */
const UNCATEGORIZED = 'uncategorized'
const OTHER = 'other'

/** Spending of one category (or of the uncategorized bucket) in one month. */
interface MonthlyRow {
  month: string
  /** Category id, or `UNCATEGORIZED`. */
  key: string
  spentCents: number
  count: number
  oneOffCents: number
  oneOffCount: number
}

interface CategoryInfo {
  id: string
  slug: string
  name: string
  color: string | null
}

interface Scope {
  accountId?: string
  includeOneOffs: boolean
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
    const scope: Scope = {
      accountId: query.accountId,
      includeOneOffs: query.includeOneOffs ?? false,
    }
    const wanted = query.averageMonths ?? AVERAGE_MONTHS_DEFAULT
    const windowStart = shiftMonth(month, -wanted)

    const [rows, firstMonth, targets, expected] = await Promise.all([
      this.monthly(windowStart, month, scope.accountId, period.throughDay),
      this.firstMonth(scope.accountId),
      this.targets(month),
      partial
        ? this.expected(month, scope.accountId)
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
    let oneOffCents = 0
    for (const row of rows) {
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
    const info = await this.categories(shown)

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
      return {
        categoryId: category?.id ?? null,
        slug: category?.slug ?? null,
        name: category?.name ?? null,
        color: category?.color ?? null,
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
          category === undefined ? null : (targets.get(category.id) ?? null),
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

    const [rows, firstMonth] = await Promise.all([
      this.monthly(start, end, query.accountId),
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

    let series: SpendingTrendSeriesDto[]
    if (query.categoryId !== undefined || query.uncategorized === true) {
      const key = query.categoryId ?? UNCATEGORIZED
      const info = await this.categories([key])
      if (query.categoryId !== undefined && !info.has(key)) {
        throw new NotFoundException('Category not found')
      }
      series = [this.series(key, info.get(key), valuesOf([key]))]
    } else {
      const ranked = [...spent.keys()]
        .map((key) => ({ key, total: sumOver(spent.get(key), months) }))
        .filter((entry) => entry.total > 0)
        .sort((a, b) => b.total - a.total)
      const top = ranked.slice(0, TREND_TOP_CATEGORIES).map((e) => e.key)
      const rest = [...spent.keys()].filter((key) => !top.includes(key))
      const info = await this.categories(top)
      series = top.map((key) =>
        this.series(key, info.get(key), valuesOf([key])),
      )
      const other = valuesOf(rest)
      if (other.some((value) => value !== 0)) {
        series.push({
          key: OTHER,
          type: 'other',
          categoryId: null,
          slug: null,
          name: null,
          color: null,
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

    return {
      months,
      includeOneOffs,
      series,
      totalsCents,
      averageCents,
      averageMonths: complete.length,
    }
  }

  private series(
    key: string,
    category: CategoryInfo | undefined,
    valuesCents: number[],
  ): SpendingTrendSeriesDto {
    return {
      key,
      type: category ? 'category' : 'uncategorized',
      categoryId: category?.id ?? null,
      slug: category?.slug ?? null,
      name: category?.name ?? null,
      color: category?.color ?? null,
      valuesCents,
      totalCents: valuesCents.reduce((sum, value) => sum + value, 0),
    }
  }

  /**
   * Expenses per month and category from `from` to `to` (months, both
   * included), with the one-off part apart. Money out is positive. With
   * `throughDay`, only the first `throughDay` days of each month count (all
   * of a shorter month), so a partial month is compared like for like.
   */
  private async monthly(
    from: string,
    to: string,
    accountId: string | undefined,
    throughDay: number | null = null,
  ): Promise<MonthlyRow[]> {
    // Lines: a split transaction counts in each of its categories.
    const t = transactionLinesView
    const month = sql<string>`to_char(${t.bookingDate}, 'YYYY-MM')`
    // Inlined constant: a bound parameter would differ between the SELECT
    // and the GROUP BY, which Postgres then refuses.
    const key = sql<string>`coalesce(${t.categoryId}::text, ${sql.raw(`'${UNCATEGORIZED}'`)})`
    const oneOff = eq(t.isOneOff, true)
    const conditions: SQL[] = [
      eq(t.kind, 'expense'),
      gte(t.bookingDate, firstDay(from)),
      lt(t.bookingDate, firstDay(shiftMonth(to, 1))),
    ]
    if (accountId !== undefined) conditions.push(eq(t.accountId, accountId))
    if (throughDay !== null) {
      conditions.push(sql`extract(day from ${t.bookingDate}) <= ${throughDay}`)
    }

    return this.db
      .select({
        month,
        key,
        spentCents:
          sql<number>`-coalesce(sum(${t.amountCents}), 0)::bigint`.mapWith(
            Number,
          ),
        count: sql<number>`count(*)`.mapWith(Number),
        oneOffCents:
          sql<number>`-coalesce(sum(${t.amountCents}) filter (where ${oneOff}), 0)::bigint`.mapWith(
            Number,
          ),
        oneOffCount: sql<number>`count(*) filter (where ${oneOff})`.mapWith(
          Number,
        ),
      })
      .from(t)
      .where(and(...conditions))
      .groupBy(month, key)
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
   * Recurring costs still expected in `month` per category key (see
   * `expectedByCategory`), from the confirmed series of the accounts in
   * scope, each read up to the day its own data goes.
   */
  private async expected(
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
      [...expectedByCategory(inScope, month, horizons)].map(([id, cents]) => [
        id ?? UNCATEGORIZED,
        cents,
      ]),
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

  private async categories(keys: string[]): Promise<Map<string, CategoryInfo>> {
    const ids = keys.filter((key) => key !== UNCATEGORIZED && key !== OTHER)
    if (ids.length === 0) return new Map()
    const rows = await this.db
      .select({
        id: categoriesTable.id,
        slug: categoriesTable.slug,
        name: categoriesTable.name,
        color: categoriesTable.color,
      })
      .from(categoriesTable)
      .where(inArray(categoriesTable.id, ids))
    return new Map(rows.map((row) => [row.id, row]))
  }
}
