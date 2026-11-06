import { BadRequestException, Injectable } from '@nestjs/common'
import { and, eq, gte, inArray, lte, min } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import {
  AccountsService,
  isTransactionalAccount,
} from '#/accounts/accounts.service'
import { monthEnd, shiftMonth } from '#/dashboard/calendar'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import { transactionsTable } from '#/database/schema'
import { normalizeLabel } from '#/imports/normalize/label'
import { maxDate, todayInParis } from '#/recurring/dates'
import { seriesKey } from '#/recurring/detect'
import { RecurringService } from '#/recurring/recurring.service'
import {
  ESTIMATE_MONTHS,
  type ForecastDto,
  type ForecastEstimateDto,
} from './dto/forecast.dto'
import {
  averageDailyCents,
  buildProjection,
  estimateDays,
  expectedOccurrences,
  type ProjectionWindow,
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
    const window: ProjectionWindow = { today, monthEnd: monthEnd(month) }

    const accounts = await this.selectAccounts(accountIds)
    const selected = new Set(accounts.map((account) => account.id))
    const horizons = new Map(
      accounts.map((account) => [account.id, account.balanceDate]),
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

    const confirmed = (await this.recurringService.list('confirmed')).filter(
      (item) => selected.has(item.accountId),
    )
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
            bookedDates: item.occurrences.map((o) => o.date),
            categoryName: item.categoryName,
            categoryColor: item.categoryColor,
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

    const daily = includeVariable
      ? await this.averageDailySpending(
          [...selected],
          new Set(
            confirmed.map((item) =>
              seriesKey(item.accountId, item.merchantKey, item.direction),
            ),
          ),
          month,
        )
      : null
    const daysByDate = estimateDays(window, startingBalanceDate)
    const projection = buildProjection({
      window,
      startingBalanceCents,
      items,
      dailyEstimateCents: daily?.dailyCents ?? null,
      estimateDaysByDate: daysByDate,
      thresholdCents,
    })
    const estimate: ForecastEstimateDto | null = daily && {
      ...daily,
      days: [...daysByDate.values()].reduce((sum, days) => sum + days, 0),
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
      thresholdCents,
      recurringItemCount: active.length,
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
      belowThreshold: projection.belowThreshold,
    }
  }

  /**
   * The requested checking / savings accounts (400 for an unknown or
   * investment account), or every non-archived checking account.
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
      found.some((account) => !isTransactionalAccount(account))
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
  ): Promise<Omit<ForecastEstimateDto, 'days' | 'totalCents'> | null> {
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
}
