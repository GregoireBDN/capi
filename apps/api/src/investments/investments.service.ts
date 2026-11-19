import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import {
  AccountsService,
  type AccountWithBalance,
} from '#/accounts/accounts.service'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  balanceSnapshotsTable,
  INVESTMENT_ACCOUNT_TYPES,
  cryptoMovementsTable,
  type SelectBalanceSnapshot,
  transactionsTable,
} from '#/database/schema'
import type { AccountType } from '#/database/schema/domain-enums'
import { parisToday } from './days'
import type {
  AccountPerformanceDto,
  BulkSnapshotRowDto,
  BulkSnapshotsResultDto,
  InvestmentFlowsDto,
  InvestmentsSummaryDto,
  SnapshotDto,
  UpsertSnapshotDto,
} from './dto/snapshot.dto'
import {
  computePerformance,
  type LinkedFlow,
  linkedContributions,
  simpleReturn,
} from './performance'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx

const s = balanceSnapshotsTable

const SNAPSHOT_COLUMNS = {
  id: s.id,
  accountId: s.accountId,
  date: s.date,
  valueCents: s.valueCents,
  contributionsCents: s.contributionsCents,
  note: s.note,
}

function toDto(
  snapshot: Pick<
    SelectBalanceSnapshot,
    'id' | 'date' | 'valueCents' | 'contributionsCents' | 'note'
  >,
): SnapshotDto {
  return {
    id: snapshot.id,
    date: snapshot.date,
    valueCents: snapshot.valueCents,
    contributionsCents: snapshot.contributionsCents,
    note: snapshot.note,
  }
}

/**
 * Dated value snapshots of an account (statements of investment accounts,
 * closing balances of transactional ones) and the performance figures derived
 * from them. Balances and net worth read the same table through
 * `AccountsService`, so a snapshot written here shows up there at once.
 */
@Injectable()
export class InvestmentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly accounts: AccountsService,
  ) {}

  private get db(): Db {
    return this.database.db
  }

  /** Snapshots of an account, oldest first. 404 for an unknown account. */
  async list(accountId: string): Promise<SnapshotDto[]> {
    await this.accounts.findOne(accountId, this.db)
    return this.snapshotsOf(this.db, accountId)
  }

  /** Creates or replaces the snapshot of `date`. */
  async upsert(
    accountId: string,
    date: string,
    dto: UpsertSnapshotDto,
    now: Date = new Date(),
  ): Promise<SnapshotDto> {
    await this.writableAccount(accountId)
    assertNotFuture([date], now)
    const values = {
      valueCents: dto.valueCents,
      contributionsCents: dto.contributionsCents ?? null,
      note: dto.note ?? null,
    }
    const [snapshot] = await this.db
      .insert(s)
      .values({ accountId, date, ...values })
      .onConflictDoUpdate({
        target: [s.accountId, s.date],
        set: { ...values, updatedAt: now },
      })
      .returning(SNAPSHOT_COLUMNS)
    return toDto(snapshot)
  }

  async remove(accountId: string, date: string): Promise<void> {
    await this.writableAccount(accountId)
    const deleted = await this.db
      .delete(s)
      .where(and(eq(s.accountId, accountId), eq(s.date, date)))
      .returning({ id: s.id })
    if (deleted.length === 0) {
      throw new NotFoundException('No snapshot on that date')
    }
  }

  /**
   * Upserts a statement history in one transaction. An existing day gets the
   * new value; its contributions are only replaced when the row has some, and
   * its note is kept.
   */
  async bulkUpsert(
    accountId: string,
    rows: BulkSnapshotRowDto[],
    now: Date = new Date(),
  ): Promise<BulkSnapshotsResultDto> {
    const dates = rows.map((row) => row.date)
    const duplicate = dates.find((date, i) => dates.indexOf(date) !== i)
    if (duplicate !== undefined) {
      throw new BadRequestException(`Duplicate date ${duplicate}`)
    }
    assertNotFuture(dates, now)

    return this.db.transaction(async (tx) => {
      await this.writableAccount(accountId, tx)
      const written = await tx
        .insert(s)
        .values(
          rows.map((row) => ({
            accountId,
            date: row.date,
            valueCents: row.valueCents,
            contributionsCents: row.contributionsCents ?? null,
          })),
        )
        .onConflictDoUpdate({
          target: [s.accountId, s.date],
          set: {
            valueCents: sql`excluded.value_cents`,
            contributionsCents: sql`coalesce(excluded.contributions_cents, ${s.contributionsCents})`,
            updatedAt: now,
          },
        })
        // `xmax` is 0 on a freshly inserted row version.
        .returning({ inserted: sql<boolean>`(xmax = 0)` })
      const created = written.filter((row) => row.inserted).length
      return { created, updated: written.length - created }
    })
  }

  async performance(
    accountId: string,
    now: Date = new Date(),
  ): Promise<AccountPerformanceDto> {
    const account = await this.accounts.findOne(accountId, this.db)
    const [snapshots, flows] = await Promise.all([
      this.snapshotsOf(this.db, accountId),
      this.linkedFlows(this.db, [account]),
    ])
    const accountFlows = flows.get(accountId) ?? []
    const history =
      linkedContributions(snapshots, accountFlows, account.type) ?? snapshots
    return {
      accountId,
      type: account.type,
      ...computePerformance(
        snapshots,
        account.type,
        parisToday(now),
        accountFlows,
      ),
      snapshots,
      contributionsHistory: history.map((point) => ({
        date: point.date,
        contributionsCents: point.contributionsCents,
      })),
    }
  }

  /** Totals and per-account figures over the non-archived investment accounts. */
  async summary(now: Date = new Date()): Promise<InvestmentsSummaryDto> {
    const today = parisToday(now)
    const accounts = await this.db
      .select()
      .from(accountsTable)
      .where(
        and(
          isNull(accountsTable.archivedAt),
          inArray(accountsTable.type, [...INVESTMENT_ACCOUNT_TYPES]),
        ),
      )
      .orderBy(
        asc(accountsTable.position),
        asc(accountsTable.createdAt),
        asc(accountsTable.id),
      )
    const snapshots =
      accounts.length === 0
        ? []
        : await this.db
            .select(SNAPSHOT_COLUMNS)
            .from(s)
            .where(
              inArray(
                s.accountId,
                accounts.map((account) => account.id),
              ),
            )
            .orderBy(asc(s.date))
    const flows = await this.linkedFlows(this.db, accounts)
    const byAccount = new Map<string, typeof snapshots>()
    for (const snapshot of snapshots) {
      const list = byAccount.get(snapshot.accountId) ?? []
      list.push(snapshot)
      byAccount.set(snapshot.accountId, list)
    }

    let valueCents = 0
    let contributionsCents: number | null = null
    let gainCents: number | null = null
    let withoutContributionsCount = 0
    let withoutValueCount = 0
    let staleCount = 0
    const rows = accounts.map((account) => {
      const figures = computePerformance(
        byAccount.get(account.id) ?? [],
        account.type,
        today,
        flows.get(account.id) ?? [],
      )
      if (figures.valueCents === null) withoutValueCount++
      else {
        valueCents += figures.valueCents
        if (figures.contributionsCents === null) withoutContributionsCount++
        else {
          contributionsCents =
            (contributionsCents ?? 0) + figures.contributionsCents
          gainCents = (gainCents ?? 0) + figures.gainCents!
        }
      }
      if (figures.stale) staleCount++
      // The changes are only shown on the account page.
      const { sincePrevious: _previous, sinceOneYear: _year, ...rest } = figures
      return {
        id: account.id,
        name: account.name,
        type: account.type,
        institution: account.institution,
        ...rest,
      }
    })

    return {
      totals: {
        valueCents,
        contributionsCents,
        gainCents,
        returnRate: simpleReturn(gainCents, contributionsCents),
        withoutContributionsCount,
        withoutValueCount,
        staleCount,
      },
      accounts: rows,
    }
  }

  /**
   * Where the invested money went (#296): the transfers linked to the
   * investment accounts booked from `from` to `to`, per account and per
   * month. Archived accounts count too: the money did go there.
   */
  async flows(from: string, to: string): Promise<InvestmentFlowsDto> {
    const t = transactionsTable
    const rows = await this.db
      .select({
        accountId: accountsTable.id,
        name: accountsTable.name,
        type: accountsTable.type,
        position: accountsTable.position,
        bookingDate: t.bookingDate,
        amountCents: t.amountCents,
      })
      .from(t)
      .innerJoin(accountsTable, eq(accountsTable.id, t.counterpartAccountId))
      .where(
        and(
          eq(t.kind, 'transfer'),
          ne(t.accountId, t.counterpartAccountId),
          inArray(accountsTable.type, [...INVESTMENT_ACCOUNT_TYPES]),
          gte(t.bookingDate, from),
          lte(t.bookingDate, to),
        ),
      )
    const accounts = new Map<
      string,
      InvestmentFlowsDto['accounts'][number] & { position: number }
    >()
    const months = new Map<string, Map<string, number>>()
    let depositsCents = 0
    let withdrawalsCents = 0
    for (const row of rows) {
      // Money leaving the bank account goes into the investment one.
      const cents = -row.amountCents
      let account = accounts.get(row.accountId)
      if (!account) {
        account = {
          accountId: row.accountId,
          name: row.name,
          type: row.type,
          position: row.position,
          depositsCents: 0,
          withdrawalsCents: 0,
          netCents: 0,
          count: 0,
        }
        accounts.set(row.accountId, account)
      }
      if (cents >= 0) {
        account.depositsCents += cents
        depositsCents += cents
      } else {
        account.withdrawalsCents -= cents
        withdrawalsCents -= cents
      }
      account.netCents += cents
      account.count++
      const month = row.bookingDate.slice(0, 7)
      const perAccount = months.get(month) ?? new Map<string, number>()
      perAccount.set(
        row.accountId,
        (perAccount.get(row.accountId) ?? 0) + cents,
      )
      months.set(month, perAccount)
    }
    return {
      from,
      to,
      depositsCents,
      withdrawalsCents,
      netCents: depositsCents - withdrawalsCents,
      accounts: [...accounts.values()]
        .sort(
          (a, b) =>
            b.depositsCents - a.depositsCents ||
            a.position - b.position ||
            a.accountId.localeCompare(b.accountId),
        )
        .map(({ position: _position, ...account }) => account),
      months: [...months.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([month, perAccount]) => ({
          month,
          netCents: [...perAccount.values()].reduce((sum, c) => sum + c, 0),
          accounts: [...perAccount.entries()].map(([accountId, netCents]) => ({
            accountId,
            netCents,
          })),
        })),
    }
  }

  /**
   * What makes each account's contributions (#296), oldest first: money
   * paid into (positive) or taken out of it by the bank transfers linked to
   * it, or, for a crypto account, the cost of the coins withdrawn to it from
   * an exchange (none when one of those costs is unknown: the invested
   * amount would be wrong).
   */
  private async linkedFlows(
    executor: Executor,
    accounts: readonly { id: string; type: AccountType }[],
  ): Promise<Map<string, LinkedFlow[]>> {
    const byAccount = new Map<string, LinkedFlow[]>()
    const accountIds = accounts
      .filter((account) => account.type !== 'crypto')
      .map((account) => account.id)
    const cryptoIds = accounts
      .filter((account) => account.type === 'crypto')
      .map((account) => account.id)
    if (cryptoIds.length > 0) {
      const cm = cryptoMovementsTable
      const received = await executor
        .select({
          accountId: cm.counterpartAccountId,
          occurredAt: cm.occurredAt,
          costCents: cm.costCents,
        })
        .from(cm)
        .where(
          and(
            inArray(cm.counterpartAccountId, cryptoIds),
            eq(cm.kind, 'withdrawal'),
            ne(cm.accountId, cm.counterpartAccountId),
          ),
        )
        .orderBy(asc(cm.occurredAt), asc(cm.id))
      const unknown = new Set<string>()
      for (const row of received) {
        if (row.costCents === null) unknown.add(row.accountId!)
        const list = byAccount.get(row.accountId!) ?? []
        list.push({
          date: parisToday(row.occurredAt),
          amountCents: row.costCents ?? 0,
        })
        byAccount.set(row.accountId!, list)
      }
      for (const id of unknown) byAccount.delete(id)
    }
    if (accountIds.length === 0) return byAccount
    const t = transactionsTable
    const rows = await executor
      .select({
        accountId: t.counterpartAccountId,
        date: t.bookingDate,
        amountCents: t.amountCents,
      })
      .from(t)
      .where(
        and(
          inArray(t.counterpartAccountId, accountIds),
          eq(t.kind, 'transfer'),
          ne(t.accountId, t.counterpartAccountId),
        ),
      )
      .orderBy(asc(t.bookingDate), asc(t.id))
    for (const row of rows) {
      const list = byAccount.get(row.accountId!) ?? []
      list.push({ date: row.date, amountCents: -row.amountCents })
      byAccount.set(row.accountId!, list)
    }
    return byAccount
  }

  private async snapshotsOf(
    executor: Executor,
    accountId: string,
  ): Promise<SnapshotDto[]> {
    const rows = await executor
      .select(SNAPSHOT_COLUMNS)
      .from(s)
      .where(eq(s.accountId, accountId))
      .orderBy(asc(s.date))
    return rows.map(toDto)
  }

  /** The account, refused when it is archived (its history is frozen). */
  private async writableAccount(
    accountId: string,
    executor: Executor = this.db,
  ): Promise<AccountWithBalance> {
    const account = await this.accounts.findOne(accountId, executor)
    if (account.archivedAt) {
      throw new BadRequestException('Cannot change an archived account')
    }
    return account
  }
}

function assertNotFuture(dates: string[], now: Date) {
  const today = parisToday(now)
  const future = dates.find((date) => date > today)
  if (future !== undefined) {
    throw new BadRequestException(`Date ${future} is in the future`)
  }
}
