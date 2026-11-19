import { BadRequestException, Injectable } from '@nestjs/common'
import { and, eq, gt, gte, inArray, lte, min } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { AccountsService, isBankAccount } from '#/accounts/accounts.service'
import { dataUntilByAccount } from '#/coverage/coverage'
import { monthEnd, shiftMonth } from '#/dashboard/calendar'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import { transactionsTable } from '#/database/schema'
import { normalizeLabel } from '#/imports/normalize/label'
import { daysBetween, maxDate, todayInParis } from '#/recurring/dates'
import { seriesKey } from '#/recurring/detect'
import { RecurringService } from '#/recurring/recurring.service'
import {
  ESTIMATE_MONTHS,
  FORECAST_STALE_AFTER_DAYS,
  type ForecastDto,
  type ForecastEstimateDto,
} from './dto/forecast.dto'
import {
  averageDailyCents,
  buildProjection,
  estimateDays,
  expectedOccurrences,
  type ProjectionWindow,
  projectionStart,
  spreadEstimate,
} from './project'

type Db = PostgresJsDatabase<typeof schema>

export interface ForecastOptions {
  accountIds?: readonly string[]
  thresholdCents?: number
  includeVariable?: boolean
}

/**
 * End-of-month cash-flow forecast of the checking (or chosen) accounts: the
 * current balance, the remaining occurrences of the confirmed recurring
 * items, and optionally an estimate of the day-to-day spending, projected
 * day by day until the end of the month. "Today" and the month are read in
 * Europe/Paris. Everything is recomputed from the transactions on every
 * call, so the forecast follows the imports.
 *
 * Statements are imported by hand, so the data often stops before today
 * (#215): the projection starts the day after the imported data ends
 * (`coverage/` `dataUntil` of the selected accounts), not today, and the
 * days not imported yet are estimated on their own dates. Transactions
 * entered by hand since then are already in the balance: the day-to-day
 * ones replace the estimate of the elapsed days. Data more than
 * `FORECAST_STALE_AFTER_DAYS` old makes the forecast indicative: no
 * low-balance alert.
 *
 * Never logs labels or amounts.
 */
@Injectable()
export class ForecastService {
  constructor(
    private readonly database: DatabaseService,
    private readonly accountsService: AccountsService,
    private readonly recurringService: RecurringService,
  ) {}

  private get db(): Db {
    return this.database.db
  }

  async forecast(
    {
      accountIds,
      thresholdCents = 0,
      includeVariable = true,
    }: ForecastOptions = {},
    now: Date = new Date(),
  ): Promise<ForecastDto> {
    const today = todayInParis(now)
    const month = today.slice(0, 7)

    const accounts = await this.selectAccounts(accountIds)
    const selected = new Set(accounts.map((account) => account.id))
    const coverage = await dataUntilByAccount(this.db, now)
    const knownUntil = accounts.reduce<string | null>((latest, account) => {
      const until = coverage.get(account.id)
      if (until === undefined) return latest
      return latest === null ? until : maxDate(latest, until)
    }, null)
    const window: ProjectionWindow = {
      today,
      start: projectionStart(today, knownUntil),
      monthEnd: monthEnd(month),
    }
    const stale =
      knownUntil === null ||
      daysBetween(knownUntil, today) > FORECAST_STALE_AFTER_DAYS
    // How far each account's data goes, to tell a booked or missed
    // occurrence from one not imported yet.
    const horizons = new Map(
      accounts.map((account) => [
        account.id,
        coverage.get(account.id) ?? account.balanceDate,
      ]),
    )
    const startingBalanceCents = accounts.reduce(
      (sum, account) => sum + (account.balanceCents ?? 0),
      0,
    )
    const startingBalanceDate = accounts.reduce<string | null>(
      (latest, account) =>
        account.balanceDate === null
          ? latest
          : latest === null
            ? account.balanceDate
            : maxDate(latest, account.balanceDate),
      null,
    )

    const confirmed = (
      await this.recurringService.list('confirmed', today)
    ).filter((item) => selected.has(item.accountId))
    // A cancelled item still projects its occurrences expected before its
    // end date (`expectedOccurrences`); one ended as of today is not counted.
    const active = confirmed.filter((item) => item.active)
    const items = active
      .flatMap((item) =>
        expectedOccurrences(
          {
            id: item.id,
            accountId: item.accountId,
            name: item.name,
            direction: item.direction,
            cadence: item.cadence,
            amountType: item.amountType,
            isFixedCost: item.isFixedCost,
            typicalAmountCents: item.typicalAmountCents,
            nextExpectedDate: item.nextExpectedDate,
            endedOn: item.endedOn,
            termMonths: item.termMonths,
            bookedDates: item.occurrences.map((o) => o.date),
            categoryName: item.categoryName,
            categoryColor: item.categoryColor,
            categoryIcon: item.categoryIcon,
          },
          window,
          horizons.get(item.accountId) ?? null,
        ),
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.expectedDate.localeCompare(b.expectedDate) ||
          a.amountCents - b.amountCents ||
          a.name.localeCompare(b.name, 'fr'),
      )

    const recurringKeys = new Set(
      confirmed.map((item) =>
        seriesKey(item.accountId, item.merchantKey, item.direction),
      ),
    )
    const daily = includeVariable
      ? await this.averageDailySpending([...selected], recurringKeys, month)
      : null
    const daysByDate = estimateDays(window, knownUntil)
    const spread = daily
      ? spreadEstimate(
          daysByDate,
          daily.dailyCents,
          await this.manualSpending(
            [...selected],
            recurringKeys,
            knownUntil,
            today,
          ),
          today,
        )
      : { byDate: new Map<string, number>(), coveredCents: 0 }
    const projection = buildProjection({
      window,
      startingBalanceCents,
      items,
      estimateByDate: spread.byDate,
      thresholdCents,
    })
    const estimate: ForecastEstimateDto | null = daily && {
      ...daily,
      days: [...daysByDate.values()].reduce((sum, days) => sum + days, 0),
      coveredCents: spread.coveredCents,
      totalCents: projection.estimateTotalCents,
    }

    return {
      today,
      monthEnd: window.monthEnd,
      accounts: accounts.map(
        ({ id, name, type, balanceCents, balanceDate }) => ({
          id,
          name,
          type,
          balanceCents,
          balanceDate,
        }),
      ),
      startingBalanceCents,
      startingBalanceDate,
      knownUntil,
      projectedFrom: window.start,
      stale,
      staleAfterDays: FORECAST_STALE_AFTER_DAYS,
      thresholdCents,
      recurringItemCount: active.filter((item) => !item.ended).length,
      items,
      expectedDebitsCents: items
        .filter((item) => item.amountCents < 0)
        .reduce((sum, item) => sum + item.amountCents, 0),
      expectedCreditsCents: items
        .filter((item) => item.amountCents > 0)
        .reduce((sum, item) => sum + item.amountCents, 0),
      estimate,
      points: projection.points,
      endBalanceCents: projection.endBalanceCents,
      lowest: projection.lowest,
      // Data lagging behind today would raise a false alarm (#215).
      belowThreshold: stale ? null : projection.belowThreshold,
    }
  }

  /**
   * The requested checking / savings accounts (400 for an unknown,
   * investment or meal-voucher account: the forecast is the bank's), or
   * every non-archived checking account.
   */
  private async selectAccounts(accountIds: readonly string[] | undefined) {
    const accounts = await this.accountsService.list({ includeArchived: true })
    if (accountIds === undefined || accountIds.length === 0) {
      return accounts.filter(
        (account) => account.type === 'checking' && account.archivedAt === null,
      )
    }
    const wanted = new Set(accountIds)
    const found = accounts.filter((account) => wanted.has(account.id))
    if (
      found.length !== wanted.size ||
      found.some((account) => !isBankAccount(account))
    ) {
      throw new BadRequestException(
        'accountIds must be checking or savings accounts',
      )
    }
    return found
  }

  /**
   * Average daily day-to-day spending over the last `ESTIMATE_MONTHS` full
   * months (from the accounts' first transaction when they are younger):
   * `expense` transactions that are not one-offs and not part of a confirmed
   * recurring item (those are projected on their own), refunds netted.
   * Transfers are never expenses. Null without any history in the period.
   */
  private async averageDailySpending(
    accountIds: string[],
    recurringKeys: ReadonlySet<string>,
    month: string,
  ): Promise<Omit<
    ForecastEstimateDto,
    'days' | 'coveredCents' | 'totalCents'
  > | null> {
    if (accountIds.length === 0) return null
    const t = transactionsTable
    const periodEnd = monthEnd(shiftMonth(month, -1))
    const [{ first }] = await this.db
      .select({ first: min(t.bookingDate) })
      .from(t)
      .where(inArray(t.accountId, accountIds))
    if (first === null || first > periodEnd) return null
    const from = maxDate(`${shiftMonth(month, -ESTIMATE_MONTHS)}-01`, first)

    const rows = await this.db
      .select({
        accountId: t.accountId,
        amountCents: t.amountCents,
        rawLabel: t.rawLabel,
      })
      .from(t)
      .where(
        and(
          inArray(t.accountId, accountIds),
          eq(t.kind, 'expense'),
          eq(t.isOneOff, false),
          gte(t.bookingDate, from),
          lte(t.bookingDate, periodEnd),
        ),
      )
    let spentCents = 0
    for (const row of rows) {
      const { merchantKey } = normalizeLabel(row.rawLabel, row.amountCents)
      const direction = row.amountCents < 0 ? 'debit' : 'credit'
      if (
        merchantKey &&
        recurringKeys.has(seriesKey(row.accountId, merchantKey, direction))
      ) {
        continue
      }
      spentCents -= row.amountCents
    }
    const dailyCents = averageDailyCents(spentCents, from, periodEnd)
    if (dailyCents === null) return null
    return { dailyCents, basedOnFrom: from, basedOnTo: periodEnd }
  }

  /**
   * Day-to-day spending entered by hand (`manual`) after `knownUntil` and up
   * to today, in positive cents: the same `expense` transactions as the
   * estimate (no one-offs, no confirmed recurring series), refunds netted.
   * They are already in the balance. Without imported data, today's only.
   */
  private async manualSpending(
    accountIds: string[],
    recurringKeys: ReadonlySet<string>,
    knownUntil: string | null,
    today: string,
  ): Promise<number> {
    if (accountIds.length === 0) return 0
    const t = transactionsTable
    const rows = await this.db
      .select({
        accountId: t.accountId,
        amountCents: t.amountCents,
        rawLabel: t.rawLabel,
      })
      .from(t)
      .where(
        and(
          inArray(t.accountId, accountIds),
          eq(t.manual, true),
          eq(t.kind, 'expense'),
          eq(t.isOneOff, false),
          knownUntil === null
            ? gte(t.bookingDate, today)
            : gt(t.bookingDate, knownUntil),
          lte(t.bookingDate, today),
        ),
      )
    let spentCents = 0
    for (const row of rows) {
      const { merchantKey } = normalizeLabel(row.rawLabel, row.amountCents)
      const direction = row.amountCents < 0 ? 'debit' : 'credit'
      if (
        merchantKey &&
        recurringKeys.has(seriesKey(row.accountId, merchantKey, direction))
      ) {
        continue
      }
      spentCents -= row.amountCents
    }
    return Math.max(0, spentCents)
  }
}
