import { Injectable, NotFoundException } from '@nestjs/common'
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  max,
  type SQL,
  sql,
} from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  balanceSnapshotsTable,
  type InsertAccount,
  INVESTMENT_ACCOUNT_TYPES,
  type SelectAccount,
  TRANSACTIONAL_ACCOUNT_TYPES,
  transactionsTable,
} from '#/database/schema'
import { endOfDayBalance } from '#/imports/dedupe/continuity'
import type { CreateAccountDto, UpdateAccountDto } from './dto/account.dto'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** The database or an open transaction. */
type Executor = Db | Tx

export interface AccountBalance {
  balanceCents: number | null
  balanceDate: string | null
}

export type AccountWithBalance = SelectAccount & AccountBalance

const NO_BALANCE: AccountBalance = { balanceCents: null, balanceDate: null }

export function isTransactionalAccount(account: Pick<SelectAccount, 'type'>) {
  return (TRANSACTIONAL_ACCOUNT_TYPES as readonly string[]).includes(
    account.type,
  )
}

/** Sums come back from Postgres as `numeric` strings. */
function toCents(value: string | number | null): number | null {
  if (value === null) return null
  const cents = Number(value)
  if (!Number.isSafeInteger(cents)) throw new RangeError('Balance overflow')
  return cents
}

@Injectable()
export class AccountsService {
  constructor(private readonly database: DatabaseService) {}

  private get db(): Db {
    return this.database.db
  }

  /**
   * Accounts by `position`, with their current balance, or their balance at
   * the end of the calendar day `asOf` (`YYYY-MM-DD`): the same computation
   * restricted to the transactions and snapshots dated on or before it.
   */
  async list(
    {
      includeArchived = false,
      asOf,
    }: { includeArchived?: boolean; asOf?: string } = {},
    executor: Executor = this.db,
  ): Promise<AccountWithBalance[]> {
    const accounts = await executor
      .select()
      .from(accountsTable)
      .where(includeArchived ? undefined : isNull(accountsTable.archivedAt))
      .orderBy(
        asc(accountsTable.position),
        asc(accountsTable.createdAt),
        asc(accountsTable.id),
      )
    const balances = await this.loadBalances(executor, accounts, asOf)
    return accounts.map((account) => ({
      ...account,
      ...(balances.get(account.id) ?? NO_BALANCE),
    }))
  }

  async findOne(
    id: string,
    executor: Executor = this.db,
  ): Promise<AccountWithBalance> {
    const [account] = await executor
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.id, id))
      .limit(1)
    if (!account) throw new NotFoundException('Account not found')
    const balances = await this.loadBalances(executor, [account])
    return { ...account, ...(balances.get(account.id) ?? NO_BALANCE) }
  }

  /** Appends the account at the end of the display order. */
  create(dto: CreateAccountDto): Promise<AccountWithBalance> {
    return this.db.transaction(async (tx) => {
      const [{ last }] = await tx
        .select({ last: max(accountsTable.position) })
        .from(accountsTable)
      const [account] = await tx
        .insert(accountsTable)
        .values({
          name: dto.name,
          type: dto.type,
          institution: dto.institution ?? null,
          position: (last ?? -1) + 1,
        })
        .returning()
      return { ...account, ...NO_BALANCE }
    })
  }

  update(id: string, dto: UpdateAccountDto): Promise<AccountWithBalance> {
    return this.db.transaction(async (tx) => {
      const existing = await this.findOne(id, tx)
      const changes: Partial<InsertAccount> = {}
      if (dto.name !== undefined) changes.name = dto.name
      if (dto.institution !== undefined) changes.institution = dto.institution
      if (dto.position !== undefined) changes.position = dto.position
      if (dto.archived !== undefined) {
        // Keep the original archive date when archiving twice.
        changes.archivedAt = dto.archived
          ? (existing.archivedAt ?? new Date())
          : null
      }
      if (Object.keys(changes).length === 0) return existing

      await tx
        .update(accountsTable)
        .set(changes)
        .where(eq(accountsTable.id, id))
      return this.findOne(id, tx)
    })
  }

  /**
   * Current balance of each account, in four queries whatever the number of
   * accounts:
   *
   * - transactional accounts: the most recent of two end-of-day anchors, plus
   *   the amounts booked after its day:
   *   - the running balance of the latest day that has balances
   *     (`endOfDayBalance`, which tells the last row of a day in any order and
   *     returns null when the balances do not chain);
   *   - the latest balance snapshot (statement closing balance, e.g. from the
   *     spreadsheet history, whose rows carry no running balance). It wins a
   *     tie with the running balance.
   *   Without either, the sum of all amounts;
   * - investment accounts: the latest value snapshot.
   *
   * Expenses noted by hand (`manual`) are left out: until the import replaces
   * them, the balance is the bank's, dated by the bank's data.
   *
   * With `asOf`, every query only sees the transactions and snapshots dated
   * on or before that day, so the result is the balance at the end of it
   * (e.g. a month-end net worth): the same anchors as of that day.
   */
  private async loadBalances(
    executor: Executor,
    accounts: Pick<SelectAccount, 'id' | 'type'>[],
    asOf?: string,
  ): Promise<Map<string, AccountBalance>> {
    const balances = new Map<string, AccountBalance>()
    const transactionalIds = accounts
      .filter(isTransactionalAccount)
      .map((a) => a.id)
    const investmentIds = accounts
      .filter((a) =>
        (INVESTMENT_ACCOUNT_TYPES as readonly string[]).includes(a.type),
      )
      .map((a) => a.id)

    const s = balanceSnapshotsTable
    const t = transactionsTable
    const snapshotUntil: SQL | undefined =
      asOf === undefined ? undefined : lte(s.date, asOf)
    const bookedUntil: SQL | undefined =
      asOf === undefined ? undefined : lte(t.bookingDate, asOf)
    const accountIds = [...transactionalIds, ...investmentIds]
    const latestSnapshots =
      accountIds.length === 0
        ? []
        : await executor
            .selectDistinctOn([s.accountId], {
              accountId: s.accountId,
              date: s.date,
              valueCents: s.valueCents,
            })
            .from(s)
            .where(and(inArray(s.accountId, accountIds), snapshotUntil))
            .orderBy(s.accountId, desc(s.date))
    const snapshotByAccount = new Map(
      latestSnapshots.map((snapshot) => [snapshot.accountId, snapshot]),
    )

    if (transactionalIds.length > 0) {
      const latest = executor.$with('latest').as(
        executor
          .select({
            accountId: t.accountId,
            day: max(t.bookingDate).as('day'),
          })
          .from(t)
          .where(
            and(
              inArray(t.accountId, transactionalIds),
              isNotNull(t.balanceAfterCents),
              bookedUntil,
            ),
          )
          .groupBy(t.accountId),
      )
      const snap = executor.$with('snap').as(
        executor
          .selectDistinctOn([s.accountId], {
            accountId: s.accountId,
            day: sql<string>`${s.date}`.as('snap_day'),
          })
          .from(s)
          .where(and(inArray(s.accountId, transactionalIds), snapshotUntil))
          .orderBy(s.accountId, desc(s.date)),
      )

      const [lastDayRows, totals] = await Promise.all([
        executor
          .with(latest)
          .select({
            accountId: t.accountId,
            day: t.bookingDate,
            amountCents: t.amountCents,
            balanceAfterCents: t.balanceAfterCents,
          })
          .from(t)
          .innerJoin(
            latest,
            and(
              eq(latest.accountId, t.accountId),
              eq(latest.day, t.bookingDate),
            ),
          )
          .where(isNotNull(t.balanceAfterCents)),
        executor
          .with(latest, snap)
          .select({
            accountId: t.accountId,
            lastDay: max(t.bookingDate),
            total: sql<string>`sum(${t.amountCents})`,
            afterLatest: sql<
              string | null
            >`sum(${t.amountCents}) filter (where ${gt(t.bookingDate, latest.day)})`,
            latestDay: sql<string | null>`max(${latest.day})`,
            afterSnapshot: sql<
              string | null
            >`sum(${t.amountCents}) filter (where ${gt(t.bookingDate, snap.day)})`,
          })
          .from(t)
          .leftJoin(latest, eq(latest.accountId, t.accountId))
          .leftJoin(snap, eq(snap.accountId, t.accountId))
          .where(
            and(
              inArray(t.accountId, transactionalIds),
              // Expenses noted by hand are not bank data yet: the balance
              // and its date are the bank's.
              eq(t.manual, false),
              bookedUntil,
            ),
          )
          .groupBy(t.accountId),
      ])

      const dayRows = new Map<
        string,
        { amountCents: number; balanceAfterCents: number }[]
      >()
      for (const row of lastDayRows) {
        if (row.balanceAfterCents === null) continue
        const list = dayRows.get(row.accountId) ?? []
        list.push({
          amountCents: row.amountCents,
          balanceAfterCents: row.balanceAfterCents,
        })
        dayRows.set(row.accountId, list)
      }

      for (const row of totals) {
        const rows = dayRows.get(row.accountId)
        const hasRunning = row.latestDay !== null && rows !== undefined
        const snapshot = snapshotByAccount.get(row.accountId)
        if (
          snapshot &&
          (!hasRunning || snapshot.date >= (row.latestDay as string))
        ) {
          balances.set(row.accountId, {
            balanceCents:
              snapshot.valueCents + (toCents(row.afterSnapshot) ?? 0),
            balanceDate:
              row.lastDay !== null && row.lastDay > snapshot.date
                ? row.lastDay
                : snapshot.date,
          })
          continue
        }
        if (!hasRunning) {
          balances.set(row.accountId, {
            balanceCents: toCents(row.total),
            balanceDate: row.lastDay,
          })
          continue
        }
        const endOfDay = endOfDayBalance(rows)
        balances.set(
          row.accountId,
          endOfDay === null
            ? NO_BALANCE
            : {
                balanceCents: endOfDay + (toCents(row.afterLatest) ?? 0),
                balanceDate: row.lastDay,
              },
        )
      }
    }

    // Investment accounts, and transactional accounts with snapshots but no
    // transactions yet: the latest snapshot as is.
    for (const snapshot of latestSnapshots) {
      if (balances.has(snapshot.accountId)) continue
      balances.set(snapshot.accountId, {
        balanceCents: snapshot.valueCents,
        balanceDate: snapshot.date,
      })
    }

    return balances
  }
}
