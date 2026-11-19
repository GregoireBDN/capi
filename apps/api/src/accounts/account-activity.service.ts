import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq, gte, isNotNull, lte, max, sql } from 'drizzle-orm'
import { dataUntil, resolvePeriod } from '#/coverage/coverage'
import { monthEnd, shiftMonth } from '#/dashboard/calendar'
import { DatabaseService } from '#/database/database.service'
import {
  accountsTable,
  balanceSnapshotsTable,
  bankAmountCents,
  bankBookingDate,
  importsTable,
  transactionsTable,
} from '#/database/schema'
import { parisToday } from '#/investments/days'
import { storedContinuityGaps } from '#/month-close/stored-continuity'
import { isTransactionalAccount } from './accounts.service'
import { balanceHistory } from './balance-history'
import type {
  AccountMonthFlowsDto,
  BalanceHistoryDto,
} from './dto/account-activity.dto'

/** Months shown by the balance history, the last one included. */
export const BALANCE_HISTORY_MONTHS = 12

/** Sums come back from Postgres as `numeric` strings. */
function toCents(value: string | number | null): number {
  if (value === null) return 0
  const cents = Number(value)
  if (!Number.isSafeInteger(cents)) throw new RangeError('Sum overflow')
  return cents
}

/**
 * The life of a cash account (checking, savings) for its page (#293): its
 * balance over the last months, its import status and the month's flows.
 * Investment accounts have their own performance endpoint.
 */
@Injectable()
export class AccountActivityService {
  constructor(private readonly database: DatabaseService) {}

  private get db() {
    return this.database.db
  }

  private async cashAccount(id: string) {
    const [account] = await this.db
      .select({ id: accountsTable.id, type: accountsTable.type })
      .from(accountsTable)
      .where(eq(accountsTable.id, id))
      .limit(1)
    if (!account) throw new NotFoundException('Account not found')
    if (!isTransactionalAccount(account)) {
      throw new BadRequestException('Only checking and savings accounts')
    }
    return account
  }

  /**
   * Daily balance over the last `BALANCE_HISTORY_MONTHS` months of data
   * (see `balanceHistory`), the statement balances and the running-balance
   * gaps of the window, and how far the bank data goes.
   */
  async balanceHistory(
    id: string,
    now: Date = new Date(),
  ): Promise<BalanceHistoryDto> {
    await this.cashAccount(id)
    const t = transactionsTable
    const s = balanceSnapshotsTable
    const i = importsTable
    const today = parisToday(now)
    const [rows, snapshots, until, [lastImport]] = await Promise.all([
      this.db
        .select({
          // Bank values: a row corrected by hand (#74) keeps the bank's chain.
          date: bankBookingDate,
          amountCents: bankAmountCents,
          balanceAfterCents: t.balanceAfterCents,
          manual: t.manual,
        })
        .from(t)
        .where(eq(t.accountId, id))
        .orderBy(asc(bankBookingDate), asc(t.id)),
      this.db
        .select({ date: s.date, valueCents: s.valueCents })
        .from(s)
        .where(eq(s.accountId, id))
        .orderBy(asc(s.date)),
      dataUntil(this.db, { accountId: id, now }),
      this.db
        .select({ last: max(i.committedAt) })
        .from(i)
        .where(and(eq(i.accountId, id), isNotNull(i.committedAt))),
    ])
    const lastImportOn = lastImport?.last ? parisToday(lastImport.last) : null

    const days = [...rows.map((r) => r.date), ...snapshots.map((s) => s.date)]
    if (days.length === 0) {
      return {
        from: null,
        to: null,
        points: [],
        statements: [],
        gaps: [],
        dataUntil: until,
        lastImportOn,
      }
    }
    const first = days.reduce((a, b) => (a < b ? a : b))
    const last = days.reduce((a, b) => (a > b ? a : b))
    // A deferred card debit can be booked ahead: never past today.
    const to = last < today ? last : today
    const windowStart = `${shiftMonth(to.slice(0, 7), 1 - BALANCE_HISTORY_MONTHS)}-01`
    const from = first > windowStart ? first : windowStart

    return {
      from,
      to,
      points: balanceHistory(rows, snapshots, from, to),
      statements: snapshots.filter((s) => s.date >= from && s.date <= to),
      gaps: storedContinuityGaps(
        rows.flatMap((row) =>
          row.manual || row.date > to
            ? []
            : [
                {
                  bookingDate: row.date,
                  amountCents: row.amountCents,
                  balanceAfterCents: row.balanceAfterCents,
                },
              ],
        ),
        from,
      ),
      dataUntil: until,
      lastImportOn,
    }
  }

  /**
   * Money in and out of the account over a month, transfers between the
   * owner's accounts and hand-entered rows included (they move the balance),
   * with the transfers apart. Bank values, like the balance.
   */
  async monthFlows(
    id: string,
    month: string | undefined,
    now: Date = new Date(),
  ): Promise<AccountMonthFlowsDto> {
    await this.cashAccount(id)
    const period = await resolvePeriod(this.db, month, { accountId: id, now })
    const t = transactionsTable
    const transfer = sql`${t.kind} = 'transfer'`
    const [row] = await this.db
      .select({
        inCents: sql<
          string | null
        >`sum(${bankAmountCents}) filter (where ${bankAmountCents} > 0)`,
        outCents: sql<
          string | null
        >`sum(${bankAmountCents}) filter (where ${bankAmountCents} < 0)`,
        transfersInCents: sql<
          string | null
        >`sum(${bankAmountCents}) filter (where ${bankAmountCents} > 0 and ${transfer})`,
        transfersOutCents: sql<
          string | null
        >`sum(${bankAmountCents}) filter (where ${bankAmountCents} < 0 and ${transfer})`,
        count: sql<number>`count(*)::int`,
      })
      .from(t)
      .where(
        and(
          eq(t.accountId, id),
          gte(bankBookingDate, `${period.month}-01`),
          lte(bankBookingDate, monthEnd(period.month)),
        ),
      )
    const inCents = toCents(row?.inCents ?? null)
    const outCents = toCents(row?.outCents ?? null)
    return {
      period,
      inCents,
      outCents,
      netCents: inCents + outCents,
      transfersInCents: toCents(row?.transfersInCents ?? null),
      transfersOutCents: toCents(row?.transfersOutCents ?? null),
      count: row?.count ?? 0,
    }
  }
}
