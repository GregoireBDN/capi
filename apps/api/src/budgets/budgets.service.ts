import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq, gte, inArray, lt, lte, type SQL, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { resolvePeriod } from '#/coverage/coverage'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  budgetsTable,
  categoriesTable,
  transactionsTable,
} from '#/database/schema'
import {
  type BudgetRow,
  budgetStatus,
  percentUsed,
  roundToEuro,
  targetsInEffect,
} from './budget-math'
import {
  type BudgetDto,
  type BudgetHistoryDto,
  type BudgetLineDto,
  type BudgetMonthDto,
  type BudgetSuggestionsDto,
  type UnbudgetedCategoryDto,
  UNBUDGETED_TOP_COUNT,
  type UpsertBudgetDto,
} from './dto/budget.dto'
import { firstDay, monthRange, shiftMonth } from './months'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** The database or an open transaction. */
type Executor = Db | Tx

interface CategoryInfo {
  id: string
  slug: string
  name: string
  color: string | null
  kind: 'expense' | 'income' | 'transfer'
}

/** Spending of one category (null = uncategorized) in one month. */
interface SpendingRow {
  month: string
  categoryId: string | null
  /** Positive cents: −Σ amount of the `expense` transactions. */
  spentCents: number
  spentExcludingOneOffsCents: number
}

/** `-coalesce(sum(amount) [filter (where ...)], 0)` as a JS number of cents. */
function spentSum(condition?: SQL) {
  const amount = transactionsTable.amountCents
  const sum = condition
    ? sql`sum(${amount}) filter (where ${condition})`
    : sql`sum(${amount})`
  return sql<number>`(-coalesce(${sum}, 0))::bigint`.mapWith(Number)
}

const budgetColumns = {
  id: budgetsTable.id,
  categoryId: budgetsTable.categoryId,
  effectiveFrom: budgetsTable.effectiveFrom,
  monthlyTargetCents: budgetsTable.monthlyTargetCents,
  note: budgetsTable.note,
}

/** `2026-11-01` → `2026-11`. */
function toMonth(date: string): string {
  return date.slice(0, 7)
}

/**
 * Monthly budgets: effective-dated targets per expense category, compared
 * with the month's spending.
 *
 * Spending of a category in a month = − Σ `amountCents` of its `expense`
 * transactions booked that month, so refunds filed in the category reduce
 * it. Transfers between the user's own accounts are never counted (they are
 * `transfer`, not `expense`), and income filed in an expense category is not
 * either. The same figure is what the transactions page totals for
 * `month` + `category` + `kind=expense`.
 *
 * Every month argument is a `YYYY-MM` calendar month; the controller fills
 * in the current Europe/Paris month by default.
 */
@Injectable()
export class BudgetsService {
  constructor(private readonly database: DatabaseService) {}

  private get db(): Db {
    return this.database.db
  }

  /**
   * Targets vs spending for one month, plus the unbudgeted spending. Without
   * `month`, the current month when it has data, else the month the data
   * stops in; `period` says how far the month's data goes.
   */
  async month(
    requested?: string,
    executor: Executor = this.db,
    now: Date = new Date(),
  ): Promise<BudgetMonthDto> {
    const period = await resolvePeriod(executor, requested, { now })
    const { month } = period
    const [rows, spending, categories] = await Promise.all([
      this.budgetRows(executor, month),
      this.spending(executor, month, month),
      this.categories(executor),
    ])
    const targets = targetsInEffect(rows, month)
    const spentBy = new Map(spending.map((row) => [row.categoryId, row]))

    const items: BudgetLineDto[] = []
    for (const [categoryId, target] of targets) {
      const category = categories.get(categoryId)
      if (!category) continue
      const spent = spentBy.get(categoryId)
      const spentCents = spent?.spentCents ?? 0
      items.push({
        categoryId,
        slug: category.slug,
        name: category.name,
        color: category.color,
        targetCents: target.monthlyTargetCents,
        effectiveFrom: toMonth(target.effectiveFrom),
        note: target.note,
        spentCents,
        spentExcludingOneOffsCents: spent?.spentExcludingOneOffsCents ?? 0,
        remainingCents: target.monthlyTargetCents - spentCents,
        percentUsed: percentUsed(spentCents, target.monthlyTargetCents),
        status: budgetStatus(spentCents, target.monthlyTargetCents),
      })
    }
    items.sort(
      (a, b) =>
        b.spentCents / b.targetCents - a.spentCents / a.targetCents ||
        a.name.localeCompare(b.name, 'fr'),
    )

    const targetCents = sum(items.map((item) => item.targetCents))
    const spentCents = sum(items.map((item) => item.spentCents))

    const unbudgeted: UnbudgetedCategoryDto[] = spending
      .filter(
        (row) =>
          (row.categoryId === null || !targets.has(row.categoryId)) &&
          row.spentCents !== 0,
      )
      .map((row) => {
        const category = row.categoryId
          ? categories.get(row.categoryId)
          : undefined
        return {
          categoryId: row.categoryId,
          slug: category?.slug ?? null,
          name: category?.name ?? null,
          color: category?.color ?? null,
          budgetable: category?.kind === 'expense',
          spentCents: row.spentCents,
        }
      })
      .sort((a, b) => b.spentCents - a.spentCents)

    return {
      month,
      period,
      items,
      totals: {
        targetCents,
        spentCents,
        spentExcludingOneOffsCents: sum(
          items.map((item) => item.spentExcludingOneOffsCents),
        ),
        remainingCents: targetCents - spentCents,
        percentUsed: percentUsed(spentCents, targetCents),
        status: targetCents > 0 ? budgetStatus(spentCents, targetCents) : null,
        budgetCount: items.length,
        overCount: items.filter((item) => item.status === 'over').length,
        warningCount: items.filter((item) => item.status === 'warning').length,
      },
      unbudgeted: {
        totalCents: sum(unbudgeted.map((row) => row.spentCents)),
        categoryCount: unbudgeted.length,
        top: unbudgeted
          .filter((row) => row.spentCents > 0)
          .slice(0, UNBUDGETED_TOP_COUNT),
      },
    }
  }

  /**
   * Target and spending per month for the `count` months ending with
   * `last`, for every category budgeted in at least one of them.
   */
  async history(
    last: string,
    count: number,
    executor: Executor = this.db,
  ): Promise<BudgetHistoryDto> {
    const months = monthRange(last, count)
    const [rows, spending, categories] = await Promise.all([
      this.budgetRows(executor, last),
      this.spending(executor, months[0], last),
      this.categories(executor),
    ])
    const targetsByMonth = new Map(
      months.map((month) => [month, targetsInEffect(rows, month)]),
    )
    const spent = new Map(
      spending.map((row) => [`${row.month}|${row.categoryId}`, row.spentCents]),
    )
    const spentIn = (month: string, categoryId: string) =>
      spent.get(`${month}|${categoryId}`) ?? 0

    const budgeted = new Set<string>()
    for (const targets of targetsByMonth.values()) {
      for (const categoryId of targets.keys()) budgeted.add(categoryId)
    }

    const historyCategories = [...budgeted]
      .flatMap((categoryId) => {
        const category = categories.get(categoryId)
        return category ? [category] : []
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .map((category) => ({
        categoryId: category.id,
        slug: category.slug,
        name: category.name,
        color: category.color,
        months: months.map((month) => {
          const target =
            targetsByMonth.get(month)!.get(category.id)?.monthlyTargetCents ??
            null
          const spentCents = spentIn(month, category.id)
          return {
            month,
            targetCents: target,
            spentCents,
            status: target === null ? null : budgetStatus(spentCents, target),
          }
        }),
      }))

    const totals = months.map((month) => {
      const targets = [...targetsByMonth.get(month)!.values()].filter(
        (target) => categories.has(target.categoryId),
      )
      const targetCents = sum(targets.map((t) => t.monthlyTargetCents))
      const spentCents = sum(targets.map((t) => spentIn(month, t.categoryId)))
      return {
        month,
        targetCents,
        spentCents,
        status: targetCents > 0 ? budgetStatus(spentCents, targetCents) : null,
      }
    })

    return { months, categories: historyCategories, totals }
  }

  /**
   * Suggested targets for `month`: the average monthly spending of each
   * expense category over the `count` full months before it, one-offs
   * excluded (they are left out of monthly averages), rounded to the euro.
   * The average divides by the months that have transactions at all, so a
   * history shorter than the window is not diluted by empty months.
   * Nothing is saved.
   */
  async suggest(
    month: string,
    count: number,
    executor: Executor = this.db,
  ): Promise<BudgetSuggestionsDto> {
    const months = monthRange(shiftMonth(month, -1), count)
    const start = firstDay(months[0])
    const next = firstDay(month)
    const [rows, spending, categories, withData] = await Promise.all([
      this.budgetRows(executor, month),
      this.spending(executor, months[0], months.at(-1)!),
      this.categories(executor),
      executor
        .selectDistinct({
          month: sql<string>`to_char(${transactionsTable.bookingDate}, 'YYYY-MM')`,
        })
        .from(transactionsTable)
        .where(
          and(
            gte(transactionsTable.bookingDate, start),
            lt(transactionsTable.bookingDate, next),
          ),
        ),
    ])
    const monthsWithData = withData.length
    const targets = targetsInEffect(rows, month)

    const totals = new Map<string, number>()
    for (const row of spending) {
      if (row.categoryId === null) continue
      if (categories.get(row.categoryId)?.kind !== 'expense') continue
      totals.set(
        row.categoryId,
        (totals.get(row.categoryId) ?? 0) + row.spentExcludingOneOffsCents,
      )
    }

    const items =
      monthsWithData === 0
        ? []
        : [...totals]
            .map(([categoryId, total]) => {
              const category = categories.get(categoryId)!
              const averageCents = Math.round(total / monthsWithData)
              return {
                categoryId,
                slug: category.slug,
                name: category.name,
                color: category.color,
                averageCents,
                suggestedCents: roundToEuro(averageCents),
                currentTargetCents:
                  targets.get(categoryId)?.monthlyTargetCents ?? null,
              }
            })
            .filter((item) => item.suggestedCents > 0)
            .sort(
              (a, b) =>
                b.suggestedCents - a.suggestedCents ||
                a.name.localeCompare(b.name, 'fr'),
            )

    return { month, months, monthsWithData, items }
  }

  /**
   * Sets the target of a category from `effectiveFrom` on (upsert of that
   * month's row). Later rows are kept: a target already planned for a later
   * month still takes over from it. An omitted note is carried over from the
   * target in effect.
   */
  upsert(
    categoryId: string,
    effectiveFrom: string,
    dto: Pick<UpsertBudgetDto, 'monthlyTargetCents' | 'note'>,
  ): Promise<BudgetDto> {
    return this.db.transaction(async (tx) => {
      await this.requireExpenseCategory(tx, categoryId)
      const start = firstDay(effectiveFrom)
      let note = dto.note
      if (note === undefined) {
        const [inEffect] = await tx
          .select({ note: budgetsTable.note })
          .from(budgetsTable)
          .where(
            and(
              eq(budgetsTable.categoryId, categoryId),
              lte(budgetsTable.effectiveFrom, start),
            ),
          )
          .orderBy(sql`${budgetsTable.effectiveFrom} desc`)
          .limit(1)
        note = inEffect?.note ?? null
      }
      const [row] = await tx
        .insert(budgetsTable)
        .values({
          categoryId,
          effectiveFrom: start,
          monthlyTargetCents: dto.monthlyTargetCents,
          note,
        })
        .onConflictDoUpdate({
          target: [budgetsTable.categoryId, budgetsTable.effectiveFrom],
          set: { monthlyTargetCents: dto.monthlyTargetCents, note },
        })
        .returning(budgetColumns)
      return {
        id: row.id,
        categoryId: row.categoryId,
        effectiveFrom: toMonth(row.effectiveFrom),
        monthlyTargetCents: row.monthlyTargetCents!,
        note: row.note,
      }
    })
  }

  /**
   * Stops budgeting a category from `from` on. Targets planned for `from` or
   * later are deleted; if a target was still in effect, a row with a null
   * target is stored at `from` to end it, so earlier months keep their
   * target in the history. Idempotent; 404 when the category never had a
   * budget.
   */
  remove(categoryId: string, from: string): Promise<void> {
    return this.db.transaction(async (tx) => {
      const start = firstDay(from)
      const rows = await tx
        .select(budgetColumns)
        .from(budgetsTable)
        .where(eq(budgetsTable.categoryId, categoryId))
        .orderBy(asc(budgetsTable.effectiveFrom))
      if (rows.length === 0) {
        throw new NotFoundException('No budget for this category')
      }
      const later = rows.filter((row) => row.effectiveFrom >= start)
      if (later.length > 0) {
        await tx.delete(budgetsTable).where(
          inArray(
            budgetsTable.id,
            later.map((row) => row.id),
          ),
        )
      }
      const before = rows.filter((row) => row.effectiveFrom < start).at(-1)
      if (before && before.monthlyTargetCents !== null) {
        await tx.insert(budgetsTable).values({
          categoryId,
          effectiveFrom: start,
          monthlyTargetCents: null,
        })
      }
    })
  }

  private async requireExpenseCategory(executor: Executor, id: string) {
    const [category] = await executor
      .select({ kind: categoriesTable.kind })
      .from(categoriesTable)
      .where(eq(categoriesTable.id, id))
      .limit(1)
    if (!category) throw new NotFoundException('Category not found')
    if (category.kind !== 'expense') {
      throw new BadRequestException('Only expense categories can have a budget')
    }
  }

  /** Every budget row that can be in effect up to `last` (a small table). */
  private async budgetRows(
    executor: Executor,
    last: string,
  ): Promise<BudgetRow[]> {
    return executor
      .select(budgetColumns)
      .from(budgetsTable)
      .where(lte(budgetsTable.effectiveFrom, firstDay(last)))
  }

  /** Spending per month and category (null = uncategorized), `first`–`last`. */
  private async spending(
    executor: Executor,
    first: string,
    last: string,
  ): Promise<SpendingRow[]> {
    const t = transactionsTable
    const month = sql<string>`to_char(${t.bookingDate}, 'YYYY-MM')`
    return executor
      .select({
        month,
        categoryId: t.categoryId,
        spentCents: spentSum(),
        spentExcludingOneOffsCents: spentSum(eq(t.isOneOff, false)),
      })
      .from(t)
      .where(
        and(
          eq(t.kind, 'expense'),
          gte(t.bookingDate, firstDay(first)),
          lt(t.bookingDate, firstDay(shiftMonth(last, 1))),
        ),
      )
      .groupBy(month, t.categoryId)
  }

  private async categories(
    executor: Executor,
  ): Promise<Map<string, CategoryInfo>> {
    const rows = await executor
      .select({
        id: categoriesTable.id,
        slug: categoriesTable.slug,
        name: categoriesTable.name,
        color: categoriesTable.color,
        kind: categoriesTable.kind,
      })
      .from(categoriesTable)
    return new Map(rows.map((row) => [row.id, row]))
  }
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}
