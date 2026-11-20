import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { and, asc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import {
  AccountsService,
  type AccountWithBalance,
} from '#/accounts/accounts.service'
import { CryptoService } from '#/crypto/crypto.service'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  balanceSnapshotsTable,
  cryptoHoldingsTable,
  INVESTMENT_ACCOUNT_TYPES,
  type SelectBalanceSnapshot,
  transactionsTable,
} from '#/database/schema'
import type { AccountType } from '#/database/schema/domain-enums'
import { loadReceivedCoinFlows } from './crypto-flows'
import { parisToday } from './days'
import type {
  AccountPerformanceDto,
  BulkSnapshotRowDto,
  BulkSnapshotsResultDto,
  InvestedBasePreviewDto,
  InvestedFiguresDto,
  InvestmentFlowsDto,
  InvestmentsSummaryDto,
  SetInvestedBaseDto,
  SnapshotDto,
  UpsertSnapshotDto,
} from './dto/snapshot.dto'
import {
  computePerformance,
  investedAt,
  type InvestedBase,
  investedBaseOf,
  takesInvestedBase,
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
  source: s.source,
  contributionsCents: s.contributionsCents,
  note: s.note,
}

function toDto(
  snapshot: Pick<
    SelectBalanceSnapshot,
    'id' | 'date' | 'valueCents' | 'contributionsCents' | 'note' | 'source'
  >,
): SnapshotDto {
  return {
    id: snapshot.id,
    date: snapshot.date,
    valueCents: snapshot.valueCents,
    contributionsCents: snapshot.contributionsCents,
    note: snapshot.note,
    source: snapshot.source,
  }
}

/** A crypto account's value is computed from its holdings, never typed (#366). */
export const COMPUTED_VALUE_MESSAGE =
  'A crypto account’s values are computed from its holdings and prices'

/**
 * Dated value snapshots of an account (statements of investment accounts,
 * closing balances of transactional ones) and the performance figures derived
 * from them. Balances and net worth read the same table through
 * `AccountsService`, so a snapshot written here shows up there at once.
 */
@Injectable()
export class InvestmentsService {
  // Explicit tokens: the spec generator runs without decorator metadata.
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AccountsService) private readonly accounts: AccountsService,
    /** Today's live value of crypto accounts (#366); absent in some specs. */
    @Optional()
    @Inject(CryptoService)
    private readonly crypto?: CryptoService,
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
    await this.typedAccount(accountId)
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
        set: { ...values, source: 'typed', updatedAt: now },
        // A computed point is never replaced by hand.
        setWhere: eq(s.source, 'typed'),
      })
      .returning(SNAPSHOT_COLUMNS)
    if (!snapshot) throw new BadRequestException(COMPUTED_VALUE_MESSAGE)
    return toDto(snapshot)
  }

  async remove(accountId: string, date: string): Promise<void> {
    await this.writableAccount(accountId)
    const [existing] = await this.db
      .select({ source: s.source })
      .from(s)
      .where(and(eq(s.accountId, accountId), eq(s.date, date)))
    if (!existing) throw new NotFoundException('No snapshot on that date')
    if (existing.source === 'computed') {
      throw new BadRequestException(COMPUTED_VALUE_MESSAGE)
    }
    await this.db
      .delete(s)
      .where(
        and(
          eq(s.accountId, accountId),
          eq(s.date, date),
          eq(s.source, 'typed'),
        ),
      )
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
      await this.typedAccount(accountId, tx)
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
          setWhere: eq(s.source, 'typed'),
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
    const [stored, flows, live] = await Promise.all([
      this.snapshotsOf(this.db, accountId),
      this.linkedFlows(this.db, [account]),
      account.type === 'crypto' && this.crypto
        ? this.crypto.liveValue(accountId, now)
        : Promise.resolve(null),
    ])
    // A crypto account's last point is today's live value (#366), in place
    // of a value stored today before the daily close.
    const snapshots = live
      ? stored.filter((point) => point.date < live.date)
      : stored
    const series: SnapshotDto[] = live
      ? [...snapshots, { id: '', note: null, source: 'computed', ...live }]
      : snapshots
    const accountFlows = flows.get(accountId) ?? []
    const base = investedBaseOf(account)
    const history =
      linkedContributions(series, accountFlows, account.type, base) ?? series
    return {
      accountId,
      type: account.type,
      ...computePerformance(
        series,
        account.type,
        parisToday(now),
        accountFlows,
        base,
      ),
      investedBase: base && { amountCents: base.cents, on: base.on },
      snapshots,
      live,
      contributionsHistory: history.map((point) => ({
        date: point.date,
        contributionsCents: point.contributionsCents,
      })),
    }
  }

  /**
   * What an account's invested amount, gain and rate are now and would be
   * with `dto` as its invested base (#358, #360). Saves nothing.
   */
  async previewInvestedBase(
    accountId: string,
    dto: SetInvestedBaseDto,
    now: Date = new Date(),
  ): Promise<InvestedBasePreviewDto> {
    const today = parisToday(now)
    assertNotFuture([dto.on], now)
    const account = await this.baseAccount(accountId, this.db)
    const [snapshots, flows] = await Promise.all([
      this.snapshotsOf(this.db, accountId),
      this.linkedFlows(this.db, [account]),
    ])
    const accountFlows = flows.get(accountId) ?? []
    return {
      current: investedFigures(
        account.type,
        snapshots,
        accountFlows,
        investedBaseOf(account),
        today,
      ),
      next: investedFigures(
        account.type,
        snapshots,
        accountFlows,
        { cents: dto.amountCents, on: dto.on },
        today,
      ),
    }
  }

  /**
   * Sets an account's invested base (#358, #360). A crypto account's
   * snapshots from its day (or the previous base's, the earlier) get the
   * invested amount as their contributions, so the history follows; a PEA's
   * keep what was typed on them, the base winning from its day in the
   * figures.
   */
  async setInvestedBase(
    accountId: string,
    dto: SetInvestedBaseDto,
    now: Date = new Date(),
  ): Promise<InvestedFiguresDto> {
    assertNotFuture([dto.on], now)
    return this.writeInvestedBase(
      accountId,
      { cents: dto.amountCents, on: dto.on },
      now,
    )
  }

  /** Removes the invested base: the coins linked to it, or its holdings, count again. */
  clearInvestedBase(
    accountId: string,
    now: Date = new Date(),
  ): Promise<InvestedFiguresDto> {
    return this.writeInvestedBase(accountId, null, now)
  }

  private async writeInvestedBase(
    accountId: string,
    base: InvestedBase | null,
    now: Date,
  ): Promise<InvestedFiguresDto> {
    const today = parisToday(now)
    return this.db.transaction(async (tx) => {
      const account = await this.baseAccount(accountId, tx)
      const previous = investedBaseOf(account)
      await tx
        .update(accountsTable)
        .set({
          investedBaseCents: base?.cents ?? null,
          investedBaseOn: base?.on ?? null,
          updatedAt: now,
        })
        .where(eq(accountsTable.id, accountId))
      const flows = (await this.linkedFlows(tx, [account])).get(accountId) ?? []
      const from = [previous?.on, base?.on]
        .filter((day): day is string => day !== undefined)
        .sort()[0]
      if (from !== undefined && account.type === 'crypto') {
        // Without a base, a manual account's snapshots get its holdings'
        // invested amounts back, as its valuation writes them.
        const holdingsCents =
          base === null ? await this.holdingsInvested(tx, accountId) : null
        const rewritten = await tx
          .select({ id: s.id, date: s.date })
          .from(s)
          .where(and(eq(s.accountId, accountId), gte(s.date, from)))
        for (const row of rewritten) {
          const contributionsCents =
            investedAt(base, flows, row.date)?.investedCents ?? holdingsCents
          await tx
            .update(s)
            .set({ contributionsCents, updatedAt: now })
            .where(eq(s.id, row.id))
        }
      }
      const snapshots = await this.snapshotsOf(tx, accountId)
      return investedFigures(account.type, snapshots, flows, base, today)
    })
  }

  /** Sum of the holdings' invested amounts, when every line has one. */
  private async holdingsInvested(
    executor: Executor,
    accountId: string,
  ): Promise<number | null> {
    const rows = await executor
      .select({ investedCents: cryptoHoldingsTable.investedCents })
      .from(cryptoHoldingsTable)
      .where(eq(cryptoHoldingsTable.accountId, accountId))
    if (rows.length === 0 || rows.some((row) => row.investedCents === null)) {
      return null
    }
    return rows.reduce((sum, row) => sum + row.investedCents!, 0)
  }

  /**
   * A writable account that takes an invested base: an investment account
   * other than an exchange, whose holdings carry their cost.
   */
  private async baseAccount(
    accountId: string,
    executor: Executor,
  ): Promise<AccountWithBalance> {
    const account = await this.writableAccount(accountId, executor)
    if (!takesInvestedBase(account)) {
      throw new BadRequestException(
        'Only investment accounts other than exchanges take an invested base',
      )
    }
    return account
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
        investedBaseOf(account),
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
   * an exchange (null when unknown: left out and counted, #358).
   */
  private async linkedFlows(
    executor: Executor,
    accounts: readonly { id: string; type: AccountType }[],
  ): Promise<Map<string, LinkedFlow[]>> {
    const accountIds = accounts
      .filter((account) => account.type !== 'crypto')
      .map((account) => account.id)
    const cryptoIds = accounts
      .filter((account) => account.type === 'crypto')
      .map((account) => account.id)
    const byAccount = await loadReceivedCoinFlows(executor, cryptoIds)
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

  /**
   * A writable account whose values are typed: never a crypto account,
   * whose values are computed (#366).
   */
  private async typedAccount(
    accountId: string,
    executor: Executor = this.db,
  ): Promise<AccountWithBalance> {
    const account = await this.writableAccount(accountId, executor)
    if (account.type === 'crypto') {
      throw new BadRequestException(COMPUTED_VALUE_MESSAGE)
    }
    return account
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

/** The invested figures of an account with `base`. */
function investedFigures(
  type: AccountType,
  snapshots: readonly SnapshotDto[],
  flows: readonly LinkedFlow[],
  base: InvestedBase | null,
  today: string,
): InvestedFiguresDto {
  const figures = computePerformance(snapshots, type, today, flows, base)
  return {
    investedBase: base && { amountCents: base.cents, on: base.on },
    valueCents: figures.valueCents,
    valueDate: figures.valueDate,
    contributionsCents: figures.contributionsCents,
    contributionsSource: figures.contributionsSource,
    gainCents: figures.gainCents,
    returnRate: figures.returnRate,
    linkedTransfersCount: figures.linkedTransfersCount,
    unknownCostCount: figures.unknownCostCount,
  }
}

function assertNotFuture(dates: string[], now: Date) {
  const today = parisToday(now)
  const future = dates.find((date) => date > today)
  if (future !== undefined) {
    throw new BadRequestException(`Date ${future} is in the future`)
  }
}
