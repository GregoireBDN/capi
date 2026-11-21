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
import {
  CryptoCostBasisService,
  cryptoInvestedOn,
  type LoadedCostBasis,
} from '#/crypto/cost-basis.service'
import { CryptoService, realisedGains } from '#/crypto/crypto.service'
import type { AccountHoldingsDto } from '#/crypto/dto/crypto.dto'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  balanceSnapshotsTable,
  INVESTMENT_ACCOUNT_TYPES,
  type SelectBalanceSnapshot,
  transactionsTable,
} from '#/database/schema'
import type { AccountType } from '#/database/schema/domain-enums'
import {
  loadStatements,
  revalue,
  type StoredStatement,
} from '#/positions/positions.repository'
import { takesPositions } from '#/positions/positions.service'
import { linesInvestedOn, type Statement } from '#/positions/valuation'
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
  type InvestedBase,
  investedBaseOf,
  type InvestedOn,
  investedOn,
  type LinkedFlow,
  orElse,
  type Performance,
  simpleReturn,
  takesInvestedBase,
  withInvested,
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

/** A PEA's value computed from its lines is replaced, never deleted (ADR 0006). */
export const LINES_VALUE_MESSAGE =
  'This value is computed from the account’s lines: type a value of that day to replace it'

/**
 * Dated value snapshots of an account (statements of investment accounts,
 * closing balances of transactional ones) and the performance figures derived
 * from them. Balances and net worth read the same table through
 * `AccountsService`, so a snapshot written here shows up there at once.
 */
@Injectable()
export class InvestmentsService {
  // Explicit tokens: the spec generator runs without decorator metadata.
  private readonly costBasis: CryptoCostBasisService

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AccountsService) private readonly accounts: AccountsService,
    /** Today's live value of crypto accounts (#366); absent in some specs. */
    @Optional()
    @Inject(CryptoService)
    private readonly crypto?: CryptoService,
    @Optional()
    @Inject(CryptoCostBasisService)
    costBasis?: CryptoCostBasisService,
  ) {
    this.costBasis = costBasis ?? new CryptoCostBasisService(database)
  }

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
        // A typed value wins its day over a PEA's computed one (ADR 0006);
        // crypto accounts were refused above.
        set: { ...values, source: 'typed', updatedAt: now },
      })
      .returning(SNAPSHOT_COLUMNS)
    return toDto(snapshot)
  }

  async remove(
    accountId: string,
    date: string,
    now: Date = new Date(),
  ): Promise<void> {
    const account = await this.writableAccount(accountId)
    const [existing] = await this.db
      .select({ source: s.source })
      .from(s)
      .where(and(eq(s.accountId, accountId), eq(s.date, date)))
    if (!existing) throw new NotFoundException('No snapshot on that date')
    if (existing.source === 'computed') {
      throw new BadRequestException(
        account.type === 'crypto'
          ? COMPUTED_VALUE_MESSAGE
          : LINES_VALUE_MESSAGE,
      )
    }
    await this.db.transaction(async (tx) => {
      await tx
        .delete(s)
        .where(
          and(
            eq(s.accountId, accountId),
            eq(s.date, date),
            eq(s.source, 'typed'),
          ),
        )
      // The lines value the day again once the typed value is gone.
      if (takesPositions(account)) {
        await revalue(tx, accountId, date, parisToday(now))
      }
    })
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
          // A typed value wins its day over a PEA's computed one (ADR 0006).
          set: {
            valueCents: sql`excluded.value_cents`,
            contributionsCents: sql`coalesce(excluded.contributions_cents, ${s.contributionsCents})`,
            source: 'typed',
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
    const crypto = account.type === 'crypto'
    const [stored, flows, live, basis, statements] = await Promise.all([
      this.snapshotsOf(this.db, accountId),
      this.linkedFlows(this.db, [account]),
      crypto && this.crypto
        ? this.crypto.live([accountId], now)
        : Promise.resolve(new Map<string, AccountHoldingsDto>()),
      crypto ? this.costBasis.load() : Promise.resolve(null),
      takesPositions(account)
        ? loadStatements(this.db, [accountId])
        : Promise.resolve(new Map<string, StoredStatement[]>()),
    ])
    const holdings = live.get(accountId) ?? null
    const today = parisToday(now)
    // A crypto account's last point is today's live value (#366), in place
    // of a value stored today before the daily close.
    const point = holdings?.snapshot ?? null
    const snapshots = point
      ? stored.filter((snapshot) => snapshot.date < point.date)
      : stored
    const series: SnapshotDto[] = point
      ? [...snapshots, { id: '', note: null, source: 'computed', ...point }]
      : snapshots
    const accountFlows = flows.get(accountId) ?? []
    const base = investedBaseOf(account)
    const invested = this.investedRule(
      account,
      stored,
      accountFlows,
      basis,
      statements.get(accountId),
    )
    const figures = this.figures(
      account,
      series,
      today,
      invested,
      accountFlows,
      holdings,
      basis,
    )
    return {
      accountId,
      type: account.type,
      ...figures,
      investedBase: base && { amountCents: base.cents, on: base.on },
      snapshots,
      live: point && {
        date: point.date,
        valueCents: point.valueCents,
        contributionsCents: figures.contributionsCents,
      },
      contributionsHistory: withInvested(series, invested).map((p) => ({
        date: p.date,
        contributionsCents: p.contributionsCents,
      })),
    }
  }

  /**
   * The one source of an account's invested amount (#370): a crypto
   * account's replay of its coins (#373), any other account's latest typed
   * point plus the transfers linked after it (`investedAt`).
   */
  private investedRule(
    account: { id: string; type: AccountType } & Parameters<
      typeof investedBaseOf
    >[0],
    stored: readonly SnapshotDto[],
    flows: readonly LinkedFlow[],
    basis: LoadedCostBasis | null,
    statements?: readonly Statement[],
  ): InvestedOn {
    if (account.type === 'crypto') {
      const linked = basis
        ? basis.links.filter(
            (link) => basis.movements.get(link.inId)?.accountId === account.id,
          ).length
        : 0
      return (day) => {
        const step = basis ? cryptoInvestedOn(basis, account.id, day) : null
        return step
          ? {
              investedCents: step.investedCents,
              source: 'coins',
              since: null,
              linkedCount: linked,
              unknownCostCount: step.unknown.length,
            }
          : null
      }
    }
    // Only typed figures: a value's contributions are never computed.
    const typed = stored.filter((snapshot) => snapshot.source === 'typed')
    const rule = investedOn(typed, investedBaseOf(account), flows)
    // A PEA with no invested amount at all takes its lines' cost (ADR 0006).
    return statements && statements.length > 0
      ? orElse(rule, (day) => linesInvestedOn(statements, day))
      : rule
  }

  /**
   * The figures of an account; a crypto account's gain counts only its
   * coins of known cost (#373), from today's live valuation when it has one.
   */
  private figures(
    account: { id: string; type: AccountType } & Parameters<
      typeof investedBaseOf
    >[0],
    series: readonly SnapshotDto[],
    today: string,
    invested: InvestedOn,
    flows: readonly LinkedFlow[],
    holdings: AccountHoldingsDto | null,
    basis: LoadedCostBasis | null,
  ): Performance & {
    unknownCost: AccountHoldingsDto['totals']['unknown']
    realised: AccountPerformanceDto['realised']
  } {
    const figures = computePerformance(
      series,
      account.type,
      today,
      invested,
      flows,
      investedBaseOf(account),
    )
    if (account.type !== 'crypto') {
      return { ...figures, unknownCost: [], realised: null }
    }
    const unknownCost = holdings?.totals.unknown ?? []
    let { gainCents } = figures
    if (holdings?.snapshot && figures.valueDate === holdings.snapshot.date) {
      gainCents = holdings.totals.gainCents
    }
    return {
      ...figures,
      unknownCostCount: holdings
        ? unknownCost.length
        : figures.unknownCostCount,
      gainCents,
      returnRate: simpleReturn(gainCents, figures.contributionsCents),
      unknownCost,
      realised: basis ? realisedGains(basis, account.id, today) : null,
    }
  }

  /**
   * What an account's invested amount, gain and rate are now and would be
   * with `dto` as its invested base (#360). Saves nothing.
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
   * Sets an account's invested base (#360): it wins from its day, the
   * contributions typed on its values staying as typed.
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

  /** Removes the invested base: what was typed and linked counts again. */
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
      await tx
        .update(accountsTable)
        .set({
          investedBaseCents: base?.cents ?? null,
          investedBaseOn: base?.on ?? null,
          updatedAt: now,
        })
        .where(eq(accountsTable.id, accountId))
      const flows = (await this.linkedFlows(tx, [account])).get(accountId) ?? []
      const snapshots = await this.snapshotsOf(tx, accountId)
      return investedFigures(account.type, snapshots, flows, base, today)
    })
  }

  /**
   * A writable account that takes an invested base: a PEA, a life insurance
   * or employee savings. A crypto account's cost follows its coins (#373).
   */
  private async baseAccount(
    accountId: string,
    executor: Executor,
  ): Promise<AccountWithBalance> {
    const account = await this.writableAccount(accountId, executor)
    if (!takesInvestedBase(account)) {
      throw new BadRequestException(
        'Only a PEA, a life insurance or employee savings take an invested base',
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
    const cryptoIds = accounts
      .filter((account) => account.type === 'crypto')
      .map((account) => account.id)
    // Crypto accounts read like their page: today's live value at the stored
    // prices and the replay of their coins (#366, #373).
    const [live, basis, statements] = await Promise.all([
      this.crypto
        ? this.crypto.live(cryptoIds, now)
        : Promise.resolve(new Map<string, AccountHoldingsDto>()),
      cryptoIds.length > 0 ? this.costBasis.load() : Promise.resolve(null),
      loadStatements(
        this.db,
        accounts.filter(takesPositions).map((account) => account.id),
      ),
    ])
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
      const stored = (byAccount.get(account.id) ?? []).map(toDto)
      const holdings = live.get(account.id) ?? null
      const point = holdings?.snapshot ?? null
      const series: SnapshotDto[] = point
        ? [
            ...stored.filter((snapshot) => snapshot.date < point.date),
            { id: '', note: null, source: 'computed', ...point },
          ]
        : stored
      const accountFlows = flows.get(account.id) ?? []
      const figures = this.figures(
        account,
        series,
        today,
        this.investedRule(
          account,
          stored,
          accountFlows,
          basis,
          statements.get(account.id),
        ),
        accountFlows,
        holdings,
        basis,
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
   * The bank transfers linked to each non-crypto account (#296), oldest
   * first: money paid into it (positive) or taken out of it (negative).
   */
  private async linkedFlows(
    executor: Executor,
    accounts: readonly { id: string; type: AccountType }[],
  ): Promise<Map<string, LinkedFlow[]>> {
    const byAccount = new Map<string, LinkedFlow[]>()
    const accountIds = accounts
      .filter((account) => account.type !== 'crypto')
      .map((account) => account.id)
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
  const typed = snapshots.filter((snapshot) => snapshot.source === 'typed')
  const figures = computePerformance(
    snapshots,
    type,
    today,
    investedOn(typed, base, flows),
    flows,
    base,
  )
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
