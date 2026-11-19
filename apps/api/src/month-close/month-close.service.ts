import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common'
import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import {
  AccountsService,
  isBankAccount,
} from '#/accounts/accounts.service'
import { BudgetsService } from '#/budgets/budgets.service'
import { dataUntilByAccount } from '#/coverage/coverage'
import { currentMonth, monthEnd, shiftMonth } from '#/dashboard/calendar'
import { DashboardService } from '#/dashboard/dashboard.service'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  bankAmountCents,
  bankBookingDate,
  categoriesTable,
  recurringItemsTable,
  transactionLinesView,
  transactionsTable,
} from '#/database/schema'
import { daysBetween } from '#/investments/days'
import { RecurringService } from '#/recurring/recurring.service'
import { SavingsService } from '#/savings/savings.service'
import {
  ACKNOWLEDGEABLE_STEPS,
  type CloseImportAccountDto,
  type CloseMonthDto,
  type MonthCloseDto,
  type MonthCloseStepDto,
  type MonthReportDto,
  REPORT_ONE_OFFS,
  type ReportCategoryDto,
  type ReportChangeDto,
  type UpdateMonthCloseDto,
} from './dto/month-close.dto'
import { monthClosesTable, type SelectMonthClose } from './month-close.schema'
import { storedContinuityGaps, type StoredRow } from './stored-continuity'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** The database or an open transaction. */
type Executor = Db | Tx

interface Options {
  now?: Date
  executor?: Executor
}

const CLOSED_MESSAGE = 'Ce mois est clôturé : rouvrez-le pour le modifier.'

/** Trimmed notes; empty means none. */
function cleanNotes(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

function categoryKey(row: { kind: string; categoryId: string | null }): string {
  return `${row.kind}:${row.categoryId ?? ''}`
}

/**
 * Figures of a closed month's report that no longer match the data: income,
 * expenses, net, net worth at the month end, and every category total.
 */
export function reportChanges(
  closed: MonthReportDto,
  current: MonthReportDto,
): ReportChangeDto[] {
  const changes: ReportChangeDto[] = []
  const field = (
    name: 'income' | 'expense' | 'net' | 'net_worth',
    closedCents: number | null,
    currentCents: number | null,
  ) => {
    if (closedCents === currentCents) return
    changes.push({
      field: name,
      kind: null,
      categoryId: null,
      name: null,
      closedCents,
      currentCents,
    })
  }
  field('income', closed.flow.incomeCents, current.flow.incomeCents)
  field('expense', closed.flow.expenseCents, current.flow.expenseCents)
  field('net', closed.flow.netCents, current.flow.netCents)
  field('net_worth', closed.netWorthCents, current.netWorthCents)

  const now = new Map(current.categories.map((c) => [categoryKey(c), c]))
  const before = new Map(closed.categories.map((c) => [categoryKey(c), c]))
  for (const key of new Set([...before.keys(), ...now.keys()])) {
    const a = before.get(key)
    const b = now.get(key)
    const closedCents = a?.amountCents ?? 0
    const currentCents = b?.amountCents ?? 0
    if (closedCents === currentCents) continue
    const category = (b ?? a)!
    changes.push({
      field: 'category',
      kind: category.kind,
      categoryId: category.categoryId,
      name: category.name,
      closedCents,
      currentCents,
    })
  }
  return changes
}

/**
 * The guided month-end review (#75). Each step is computed from what the app
 * already knows (the month review of the dashboard and its accounts not
 * updated, the coverage helper, the review queue, recurring items, budget,
 * savings target and goals); only the steps that are a matter of judgement
 * (price changes, budget, savings) are ticked by hand. Closing freezes the
 * month's report so later edits show as differences; reopening drops it.
 */
@Injectable()
export class MonthCloseService {
  constructor(
    private readonly database: DatabaseService,
    private readonly accounts: AccountsService,
    private readonly dashboard: DashboardService,
    private readonly budgets: BudgetsService,
    private readonly recurring: RecurringService,
    private readonly savings: SavingsService,
  ) {}

  private get db(): Db {
    return this.database.db
  }

  async get(
    month: string,
    { now = new Date(), executor = this.db }: Options = {},
  ): Promise<MonthCloseDto> {
    const start = `${month}-01`
    const end = monthEnd(month)
    const [
      row,
      review,
      accounts,
      coverage,
      queue,
      suggested,
      confirmed,
      target,
      goals,
    ] = await Promise.all([
      this.find(month, executor),
      this.dashboard.review(month, { now, executor }),
      this.accounts.list({}, executor),
      dataUntilByAccount(executor, now),
      this.reviewCount(start, end, executor),
      this.suggestedCount(executor),
      this.recurring.list('confirmed'),
      this.savings.readTarget(executor),
      this.savings.listGoals({}, { now, executor }),
    ])

    // Imported accounts only: a meal-voucher card is entered by hand (#298).
    const cash = accounts.filter(isBankAccount)
    const missingIds = new Set(review.missing.map((account) => account.id))
    const daysInMonth = Number(end.slice(8))
    const importAccounts: CloseImportAccountDto[] = cash.map((account) => {
      const lastDate = coverage.get(account.id) ?? null
      const upToDate = !missingIds.has(account.id)
      return {
        id: account.id,
        name: account.name,
        type: account.type,
        lastDate,
        upToDate,
        missingDays: upToDate
          ? 0
          : lastDate === null
            ? daysInMonth
            : Math.min(daysInMonth, daysBetween(lastDate, end)),
      }
    })
    const gaps = await this.continuityGaps(
      cash.map((account) => ({ id: account.id, name: account.name })),
      month,
      executor,
    )

    // A price change from the cancellation date on is a charge after the
    // end, listed below instead.
    const priceChanges = confirmed.flatMap((item) =>
      item.priceChangedOn !== null &&
      item.priceChangeCents !== null &&
      item.priceChangedOn >= start &&
      item.priceChangedOn <= end &&
      (item.endedOn === null || item.priceChangedOn < item.endedOn)
        ? [
            {
              id: item.id,
              name: item.name,
              previousAmountCents: item.previousAmountCents,
              latestAmountCents: item.latestAmountCents,
              priceChangeCents: item.priceChangeCents,
              priceChangedOn: item.priceChangedOn,
            },
          ]
        : [],
    )

    const chargedAfterEnd = confirmed.flatMap((item) => {
      const { endedOn } = item
      if (endedOn === null) return []
      // Occurrences are newest first.
      const charge = item.occurrences.find(
        (o) => o.date >= endedOn && o.date >= start && o.date <= end,
      )
      return charge
        ? [
            {
              id: item.id,
              name: item.name,
              endedOn,
              chargedOn: charge.date,
              amountCents: charge.amountCents,
            },
          ]
        : []
    })

    const notes = row?.notes ?? null
    const report = await this.report(month, {
      now,
      executor,
      notes,
      flow: review.flow,
      netWorthCents: review.netWorth.endCents,
      savingsTargetCents: target,
    })

    const acknowledged = ACKNOWLEDGEABLE_STEPS.filter((step) =>
      row?.acknowledged.includes(step),
    )
    const ack = new Set<string>(acknowledged)
    const investments = review.missing.filter(
      (account) => account.group === 'investments',
    )
    const closed = row?.closedAt != null && row.report !== null
    const done: Record<MonthCloseStepDto['key'], boolean> = {
      imports: importAccounts.every((a) => a.upToDate) && gaps.length === 0,
      review_queue: queue === 0,
      recurring:
        suggested === 0 &&
        ((priceChanges.length === 0 && chargedAfterEnd.length === 0) ||
          ack.has('recurring')),
      budget: ack.has('budget'),
      savings: ack.has('savings'),
      investments: investments.length === 0,
      close: closed,
    }

    const closedReport = closed ? row.report : null
    return {
      month,
      nextMonth: shiftMonth(month, 1),
      period: review.period,
      closable: month < currentMonth(now),
      status: closed ? 'closed' : 'open',
      closedAt: closed ? row.closedAt!.toISOString() : null,
      notes,
      acknowledged,
      steps: (Object.keys(done) as MonthCloseStepDto['key'][]).map((key) => ({
        key,
        done: done[key],
      })),
      imports: { accounts: importAccounts, gaps },
      reviewQueue: { count: queue },
      recurring: { suggestedCount: suggested, priceChanges, chargedAfterEnd },
      budget: review.budget,
      savings: {
        netCents: review.flow.netCents,
        targetCents: target,
        gapCents: target === null ? null : review.flow.netCents - target,
        goals: goals.map((goal) => ({
          id: goal.id,
          name: goal.name,
          targetCents: goal.targetCents,
          currentCents: goal.currentCents,
          progressRatio: goal.progressRatio,
          reached: goal.reached,
          targetDate: goal.targetDate,
        })),
      },
      investments: { accounts: investments },
      report,
      closedReport,
      changes: closedReport ? reportChanges(closedReport, report) : [],
    }
  }

  /** Notes and steps ticked by hand; refused while the month is closed. */
  async update(
    month: string,
    dto: UpdateMonthCloseDto,
    { now = new Date() }: { now?: Date } = {},
  ): Promise<MonthCloseDto> {
    const set: Partial<{ notes: string | null; acknowledged: string[] }> = {}
    if (dto.notes !== undefined) set.notes = cleanNotes(dto.notes)
    if (dto.acknowledged !== undefined) set.acknowledged = dto.acknowledged
    const saved = await this.db
      .insert(monthClosesTable)
      .values({ month, ...set })
      .onConflictDoUpdate({
        target: monthClosesTable.month,
        set: { ...set, updatedAt: new Date() },
        setWhere: isNull(monthClosesTable.closedAt),
      })
      .returning({ id: monthClosesTable.id })
    if (saved.length === 0) throw new ConflictException(CLOSED_MESSAGE)
    return this.get(month, { now })
  }

  /** Freezes the month's report; only a month that is over can be closed. */
  async close(
    month: string,
    dto: CloseMonthDto,
    { now = new Date() }: { now?: Date } = {},
  ): Promise<MonthCloseDto> {
    if (month >= currentMonth(now)) {
      throw new BadRequestException(
        'Le mois n’est pas terminé : il ne peut pas encore être clôturé.',
      )
    }
    const row = await this.find(month, this.db)
    if (row?.closedAt) throw new ConflictException('Ce mois est déjà clôturé.')
    const notes =
      dto.notes !== undefined ? cleanNotes(dto.notes) : (row?.notes ?? null)
    const report = await this.report(month, { now, executor: this.db, notes })
    const values = { notes, closedAt: now, report }
    const saved = await this.db
      .insert(monthClosesTable)
      .values({ month, ...values })
      .onConflictDoUpdate({
        target: monthClosesTable.month,
        set: { ...values, updatedAt: new Date() },
        setWhere: isNull(monthClosesTable.closedAt),
      })
      .returning({ id: monthClosesTable.id })
    if (saved.length === 0)
      throw new ConflictException('Ce mois est déjà clôturé.')
    return this.get(month, { now })
  }

  /** Drops the frozen report; the month is reviewed again from live data. */
  async reopen(
    month: string,
    { now = new Date() }: { now?: Date } = {},
  ): Promise<MonthCloseDto> {
    const reopened = await this.db
      .update(monthClosesTable)
      .set({ closedAt: null, report: null, updatedAt: new Date() })
      .where(
        and(
          eq(monthClosesTable.month, month),
          isNotNull(monthClosesTable.closedAt),
        ),
      )
      .returning({ id: monthClosesTable.id })
    if (reopened.length === 0) {
      throw new ConflictException('Ce mois n’est pas clôturé.')
    }
    return this.get(month, { now })
  }

  // --- Helpers --------------------------------------------------------------

  private async find(
    month: string,
    executor: Executor,
  ): Promise<SelectMonthClose | null> {
    const [row] = await executor
      .select()
      .from(monthClosesTable)
      .where(eq(monthClosesTable.month, month))
    return row ?? null
  }

  /**
   * The month's report as the data stands: flow, net worth at the month end,
   * savings target, totals per category (with the month before and the
   * budget targets) and the largest one-offs.
   */
  private async report(
    month: string,
    {
      now,
      executor,
      notes,
      ...known
    }: {
      now: Date
      executor: Executor
      notes: string | null
      flow?: MonthReportDto['flow']
      netWorthCents?: number | null
      savingsTargetCents?: number | null
    },
  ): Promise<MonthReportDto> {
    const [review, target, budget, totals, oneOffs] = await Promise.all([
      known.flow === undefined
        ? this.dashboard.review(month, { now, executor })
        : null,
      known.savingsTargetCents === undefined
        ? this.savings.readTarget(executor)
        : known.savingsTargetCents,
      this.budgets.month(month, executor, now),
      this.categoryTotals(month, executor),
      this.oneOffs(month, executor),
    ])

    const categories = new Map<string, ReportCategoryDto>()
    for (const row of totals) {
      const key = categoryKey(row)
      const entry = categories.get(key) ?? {
        categoryId: row.categoryId,
        name: row.name,
        color: row.color,
        kind: row.kind,
        amountCents: 0,
        previousAmountCents: 0,
        targetCents: null,
      }
      const amount = row.kind === 'expense' ? -row.totalCents : row.totalCents
      if (row.month === month) entry.amountCents = amount
      else entry.previousAmountCents = amount
      categories.set(key, entry)
    }
    for (const item of budget.items) {
      const key = categoryKey({ kind: 'expense', categoryId: item.categoryId })
      const entry = categories.get(key) ?? {
        categoryId: item.categoryId,
        name: item.name,
        color: item.color,
        kind: 'expense' as const,
        amountCents: 0,
        previousAmountCents: 0,
        targetCents: null,
      }
      entry.targetCents = item.targetCents
      categories.set(key, entry)
    }

    return {
      month,
      flow: known.flow ?? review!.flow,
      netWorthCents:
        known.netWorthCents !== undefined
          ? known.netWorthCents
          : review!.netWorth.endCents,
      savingsTargetCents: target,
      categories: [...categories.values()].sort(
        (a, b) =>
          (a.kind === b.kind ? 0 : a.kind === 'expense' ? -1 : 1) ||
          b.amountCents - a.amountCents ||
          (a.name ?? '').localeCompare(b.name ?? '', 'fr'),
      ),
      oneOffs,
      notes,
    }
  }

  /** Income and expense sums per category of `month` and the month before. */
  private async categoryTotals(month: string, executor: Executor) {
    // Lines: a split transaction counts in each of its categories.
    const t = transactionLinesView
    const c = categoriesTable
    const bucket = sql<string>`to_char(${t.bookingDate}, 'YYYY-MM')`
    return executor
      .select({
        month: bucket,
        categoryId: t.categoryId,
        kind: sql<'income' | 'expense'>`${t.kind}`,
        name: c.name,
        color: c.color,
        totalCents: sql<number>`sum(${t.amountCents})::bigint`.mapWith(Number),
      })
      .from(t)
      .leftJoin(c, eq(c.id, t.categoryId))
      .where(
        and(
          inArray(t.kind, ['income', 'expense']),
          gte(t.bookingDate, `${shiftMonth(month, -1)}-01`),
          lte(t.bookingDate, monthEnd(month)),
        ),
      )
      .groupBy(bucket, t.categoryId, t.kind, c.name, c.color)
  }

  private async oneOffs(month: string, executor: Executor) {
    const t = transactionsTable
    const c = categoriesTable
    return executor
      .select({
        transactionId: t.id,
        date: t.bookingDate,
        label: sql<string>`coalesce(${t.merchant}, ${t.rawLabel})`,
        amountCents: t.amountCents,
        categoryName: c.name,
      })
      .from(t)
      .leftJoin(c, eq(c.id, t.categoryId))
      .where(
        and(
          eq(t.isOneOff, true),
          inArray(t.kind, ['income', 'expense']),
          gte(t.bookingDate, `${month}-01`),
          lte(t.bookingDate, monthEnd(month)),
        ),
      )
      .orderBy(sql`abs(${t.amountCents}) desc`, asc(t.bookingDate), asc(t.id))
      .limit(REPORT_ONE_OFFS)
  }

  private async reviewCount(
    start: string,
    end: string,
    executor: Executor,
  ): Promise<number> {
    const t = transactionsTable
    const [{ value }] = await executor
      .select({ value: count() })
      .from(t)
      .where(
        and(
          eq(t.needsReview, true),
          gte(t.bookingDate, start),
          lte(t.bookingDate, end),
        ),
      )
    return value
  }

  private async suggestedCount(executor: Executor): Promise<number> {
    const [{ value }] = await executor
      .select({ value: count() })
      .from(recurringItemsTable)
      .where(eq(recurringItemsTable.status, 'suggested'))
    return value
  }

  /**
   * Running-balance gaps of the month on the cash accounts, from the stored
   * bank rows (manual expenses left out); the month before gives the opening
   * balance.
   */
  private async continuityGaps(
    accounts: { id: string; name: string }[],
    month: string,
    executor: Executor,
  ) {
    if (accounts.length === 0) return []
    const t = transactionsTable
    const rows = await executor
      .select({
        accountId: t.accountId,
        // Bank values: a row corrected by hand (#74) keeps the bank's chain.
        bookingDate: bankBookingDate,
        amountCents: bankAmountCents,
        balanceAfterCents: t.balanceAfterCents,
      })
      .from(t)
      .where(
        and(
          inArray(
            t.accountId,
            accounts.map((account) => account.id),
          ),
          eq(t.manual, false),
          gte(bankBookingDate, `${shiftMonth(month, -1)}-01`),
          lte(bankBookingDate, monthEnd(month)),
        ),
      )
      .orderBy(asc(bankBookingDate), asc(t.id))
    const byAccount = new Map<string, StoredRow[]>()
    for (const row of rows) {
      const list = byAccount.get(row.accountId) ?? []
      list.push(row)
      byAccount.set(row.accountId, list)
    }
    return accounts.flatMap((account) =>
      storedContinuityGaps(byAccount.get(account.id) ?? [], `${month}-01`).map(
        (gap) => ({ accountId: account.id, accountName: account.name, ...gap }),
      ),
    )
  }
}
