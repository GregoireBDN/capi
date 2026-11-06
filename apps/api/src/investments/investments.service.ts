import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
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
  type SelectBalanceSnapshot,
} from '#/database/schema'
import { parisToday } from './days'
import type {
  AccountPerformanceDto,
  BulkSnapshotRowDto,
  BulkSnapshotsResultDto,
  InvestmentsSummaryDto,
  SnapshotDto,
  UpsertSnapshotDto,
} from './dto/snapshot.dto'
import { computePerformance, simpleReturn } from './performance'

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
    const snapshots = await this.snapshotsOf(this.db, accountId)
    return {
      accountId,
      type: account.type,
      ...computePerformance(snapshots, account.type, parisToday(now)),
      snapshots,
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
